import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Player {
  name: string;
  isCaptain: boolean;
  isWicketKeeper: boolean;
  isViceCaptain: boolean;
  role: string | null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const { matchId, teamAId, teamBId, teamAName, teamAShortName, teamBName, teamBShortName, cricbuzzMatchId } = body;

    if (!matchId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Match ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[sync-rapidapi-playing-xi] Syncing for match: ${matchId}`);

    // Get site settings for RapidAPI key and endpoints
    const { data: settings, error: settingsError } = await supabase
      .from('site_settings')
      .select('rapidapi_key, rapidapi_enabled, rapidapi_endpoints')
      .limit(1)
      .single();

    if (settingsError || !settings?.rapidapi_key || !settings?.rapidapi_enabled) {
      console.error('[sync-rapidapi-playing-xi] RapidAPI not configured or disabled');
      return new Response(
        JSON.stringify({ success: false, error: 'RapidAPI is not configured or disabled' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const endpoints = settings.rapidapi_endpoints as Record<string, string> || {};
    const cricbuzzHost = endpoints.cricbuzz_host || 'cricbuzz-cricket.p.rapidapi.com';
    
    // Check if COMPLETE playing XI already exists
    const { data: existingPlayers } = await supabase
      .from('match_playing_xi')
      .select('id, team_id')
      .eq('match_id', matchId);

    const teamAPlayerCount = existingPlayers?.filter(p => p.team_id === teamAId).length || 0;
    const teamBPlayerCount = existingPlayers?.filter(p => p.team_id === teamBId).length || 0;

    if (teamAPlayerCount >= 11 && teamBPlayerCount >= 11) {
      console.log(`[sync-rapidapi-playing-xi] Playing XI already complete (11+11)`);
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Playing XI already complete (11+11)',
          alreadyExists: true,
          playersAdded: 0
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get Cricbuzz match ID if not provided
    let cbMatchId = cricbuzzMatchId;
    if (!cbMatchId) {
      const { data: matchData } = await supabase
        .from('matches')
        .select('cricbuzz_match_id, match_date')
        .eq('id', matchId)
        .single();
      
      cbMatchId = matchData?.cricbuzz_match_id;
    }

    // If still no Cricbuzz match ID, try to find it via search
    if (!cbMatchId) {
      console.log(`[sync-rapidapi-playing-xi] No Cricbuzz match ID, searching for match: ${teamAName} vs ${teamBName}`);
      
      // Try to find match in recent/live matches
      const searchEndpoints = [
        '/matches/v1/recent',
        '/matches/v1/live',
      ];
      
      const normalizeTeam = (name: string) => (name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const teamANorm = normalizeTeam(teamAName);
      const teamBNorm = normalizeTeam(teamBName);
      const teamAShortNorm = normalizeTeam(teamAShortName);
      const teamBShortNorm = normalizeTeam(teamBShortName);
      
      for (const endpoint of searchEndpoints) {
        if (cbMatchId) break;
        
        const searchUrl = `https://${cricbuzzHost}${endpoint}`;
        console.log(`[sync-rapidapi-playing-xi] Searching: ${searchUrl}`);
        
        try {
          const response = await fetch(searchUrl, {
            method: 'GET',
            headers: {
              'X-RapidAPI-Key': settings.rapidapi_key,
              'X-RapidAPI-Host': cricbuzzHost,
            },
          });
          
          if (response.ok) {
            const data = await response.json();
            
            // Parse response to find matching match
            const typeMatches = data.typeMatches || [];
            for (const typeMatch of typeMatches) {
              if (cbMatchId) break;
              
              const seriesMatches = typeMatch.seriesMatches || [];
              for (const series of seriesMatches) {
                if (cbMatchId) break;
                
                const seriesAdWrapper = series.seriesAdWrapper || series;
                const matches = seriesAdWrapper.matches || [];
                
                for (const match of matches) {
                  const matchInfo = match.matchInfo || match;
                  const team1 = matchInfo.team1 || {};
                  const team2 = matchInfo.team2 || {};
                  
                  const team1Name = normalizeTeam(team1.teamName || team1.name || '');
                  const team1Short = normalizeTeam(team1.teamSName || team1.shortName || '');
                  const team2Name = normalizeTeam(team2.teamName || team2.name || '');
                  const team2Short = normalizeTeam(team2.teamSName || team2.shortName || '');
                  
                  // Check if teams match
                  const team1Matches = team1Name.includes(teamANorm) || teamANorm.includes(team1Name) ||
                                       team1Short === teamAShortNorm || team1Name.includes(teamBNorm) || 
                                       teamBNorm.includes(team1Name) || team1Short === teamBShortNorm;
                  
                  const team2Matches = team2Name.includes(teamANorm) || teamANorm.includes(team2Name) ||
                                       team2Short === teamAShortNorm || team2Name.includes(teamBNorm) || 
                                       teamBNorm.includes(team2Name) || team2Short === teamBShortNorm;
                  
                  if (team1Matches && team2Matches) {
                    cbMatchId = matchInfo.matchId?.toString() || match.matchId?.toString();
                    console.log(`[sync-rapidapi-playing-xi] Found match: ${cbMatchId} - ${team1.teamName} vs ${team2.teamName}`);
                    
                    // Save the cricbuzz_match_id to the database for future use
                    if (cbMatchId) {
                      await supabase
                        .from('matches')
                        .update({ cricbuzz_match_id: cbMatchId })
                        .eq('id', matchId);
                      console.log(`[sync-rapidapi-playing-xi] Saved Cricbuzz match ID: ${cbMatchId}`);
                    }
                    break;
                  }
                }
              }
            }
          }
        } catch (error) {
          console.error(`[sync-rapidapi-playing-xi] Search error:`, error);
        }
      }
    }

    if (!cbMatchId) {
      console.log(`[sync-rapidapi-playing-xi] Could not find Cricbuzz match ID`);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Match not found in Cricbuzz. Make sure the match is live/recent, or manually set Cricbuzz Match ID in match settings.',
          playersAdded: 0
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[sync-rapidapi-playing-xi] Using Cricbuzz match ID: ${cbMatchId}`);

    // Try multiple endpoints to get Playing XI
    const playersToAdd: any[] = [];
    let teamAPlayers: Player[] = [];
    let teamBPlayers: Player[] = [];
    let foundData = false;

    // PRIMARY: Use /matches/v1/{matchId}/team endpoint (Official Squad Endpoint)
    const matchesTeamUrl = `https://${cricbuzzHost}/matches/v1/${cbMatchId}/team`;
    
    console.log(`[sync-rapidapi-playing-xi] Trying PRIMARY matches/team endpoint: ${matchesTeamUrl}`);
    
    try {
      const response = await fetch(matchesTeamUrl, {
        method: 'GET',
        headers: {
          'X-RapidAPI-Key': settings.rapidapi_key,
          'X-RapidAPI-Host': cricbuzzHost,
        },
      });

      if (response.ok) {
        const data = await response.json();
        console.log(`[sync-rapidapi-playing-xi] matches/team response keys:`, Object.keys(data).join(', '));
        console.log(`[sync-rapidapi-playing-xi] matches/team response sample:`, JSON.stringify(data).substring(0, 1000));
        
        // Parse the team data structure
        const result = parseMatchesTeamEndpoint(data, teamAName, teamAShortName, teamBName, teamBShortName);
        
        if (result.teamA.length >= 11 && result.teamB.length >= 11) {
          teamAPlayers = result.teamA;
          teamBPlayers = result.teamB;
          foundData = true;
          console.log(`[sync-rapidapi-playing-xi] Found ${teamAPlayers.length}+${teamBPlayers.length} from matches/team`);
        } else {
          console.log(`[sync-rapidapi-playing-xi] Partial data from matches/team: ${result.teamA.length}+${result.teamB.length}`);
          // Save partial if we have anything
          if (result.teamA.length > 0) teamAPlayers = result.teamA;
          if (result.teamB.length > 0) teamBPlayers = result.teamB;
        }
      } else {
        console.log(`[sync-rapidapi-playing-xi] matches/team endpoint returned: ${response.status}`);
      }
    } catch (error) {
      console.error(`[sync-rapidapi-playing-xi] matches/team endpoint error:`, error);
    }

    // FALLBACK 1: Try /mcenter/v1/{match_id}/hsquad if primary failed
    if (!foundData) {
      const squadEndpoint = endpoints.squad_endpoint || '/mcenter/v1/{match_id}/hsquad';
      const squadUrl = `https://${cricbuzzHost}${squadEndpoint.replace('{match_id}', cbMatchId)}`;
      
      console.log(`[sync-rapidapi-playing-xi] Trying FALLBACK hsquad endpoint: ${squadUrl}`);
      
      try {
        const response = await fetch(squadUrl, {
          method: 'GET',
          headers: {
            'X-RapidAPI-Key': settings.rapidapi_key,
            'X-RapidAPI-Host': cricbuzzHost,
          },
        });

        console.log(`[sync-rapidapi-playing-xi] hsquad endpoint returned: ${response.status}`);
        
        if (response.ok) {
          const data = await response.json();
          console.log(`[sync-rapidapi-playing-xi] hsquad response sample:`, JSON.stringify(data).substring(0, 800));
          console.log(`[sync-rapidapi-playing-xi] hsquad keys:`, Object.keys(data).join(', '));
          
          const result = parseSquadData(data, teamAName, teamAShortName, teamBName, teamBShortName);
          console.log(`[sync-rapidapi-playing-xi] hsquad parsed: TeamA=${result.teamA.length}, TeamB=${result.teamB.length}`);
          
          if (result.teamA.length >= 11 && result.teamB.length >= 11) {
            teamAPlayers = result.teamA;
            teamBPlayers = result.teamB;
            foundData = true;
            console.log(`[sync-rapidapi-playing-xi] Found ${teamAPlayers.length}+${teamBPlayers.length} from hsquad`);
          } else if (result.teamA.length > 0 || result.teamB.length > 0) {
            // Save partial data
            if (result.teamA.length > teamAPlayers.length) teamAPlayers = result.teamA;
            if (result.teamB.length > teamBPlayers.length) teamBPlayers = result.teamB;
          }
        }
      } catch (error) {
        console.error(`[sync-rapidapi-playing-xi] hsquad endpoint error:`, error);
      }
    }

    // FALLBACK 2: Try /matches/v1/{match_id} for match info with squads
    if (!foundData) {
      const matchInfoUrl = `https://${cricbuzzHost}/matches/v1/${cbMatchId}`;
      
      console.log(`[sync-rapidapi-playing-xi] Trying FALLBACK matches/info endpoint: ${matchInfoUrl}`);
      
      try {
        const response = await fetch(matchInfoUrl, {
          method: 'GET',
          headers: {
            'X-RapidAPI-Key': settings.rapidapi_key,
            'X-RapidAPI-Host': cricbuzzHost,
          },
        });

        if (response.ok) {
          const data = await response.json();
          console.log(`[sync-rapidapi-playing-xi] matches/info response keys:`, Object.keys(data).join(', '));
          
          const result = parseMatchInfoPlayers(data, teamAName, teamAShortName, teamBName, teamBShortName);
          if (result.teamA.length >= 11 && result.teamB.length >= 11) {
            teamAPlayers = result.teamA;
            teamBPlayers = result.teamB;
            foundData = true;
            console.log(`[sync-rapidapi-playing-xi] Found ${teamAPlayers.length}+${teamBPlayers.length} from matches/info`);
          }
        }
      } catch (error) {
        console.error(`[sync-rapidapi-playing-xi] matches/info endpoint error:`, error);
      }
    }

    // FALLBACK 3: Try /mcenter/v1/{match_id} endpoint
    if (!foundData) {
      const mcenterUrl = `https://${cricbuzzHost}/mcenter/v1/${cbMatchId}`;
      
      console.log(`[sync-rapidapi-playing-xi] Trying FALLBACK mcenter endpoint: ${mcenterUrl}`);
      
      try {
        const response = await fetch(mcenterUrl, {
          method: 'GET',
          headers: {
            'X-RapidAPI-Key': settings.rapidapi_key,
            'X-RapidAPI-Host': cricbuzzHost,
          },
        });

        if (response.ok) {
          const data = await response.json();
          console.log(`[sync-rapidapi-playing-xi] mcenter response keys:`, Object.keys(data).join(', '));
          
          const result = parseMatchInfoPlayers(data, teamAName, teamAShortName, teamBName, teamBShortName);
          if (result.teamA.length >= 11 && result.teamB.length >= 11) {
            teamAPlayers = result.teamA;
            teamBPlayers = result.teamB;
            foundData = true;
            console.log(`[sync-rapidapi-playing-xi] Found ${teamAPlayers.length}+${teamBPlayers.length} from mcenter`);
          }
        }
      } catch (error) {
        console.error(`[sync-rapidapi-playing-xi] mcenter endpoint error:`, error);
      }
    }

    // FALLBACK 4: Try SERIES SQUADS endpoint - best for pre-match data!
    // First get series ID from mcenter, then fetch full squads
    if (!foundData && (teamAPlayers.length < 11 || teamBPlayers.length < 11)) {
      console.log(`[sync-rapidapi-playing-xi] Trying SERIES SQUADS fallback...`);
      
      try {
        // First get the series ID from mcenter
        const mcenterUrl = `https://${cricbuzzHost}/mcenter/v1/${cbMatchId}`;
        const mcenterResponse = await fetch(mcenterUrl, {
          method: 'GET',
          headers: {
            'X-RapidAPI-Key': settings.rapidapi_key,
            'X-RapidAPI-Host': cricbuzzHost,
          },
        });

        if (mcenterResponse.ok) {
          const mcenterData = await mcenterResponse.json();
          const seriesId = mcenterData.seriesid || mcenterData.seriesId;
          
          if (seriesId) {
            console.log(`[sync-rapidapi-playing-xi] Found series ID: ${seriesId}, fetching series squads...`);
            
            // Fetch series squads
            const seriesSquadsUrl = `https://${cricbuzzHost}/series/v1/${seriesId}/squads`;
            console.log(`[sync-rapidapi-playing-xi] Calling: ${seriesSquadsUrl}`);
            
            const squadsResponse = await fetch(seriesSquadsUrl, {
              method: 'GET',
              headers: {
                'X-RapidAPI-Key': settings.rapidapi_key,
                'X-RapidAPI-Host': cricbuzzHost,
              },
            });

            console.log(`[sync-rapidapi-playing-xi] Series squads returned: ${squadsResponse.status}`);
            
            if (squadsResponse.ok) {
              const squadsData = await squadsResponse.json();
              console.log(`[sync-rapidapi-playing-xi] Series squads keys:`, Object.keys(squadsData).join(', '));
              console.log(`[sync-rapidapi-playing-xi] Series squads sample:`, JSON.stringify(squadsData).substring(0, 1500));
              
              const result = parseSeriesSquads(squadsData, teamAName, teamAShortName, teamBName, teamBShortName, cricbuzzHost, settings.rapidapi_key);
              
              // If parseSeriesSquads returns squad IDs, we need to fetch individual squad details
              if (result.teamASquadId || result.teamBSquadId) {
                console.log(`[sync-rapidapi-playing-xi] Found squad IDs - TeamA: ${result.teamASquadId}, TeamB: ${result.teamBSquadId}`);
                
                // Fetch individual squad details
                if (result.teamASquadId && teamAPlayers.length < 11) {
                  const squadDetailUrl = `https://${cricbuzzHost}/series/v1/${seriesId}/squads/${result.teamASquadId}`;
                  console.log(`[sync-rapidapi-playing-xi] Fetching TeamA squad: ${squadDetailUrl}`);
                  
                  const detailResponse = await fetch(squadDetailUrl, {
                    method: 'GET',
                    headers: {
                      'X-RapidAPI-Key': settings.rapidapi_key,
                      'X-RapidAPI-Host': cricbuzzHost,
                    },
                  });
                  
                  if (detailResponse.ok) {
                    const detailData = await detailResponse.json();
                    console.log(`[sync-rapidapi-playing-xi] TeamA squad detail keys:`, Object.keys(detailData).join(', '));
                    console.log(`[sync-rapidapi-playing-xi] TeamA squad sample:`, JSON.stringify(detailData).substring(0, 1000));
                    
                    const players = parseSquadDetailPlayers(detailData);
                    console.log(`[sync-rapidapi-playing-xi] TeamA parsed: ${players.length} players`);
                    if (players.length >= 11) {
                      teamAPlayers = players;
                    }
                  }
                }
                
                if (result.teamBSquadId && teamBPlayers.length < 11) {
                  const squadDetailUrl = `https://${cricbuzzHost}/series/v1/${seriesId}/squads/${result.teamBSquadId}`;
                  console.log(`[sync-rapidapi-playing-xi] Fetching TeamB squad: ${squadDetailUrl}`);
                  
                  const detailResponse = await fetch(squadDetailUrl, {
                    method: 'GET',
                    headers: {
                      'X-RapidAPI-Key': settings.rapidapi_key,
                      'X-RapidAPI-Host': cricbuzzHost,
                    },
                  });
                  
                  if (detailResponse.ok) {
                    const detailData = await detailResponse.json();
                    console.log(`[sync-rapidapi-playing-xi] TeamB squad detail keys:`, Object.keys(detailData).join(', '));
                    console.log(`[sync-rapidapi-playing-xi] TeamB squad sample:`, JSON.stringify(detailData).substring(0, 1000));
                    
                    const players = parseSquadDetailPlayers(detailData);
                    console.log(`[sync-rapidapi-playing-xi] TeamB parsed: ${players.length} players`);
                    if (players.length >= 11) {
                      teamBPlayers = players;
                    }
                  }
                }
                
                // Check if we now have complete data
                if (teamAPlayers.length >= 11 && teamBPlayers.length >= 11) {
                  foundData = true;
                  console.log(`[sync-rapidapi-playing-xi] Found ${teamAPlayers.length}+${teamBPlayers.length} from series squads`);
                }
              } else if (result.teamA.length > 0 || result.teamB.length > 0) {
                // Direct player data from series squads
                if (result.teamA.length >= 11 && result.teamB.length >= 11) {
                  teamAPlayers = result.teamA;
                  teamBPlayers = result.teamB;
                  foundData = true;
                  console.log(`[sync-rapidapi-playing-xi] Found ${teamAPlayers.length}+${teamBPlayers.length} from series squads direct`);
                } else {
                  if (result.teamA.length > teamAPlayers.length) teamAPlayers = result.teamA;
                  if (result.teamB.length > teamBPlayers.length) teamBPlayers = result.teamB;
                }
              }
            }
          } else {
            console.log(`[sync-rapidapi-playing-xi] No series ID found in mcenter response`);
          }
        }
      } catch (error) {
        console.error(`[sync-rapidapi-playing-xi] Series squads error:`, error);
      }
    }

    // FALLBACK 5: Try scorecard for LIVE/COMPLETED matches (when squad endpoints fail)
    // This can extract players from batting/bowling data
    if (!foundData && (teamAPlayers.length < 11 || teamBPlayers.length < 11)) {
      const scorecardUrl = `https://${cricbuzzHost}/mcenter/v1/${cbMatchId}/scard`;
      
      console.log(`[sync-rapidapi-playing-xi] Trying FALLBACK scorecard endpoint: ${scorecardUrl}`);
      
      try {
        const response = await fetch(scorecardUrl, {
          method: 'GET',
          headers: {
            'X-RapidAPI-Key': settings.rapidapi_key,
            'X-RapidAPI-Host': cricbuzzHost,
          },
        });

        console.log(`[sync-rapidapi-playing-xi] scorecard endpoint returned: ${response.status}`);
        
        if (response.ok) {
          const data = await response.json();
          console.log(`[sync-rapidapi-playing-xi] scorecard keys:`, Object.keys(data).join(', '));
          
          const result = parseScorecardPlayers(data, teamAName, teamAShortName, teamBName, teamBShortName);
          console.log(`[sync-rapidapi-playing-xi] scorecard parsed: TeamA=${result.teamA.length}, TeamB=${result.teamB.length}`);
          
          if (result.teamA.length >= 11 && result.teamB.length >= 11) {
            teamAPlayers = result.teamA;
            teamBPlayers = result.teamB;
            foundData = true;
            console.log(`[sync-rapidapi-playing-xi] Found ${teamAPlayers.length}+${teamBPlayers.length} from scorecard`);
          } else if (result.teamA.length > teamAPlayers.length || result.teamB.length > teamBPlayers.length) {
            // Merge with existing partial data
            if (result.teamA.length > teamAPlayers.length) teamAPlayers = result.teamA;
            if (result.teamB.length > teamBPlayers.length) teamBPlayers = result.teamB;
            console.log(`[sync-rapidapi-playing-xi] Scorecard partial: TeamA=${teamAPlayers.length}, TeamB=${teamBPlayers.length}`);
          }
        }
      } catch (error) {
        console.error(`[sync-rapidapi-playing-xi] scorecard endpoint error:`, error);
      }
    }

    // Check final status
    const totalPlayers = teamAPlayers.length + teamBPlayers.length;
    console.log(`[sync-rapidapi-playing-xi] Final player count: TeamA=${teamAPlayers.length}, TeamB=${teamBPlayers.length}`);

    // Require at least 11+11 for complete data
    if (!foundData || teamAPlayers.length < 11 || teamBPlayers.length < 11) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Playing XI not available yet from API. Team A: ${teamAPlayers.length}/11, Team B: ${teamBPlayers.length}/11 players found. Try again later or use Bulk Add.`,
          playersAdded: 0,
          teamAPlayers: teamAPlayers.length,
          teamBPlayers: teamBPlayers.length
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Delete existing incomplete data
    if (existingPlayers && existingPlayers.length > 0) {
      console.log(`[sync-rapidapi-playing-xi] Deleting ${existingPlayers.length} incomplete players`);
      await supabase
        .from('match_playing_xi')
        .delete()
        .eq('match_id', matchId);
    }

    // Add Team A players
    let battingOrder = 1;
    for (const player of teamAPlayers.slice(0, 11)) {
      playersToAdd.push({
        match_id: matchId,
        team_id: teamAId,
        player_name: player.name,
        player_role: player.role,
        is_captain: player.isCaptain,
        is_vice_captain: player.isViceCaptain,
        is_wicket_keeper: player.isWicketKeeper,
        batting_order: battingOrder++,
      });
    }

    // Add Team B players
    battingOrder = 1;
    for (const player of teamBPlayers.slice(0, 11)) {
      playersToAdd.push({
        match_id: matchId,
        team_id: teamBId,
        player_name: player.name,
        player_role: player.role,
        is_captain: player.isCaptain,
        is_vice_captain: player.isViceCaptain,
        is_wicket_keeper: player.isWicketKeeper,
        batting_order: battingOrder++,
      });
    }

    // Insert players
    if (playersToAdd.length > 0) {
      const { error: insertError } = await supabase
        .from('match_playing_xi')
        .insert(playersToAdd);

      if (insertError) {
        console.error('[sync-rapidapi-playing-xi] Insert error:', insertError);
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to save players', playersAdded: 0 }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    console.log(`[sync-rapidapi-playing-xi] Successfully added ${playersToAdd.length} players`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        playersAdded: playersToAdd.length,
        teamAPlayers: teamAPlayers.length,
        teamBPlayers: teamBPlayers.length,
        message: `Added ${playersToAdd.length} players from RapidAPI Cricbuzz`
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[sync-rapidapi-playing-xi] Error:', errorMessage);
    
    return new Response(
      JSON.stringify({ success: false, error: errorMessage, playersAdded: 0 }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Parse squad data from /mcenter/v1/{match_id}/hsquad
function parseSquadData(data: any, teamAName: string, teamAShort: string, teamBName: string, teamBShort: string): { teamA: Player[], teamB: Player[] } {
  const teamA: Player[] = [];
  const teamB: Player[] = [];
  
  const normalizeTeam = (name: string) => (name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const teamANorm = normalizeTeam(teamAName);
  const teamAShortNorm = normalizeTeam(teamAShort);
  const teamBNorm = normalizeTeam(teamBName);
  const teamBShortNorm = normalizeTeam(teamBShort);

  // Try different data structures
  const squads = data.squads || data.squad || data.players || data.team || [];
  
  // Also check for team1/team2 structure
  if (data.team1 || data.team2) {
    const team1Players = extractPlayersFromTeam(data.team1);
    const team2Players = extractPlayersFromTeam(data.team2);
    
    const team1Name = normalizeTeam(data.team1?.teamName || data.team1?.name || '');
    
    if (team1Name.includes(teamANorm) || team1Name.includes(teamAShortNorm) || 
        teamANorm.includes(team1Name) || teamAShortNorm === team1Name) {
      teamA.push(...team1Players);
      teamB.push(...team2Players);
    } else {
      teamB.push(...team1Players);
      teamA.push(...team2Players);
    }
    return { teamA: teamA.slice(0, 11), teamB: teamB.slice(0, 11) };
  }

  // Handle array of squads
  if (Array.isArray(squads)) {
    for (const squad of squads) {
      const squadTeamName = normalizeTeam(squad.teamName || squad.name || squad.team || '');
      const players = extractPlayersFromTeam(squad);
      
      const isTeamA = squadTeamName.includes(teamANorm) || squadTeamName.includes(teamAShortNorm) ||
                      teamANorm.includes(squadTeamName) || teamAShortNorm === squadTeamName;
      
      if (isTeamA && teamA.length === 0) {
        teamA.push(...players);
      } else if (!isTeamA && teamB.length === 0) {
        teamB.push(...players);
      } else if (teamA.length === 0) {
        teamA.push(...players);
      } else if (teamB.length === 0) {
        teamB.push(...players);
      }
    }
  }

  return { teamA: teamA.slice(0, 11), teamB: teamB.slice(0, 11) };
}

// Extract players from a team object
function extractPlayersFromTeam(team: any): Player[] {
  if (!team) return [];
  
  const players: Player[] = [];
  
  // Try different player array locations
  const playerArrays = [
    team.playingXI,
    team.playing11,
    team.playingEleven,
    team.squad,
    team.players,
    team.player,
    team.xi,
  ];
  
  for (const arr of playerArrays) {
    if (Array.isArray(arr) && arr.length > 0) {
      for (const p of arr) {
        const player = extractPlayerInfo(p);
        if (player) {
          players.push(player);
        }
      }
      if (players.length >= 11) break;
    }
  }
  
  return players;
}

// Extract player info from various formats
function extractPlayerInfo(p: any): Player | null {
  if (!p) return null;
  
  let name = '';
  let isCaptain = false;
  let isWicketKeeper = false;
  let isViceCaptain = false;
  let role: string | null = null;
  
  if (typeof p === 'string') {
    name = p;
  } else if (typeof p === 'object') {
    name = p.name || p.fullName || p.playerName || p.displayName || p.shortName || '';
    isCaptain = p.isCaptain === true || p.captain === true || p.isC === true || 
                (typeof p.role === 'string' && p.role.toLowerCase().includes('captain'));
    isWicketKeeper = p.isWicketkeeper === true || p.isKeeper === true || p.isWk === true ||
                     (typeof p.role === 'string' && p.role.toLowerCase().includes('keeper'));
    isViceCaptain = p.isViceCaptain === true || p.isVc === true;
    role = p.role || p.playingRole || p.playerRole || null;
  }
  
  // Clean up name
  name = cleanPlayerName(name);
  
  if (!name || name.length < 3) return null;
  
  // Check for captain/keeper markers in name
  if (name.toLowerCase().includes('(c)') || name.endsWith(' c')) {
    isCaptain = true;
    name = name.replace(/\s*\(c\)\s*/gi, '').replace(/\s+c$/i, '').trim();
  }
  if (name.toLowerCase().includes('(wk)') || name.endsWith(' wk')) {
    isWicketKeeper = true;
    name = name.replace(/\s*\(wk\)\s*/gi, '').replace(/\s+wk$/i, '').trim();
  }
  
  return { name, isCaptain, isWicketKeeper, isViceCaptain, role };
}

// Parse team-specific endpoint data from /mcenter/v1/{match_id}/team/{num}
function parseTeamEndpointData(data: any): Player[] {
  const players: Player[] = [];
  const seen = new Set<string>();
  
  // This endpoint returns structure like:
  // { "player": [ { "id": "xxx", "name": "Player Name", "role": "Batsman", "isCaptain": true, ... } ] }
  // Or: { "players": [...] }
  // Or: { "squad": { "player": [...] } }
  
  const playerArrays = [
    data.player,           // Most common: { player: [...] }
    data.players,          // Alternative
    data.playingXI,
    data.playing11,
    data.squad?.player,
    data.squad?.players,
    data.team?.player,
    data.team?.players,
  ];
  
  for (const arr of playerArrays) {
    if (Array.isArray(arr) && arr.length > 0) {
      console.log(`[parseTeamEndpointData] Found array with ${arr.length} items`);
      
      for (const p of arr) {
        const player = extractPlayerInfoV2(p);
        if (player && !seen.has(player.name.toLowerCase())) {
          seen.add(player.name.toLowerCase());
          players.push(player);
        }
      }
      
      if (players.length >= 11) break;
    }
  }
  
  // If still no players, try to recursively search the response
  if (players.length === 0) {
    const foundPlayers = findPlayersInObject(data);
    for (const p of foundPlayers) {
      if (!seen.has(p.name.toLowerCase())) {
        seen.add(p.name.toLowerCase());
        players.push(p);
      }
    }
  }
  
  return players;
}

// Enhanced player info extraction for /team/{num} endpoint
function extractPlayerInfoV2(p: any): Player | null {
  if (!p) return null;
  
  let name = '';
  let isCaptain = false;
  let isWicketKeeper = false;
  let isViceCaptain = false;
  let role: string | null = null;
  
  if (typeof p === 'string') {
    name = p;
  } else if (typeof p === 'object') {
    // Try various name fields
    name = p.name || p.fullName || p.nickName || p.shortName || p.playerName || p.displayName || '';
    
    // Captain detection
    isCaptain = p.isCaptain === true || p.captain === true || p.isC === true ||
                p.isCaptain === 'true' || p.captain === 'true';
    
    // Wicket keeper detection
    isWicketKeeper = p.isKeeper === true || p.isWicketkeeper === true || 
                     p.isWk === true || p.keeper === true ||
                     p.isKeeper === 'true' || p.isWk === 'true';
    
    // Vice captain detection  
    isViceCaptain = p.isViceCaptain === true || p.isVc === true ||
                    p.isViceCaptain === 'true' || p.isVc === 'true';
    
    // Role
    role = p.role || p.playingRole || p.playerRole || null;
    
    // Check role string for captain/keeper
    if (typeof role === 'string') {
      const roleLower = role.toLowerCase();
      if (roleLower.includes('captain') || roleLower.includes('(c)')) {
        isCaptain = true;
      }
      if (roleLower.includes('keeper') || roleLower.includes('wicket') || roleLower.includes('(wk)')) {
        isWicketKeeper = true;
      }
    }
  }
  
  // Clean up name
  name = cleanPlayerName(name);
  
  if (!name || name.length < 2) return null;
  
  // Check for captain/keeper markers in name
  const nameLower = name.toLowerCase();
  if (nameLower.includes('(c)') || nameLower.endsWith(' c')) {
    isCaptain = true;
    name = name.replace(/\s*\(c\)\s*/gi, '').replace(/\s+c$/i, '').trim();
  }
  if (nameLower.includes('(wk)') || nameLower.endsWith(' wk')) {
    isWicketKeeper = true;
    name = name.replace(/\s*\(wk\)\s*/gi, '').replace(/\s+wk$/i, '').trim();
  }
  
  return { name, isCaptain, isWicketKeeper, isViceCaptain, role };
}

// Recursively find players in a nested object
function findPlayersInObject(obj: any, depth = 0): Player[] {
  const players: Player[] = [];
  if (!obj || depth > 5) return players;
  
  if (Array.isArray(obj)) {
    for (const item of obj) {
      // Check if item looks like a player
      if (item && typeof item === 'object' && (item.name || item.fullName || item.playerName)) {
        const player = extractPlayerInfoV2(item);
        if (player) players.push(player);
      } else {
        players.push(...findPlayersInObject(item, depth + 1));
      }
    }
  } else if (typeof obj === 'object') {
    for (const key of Object.keys(obj)) {
      if (['player', 'players', 'playingXI', 'squad', 'playing11'].includes(key)) {
        const arr = obj[key];
        if (Array.isArray(arr)) {
          for (const item of arr) {
            const player = extractPlayerInfoV2(item);
            if (player) players.push(player);
          }
        }
      } else {
        players.push(...findPlayersInObject(obj[key], depth + 1));
      }
    }
  }
  
  return players;
}

// Parse team-specific endpoint data (legacy)
function parseTeamPlayers(data: any): Player[] {
  return parseTeamEndpointData(data);
}

// Parse scorecard data to extract players
function parseScorecardPlayers(data: any, teamAName: string, teamAShort: string, teamBName: string, teamBShort: string): { teamA: Player[], teamB: Player[] } {
  const teamA: Player[] = [];
  const teamB: Player[] = [];
  const seenA = new Set<string>();
  const seenB = new Set<string>();
  
  const normalizeTeam = (name: string) => (name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const teamANorm = normalizeTeam(teamAName);
  const teamAShortNorm = normalizeTeam(teamAShort);
  const teamBNorm = normalizeTeam(teamBName);
  const teamBShortNorm = normalizeTeam(teamBShort);

  // Try to find innings data - handle both "scoreCard" and "scorecard" (case-insensitive)
  const innings = data.scoreCard || data.scorecard || data.innings || data.inningsData || [];
  
  console.log(`[parseScorecardPlayers] Found ${Array.isArray(innings) ? innings.length : 0} innings`);
  
  // Track which teams we've assigned to which position
  let firstInningsTeam: string | null = null;
  let firstIsTeamA: boolean | null = null;
  
  for (const inn of (Array.isArray(innings) ? innings : [])) {
    // Get batting team name from various fields
    const batTeamName = inn.batTeamName || inn.batTeamSName || inn.battingTeam || '';
    const inningsTeam = normalizeTeam(batTeamName);
    
    console.log(`[parseScorecardPlayers] Innings ${inn.inningsid || inn.inningsId || '?'}: batTeam="${batTeamName}"`);
    
    // Determine if this is team A or B based on name matching
    let isTeamA: boolean;
    
    if (firstInningsTeam === null) {
      // First innings - determine based on team name matching
      const matchesTeamA = inningsTeam.includes(teamANorm) || teamANorm.includes(inningsTeam) ||
                           inningsTeam.includes(teamAShortNorm) || inningsTeam === teamAShortNorm;
      const matchesTeamB = inningsTeam.includes(teamBNorm) || teamBNorm.includes(inningsTeam) ||
                           inningsTeam.includes(teamBShortNorm) || inningsTeam === teamBShortNorm;
      
      isTeamA = matchesTeamA && !matchesTeamB;
      firstInningsTeam = inningsTeam;
      firstIsTeamA = isTeamA;
    } else {
      // Second innings - assign to opposite team
      isTeamA = !firstIsTeamA;
    }
    
    // Get batsmen - try multiple field names used by Cricbuzz API
    // The response uses "batsman" (singular) not "batsmen"
    const batsmen = inn.batsman || inn.batsmen || inn.batTeamDetails?.batsmenData || inn.batting || [];
    const batsmenArr = typeof batsmen === 'object' && !Array.isArray(batsmen) ? Object.values(batsmen) : batsmen;
    
    console.log(`[parseScorecardPlayers] Found ${Array.isArray(batsmenArr) ? batsmenArr.length : 0} batsmen`);
    
    for (const b of (Array.isArray(batsmenArr) ? batsmenArr : [])) {
      const player = extractScorecardPlayer(b);
      if (player) {
        if (isTeamA && !seenA.has(player.name.toLowerCase()) && teamA.length < 11) {
          seenA.add(player.name.toLowerCase());
          teamA.push(player);
        } else if (!isTeamA && !seenB.has(player.name.toLowerCase()) && teamB.length < 11) {
          seenB.add(player.name.toLowerCase());
          teamB.push(player);
        }
      }
    }
    
    // Get bowlers (they belong to the OTHER team)
    // The response uses "bowler" (singular) not "bowlers"
    const bowlers = inn.bowler || inn.bowlers || inn.bowlTeamDetails?.bowlersData || inn.bowling || [];
    const bowlersArr = typeof bowlers === 'object' && !Array.isArray(bowlers) ? Object.values(bowlers) : bowlers;
    
    console.log(`[parseScorecardPlayers] Found ${Array.isArray(bowlersArr) ? bowlersArr.length : 0} bowlers`);
    
    for (const b of (Array.isArray(bowlersArr) ? bowlersArr : [])) {
      const player = extractScorecardPlayer(b);
      if (player) {
        // Bowlers belong to the opposite team
        if (!isTeamA && !seenA.has(player.name.toLowerCase()) && teamA.length < 11) {
          seenA.add(player.name.toLowerCase());
          teamA.push(player);
        } else if (isTeamA && !seenB.has(player.name.toLowerCase()) && teamB.length < 11) {
          seenB.add(player.name.toLowerCase());
          teamB.push(player);
        }
      }
    }
  }
  
  console.log(`[parseScorecardPlayers] Final: TeamA=${teamA.length}, TeamB=${teamB.length}`);
  
  return { teamA, teamB };
}

// Extract player from scorecard entry (batsman/bowler)
function extractScorecardPlayer(p: any): Player | null {
  if (!p) return null;
  
  // Cricbuzz scorecard structure: { id, name, nickname, iscaptain, iskeeper, ... }
  let name = p.name || p.nickname || p.fullName || p.shortName || '';
  const isCaptain = p.iscaptain === true || p.isCaptain === true || p.captain === true;
  const isWicketKeeper = p.iskeeper === true || p.isKeeper === true || p.keeper === true;
  const isViceCaptain = p.isvicecaptain === true || p.isViceCaptain === true;
  
  // Clean up name
  name = cleanPlayerName(name);
  
  if (!name || name.length < 2) return null;
  
  return { name, isCaptain, isWicketKeeper, isViceCaptain, role: null };
}

// Parse match info endpoint data for playing XI
function parseMatchInfoPlayers(data: any, teamAName: string, teamAShort: string, teamBName: string, teamBShort: string): { teamA: Player[], teamB: Player[] } {
  const teamA: Player[] = [];
  const teamB: Player[] = [];
  
  const normalizeTeam = (name: string) => (name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const teamANorm = normalizeTeam(teamAName);
  const teamAShortNorm = normalizeTeam(teamAShort);
  const teamBNorm = normalizeTeam(teamBName);
  const teamBShortNorm = normalizeTeam(teamBShort);

  // Try matchInfo structure
  const matchInfo = data.matchInfo || data.match || data;
  
  // Check for team1/team2 with players/squads
  const team1Data = matchInfo.team1 || data.team1;
  const team2Data = matchInfo.team2 || data.team2;
  
  if (team1Data && team2Data) {
    const team1Name = normalizeTeam(team1Data.teamName || team1Data.name || '');
    const team2Name = normalizeTeam(team2Data.teamName || team2Data.name || '');
    
    // Determine which is teamA and which is teamB
    const team1IsTeamA = team1Name.includes(teamANorm) || teamANorm.includes(team1Name) ||
                         team1Name === teamAShortNorm || teamAShortNorm === team1Name.replace('u19', '');
    
    const team1Players = extractPlayersFromTeam(team1Data);
    const team2Players = extractPlayersFromTeam(team2Data);
    
    console.log(`[parseMatchInfoPlayers] team1: ${team1Name} (${team1Players.length} players), team2: ${team2Name} (${team2Players.length} players)`);
    
    if (team1IsTeamA) {
      teamA.push(...team1Players);
      teamB.push(...team2Players);
    } else {
      teamB.push(...team1Players);
      teamA.push(...team2Players);
    }
  }

  // Also try to find players in various other locations
  const possiblePlayerLocations = [
    data.players,
    data.playingXI,
    matchInfo.players,
    matchInfo.playingXI,
    data.squad,
    matchInfo.squad,
  ];

  for (const location of possiblePlayerLocations) {
    if (location && (teamA.length < 11 || teamB.length < 11)) {
      // Handle team1/team2 structure within
      if (location.team1 || location.team2) {
        const t1 = extractPlayersFromTeam(location.team1);
        const t2 = extractPlayersFromTeam(location.team2);
        if (teamA.length < 11) teamA.push(...t1.slice(0, 11 - teamA.length));
        if (teamB.length < 11) teamB.push(...t2.slice(0, 11 - teamB.length));
      }
      
      // Handle array of players
      if (Array.isArray(location)) {
        for (const p of location) {
          const player = extractPlayerInfo(p);
          if (player) {
            const pTeamName = normalizeTeam(p.teamName || p.team || '');
            const isTeamA = pTeamName.includes(teamANorm) || teamANorm.includes(pTeamName) ||
                           pTeamName === teamAShortNorm;
            
            if (isTeamA && teamA.length < 11) {
              teamA.push(player);
            } else if (!isTeamA && teamB.length < 11) {
              teamB.push(player);
            }
          }
        }
      }
    }
  }

  return { teamA: teamA.slice(0, 11), teamB: teamB.slice(0, 11) };
}

// Clean player name
function cleanPlayerName(name: string): string {
  return (name || '')
    .replace(/\s*\(c\)\s*/gi, '')
    .replace(/\s*\(wk\)\s*/gi, '')
    .replace(/\s*\(vc\)\s*/gi, '')
    .replace(/\s*captain\s*/gi, '')
    .replace(/\s*wicket-?keeper\s*/gi, '')
    .replace(/\s*†\s*/g, '')
    .replace(/\s*\*\s*/g, '')
    .replace(/^\d+\.\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Extract players from liveScore endpoint data
function extractPlayersFromLiveScore(data: any): Player[] {
  const players: Player[] = [];
  const seen = new Set<string>();
  
  // Try to find batsmen on crease
  const batsmenOnCrease = data.batsmenStriker || data.batsmenNonStriker || 
                          data.batsman || data.batsmanStriker || data.batsmanNonStriker;
  
  if (batsmenOnCrease) {
    const arr = Array.isArray(batsmenOnCrease) ? batsmenOnCrease : [batsmenOnCrease];
    for (const b of arr) {
      if (b && b.batName) {
        const name = cleanPlayerName(b.batName);
        if (name && !seen.has(name.toLowerCase())) {
          seen.add(name.toLowerCase());
          players.push({ name, isCaptain: false, isWicketKeeper: false, isViceCaptain: false, role: null });
        }
      }
    }
  }
  
  // Try to find current bowler
  const bowler = data.bowlerStriker || data.bowler;
  if (bowler && bowler.bowlName) {
    const name = cleanPlayerName(bowler.bowlName);
    if (name && !seen.has(name.toLowerCase())) {
      seen.add(name.toLowerCase());
      players.push({ name, isCaptain: false, isWicketKeeper: false, isViceCaptain: false, role: null });
    }
  }
  
  // Try various player arrays
  const playerArrays = [
    data.batTeam?.batsmen,
    data.bowlTeam?.bowlers,
    data.overSummaryList,
  ];
  
  for (const arr of playerArrays) {
    if (Array.isArray(arr)) {
      for (const item of arr) {
        const name = cleanPlayerName(item.batName || item.bowlName || item.name || '');
        if (name && !seen.has(name.toLowerCase())) {
          seen.add(name.toLowerCase());
          players.push({ name, isCaptain: false, isWicketKeeper: false, isViceCaptain: false, role: null });
        }
      }
    }
  }
  
  return players;
}

// Extract players from commentary endpoint data
function extractPlayersFromCommentary(data: any): Player[] {
  const players: Player[] = [];
  const seen = new Set<string>();
  
  // Try to find players in commentary lines
  const commLines = data.commentaryList || data.commentary || data.comms || [];
  
  for (const comm of (Array.isArray(commLines) ? commLines : [])) {
    // Extract batsman name
    const batsmanName = comm.batsmanName || comm.batName || comm.striker || '';
    if (batsmanName) {
      const name = cleanPlayerName(batsmanName);
      if (name && name.length >= 3 && !seen.has(name.toLowerCase())) {
        seen.add(name.toLowerCase());
        players.push({ name, isCaptain: false, isWicketKeeper: false, isViceCaptain: false, role: null });
      }
    }
    
    // Extract bowler name
    const bowlerName = comm.bowlerName || comm.bowlName || comm.bowler || '';
    if (bowlerName) {
      const name = cleanPlayerName(bowlerName);
      if (name && name.length >= 3 && !seen.has(name.toLowerCase())) {
        seen.add(name.toLowerCase());
        players.push({ name, isCaptain: false, isWicketKeeper: false, isViceCaptain: false, role: null });
      }
    }
  }
  
  // Also check for players in match header info
  const matchHeader = data.matchHeader || data.header || {};
  const playerArrays = [
    matchHeader.playingXI?.team1,
    matchHeader.playingXI?.team2,
  ];
  
  for (const arr of playerArrays) {
    if (Array.isArray(arr)) {
      for (const item of arr) {
        const name = cleanPlayerName(typeof item === 'string' ? item : (item.name || item.fullName || ''));
        if (name && name.length >= 3 && !seen.has(name.toLowerCase())) {
          seen.add(name.toLowerCase());
          players.push({ name, isCaptain: false, isWicketKeeper: false, isViceCaptain: false, role: null });
        }
      }
    }
  }
  
  return players;
}

// Parse /matches/v1/{matchId}/team endpoint response
function parseMatchesTeamEndpoint(data: any, teamAName: string, teamAShort: string, teamBName: string, teamBShort: string): { teamA: Player[], teamB: Player[] } {
  const teamA: Player[] = [];
  const teamB: Player[] = [];
  const seenA = new Set<string>();
  const seenB = new Set<string>();
  
  const normalizeTeam = (name: string) => (name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const teamANorm = normalizeTeam(teamAName);
  const teamAShortNorm = normalizeTeam(teamAShort);
  const teamBNorm = normalizeTeam(teamBName);
  const teamBShortNorm = normalizeTeam(teamBShort);

  console.log(`[parseMatchesTeamEndpoint] Looking for teams: A=${teamAName}/${teamAShort}, B=${teamBName}/${teamBShort}`);

  // Check for team1, team2 structure
  const team1 = data.team1 || data.matchTeam1 || {};
  const team2 = data.team2 || data.matchTeam2 || {};
  
  // Check for players array directly
  if (data.team1Players || data.team2Players) {
    const team1Players = extractPlayersFromArray(data.team1Players || []);
    const team2Players = extractPlayersFromArray(data.team2Players || []);
    
    // Match teams by name
    const team1Name = normalizeTeam(data.team1Name || data.team1?.teamName || '');
    if (team1Name.includes(teamANorm) || teamANorm.includes(team1Name) || team1Name === teamAShortNorm) {
      return { teamA: team1Players.slice(0, 11), teamB: team2Players.slice(0, 11) };
    } else {
      return { teamA: team2Players.slice(0, 11), teamB: team1Players.slice(0, 11) };
    }
  }

  // Handle structure: { team1: { player: [...] }, team2: { player: [...] } }
  if (team1.player || team1.players || team2.player || team2.players) {
    const team1Players = extractPlayersFromArray(team1.player || team1.players || []);
    const team2Players = extractPlayersFromArray(team2.player || team2.players || []);
    
    const team1Name = normalizeTeam(team1.teamName || team1.name || team1.teamSName || '');
    console.log(`[parseMatchesTeamEndpoint] team1 name: ${team1Name}, players: ${team1Players.length}`);
    console.log(`[parseMatchesTeamEndpoint] team2 players: ${team2Players.length}`);
    
    if (team1Name.includes(teamANorm) || teamANorm.includes(team1Name) || team1Name === teamAShortNorm) {
      return { teamA: team1Players.slice(0, 11), teamB: team2Players.slice(0, 11) };
    } else {
      return { teamA: team2Players.slice(0, 11), teamB: team1Players.slice(0, 11) };
    }
  }

  // Handle structure: { players: { team1: [...], team2: [...] } }
  if (data.players && (data.players.team1 || data.players.team2)) {
    const team1Players = extractPlayersFromArray(data.players.team1 || []);
    const team2Players = extractPlayersFromArray(data.players.team2 || []);
    return { teamA: team1Players.slice(0, 11), teamB: team2Players.slice(0, 11) };
  }

  // Handle array of team objects
  if (Array.isArray(data.teams)) {
    for (const team of data.teams) {
      const teamName = normalizeTeam(team.teamName || team.name || team.teamSName || '');
      const players = extractPlayersFromArray(team.player || team.players || team.playingXI || []);
      
      console.log(`[parseMatchesTeamEndpoint] Found team: ${teamName} with ${players.length} players`);
      
      const isTeamA = teamName.includes(teamANorm) || teamANorm.includes(teamName) || 
                      teamName === teamAShortNorm || teamAShortNorm.includes(teamName);
      
      if (isTeamA && teamA.length === 0) {
        for (const p of players) {
          if (!seenA.has(p.name.toLowerCase())) {
            seenA.add(p.name.toLowerCase());
            teamA.push(p);
          }
        }
      } else if (teamB.length === 0) {
        for (const p of players) {
          if (!seenB.has(p.name.toLowerCase())) {
            seenB.add(p.name.toLowerCase());
            teamB.push(p);
          }
        }
      }
    }
  }

  // Try matchTeamInfo structure
  if (data.matchTeamInfo && Array.isArray(data.matchTeamInfo)) {
    for (const teamInfo of data.matchTeamInfo) {
      const teamName = normalizeTeam(teamInfo.battingTeamShortName || teamInfo.teamName || teamInfo.name || '');
      const squadArr = teamInfo.squad || teamInfo.players || teamInfo.playingXI || [];
      const players = extractPlayersFromArray(squadArr);
      
      console.log(`[parseMatchesTeamEndpoint] matchTeamInfo team: ${teamName} with ${players.length} players`);
      
      const isTeamA = teamName.includes(teamANorm) || teamANorm.includes(teamName) || 
                      teamName === teamAShortNorm || teamAShortNorm.includes(teamName);
      
      if (isTeamA && teamA.length === 0) {
        teamA.push(...players.slice(0, 11));
      } else if (teamB.length === 0) {
        teamB.push(...players.slice(0, 11));
      }
    }
  }

  // Try to find players in deeply nested structures
  if (teamA.length === 0 && teamB.length === 0) {
    const foundPlayers = findPlayersInObject(data);
    console.log(`[parseMatchesTeamEndpoint] Deep search found ${foundPlayers.length} players`);
    
    // Split evenly if we can't determine teams
    if (foundPlayers.length >= 22) {
      for (let i = 0; i < 11 && i < foundPlayers.length; i++) {
        teamA.push(foundPlayers[i]);
      }
      for (let i = 11; i < 22 && i < foundPlayers.length; i++) {
        teamB.push(foundPlayers[i]);
      }
    }
  }

  console.log(`[parseMatchesTeamEndpoint] Final: TeamA=${teamA.length}, TeamB=${teamB.length}`);
  return { teamA: teamA.slice(0, 11), teamB: teamB.slice(0, 11) };
}

// Extract players from an array
function extractPlayersFromArray(arr: any[]): Player[] {
  const players: Player[] = [];
  const seen = new Set<string>();
  
  if (!Array.isArray(arr)) return players;
  
  for (const p of arr) {
    const player = extractPlayerInfoV2(p);
    if (player && !seen.has(player.name.toLowerCase())) {
      seen.add(player.name.toLowerCase());
      players.push(player);
    }
  }
  
  return players;
}

// Parse series squads endpoint (/series/v1/{seriesId}/squads)
// This endpoint returns list of team squads with their squad IDs
interface SeriesSquadsResult {
  teamA: Player[];
  teamB: Player[];
  teamASquadId?: string;
  teamBSquadId?: string;
}

function parseSeriesSquads(
  data: any, 
  teamAName: string, 
  teamAShort: string, 
  teamBName: string, 
  teamBShort: string,
  cricbuzzHost: string,
  apiKey: string
): SeriesSquadsResult {
  const result: SeriesSquadsResult = { teamA: [], teamB: [] };
  
  const normalizeTeam = (name: string) => (name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const teamANorm = normalizeTeam(teamAName);
  const teamAShortNorm = normalizeTeam(teamAShort);
  const teamBNorm = normalizeTeam(teamBName);
  const teamBShortNorm = normalizeTeam(teamBShort);
  
  console.log(`[parseSeriesSquads] Looking for teams: "${teamAName}" (${teamAShort}) vs "${teamBName}" (${teamBShort})`);
  
  // The /series/v1/{seriesId}/squads endpoint returns:
  // { "squads": [ { "squadId": 123, "squadType": "team", "isHeader": false, "imageId": xxx }, { "squadId": 456, "squadType": "team", ... } ] }
  // We need to get the squadId for each team and then call /series/v1/{seriesId}/squads/{squadId}
  
  const squads = data.squads || data.squad || data.teams || [];
  
  if (Array.isArray(squads)) {
    console.log(`[parseSeriesSquads] Found ${squads.length} squads`);
    
    for (const squad of squads) {
      // Skip header items
      if (squad.isHeader === true || squad.squadType === 'header') continue;
      
      const squadId = squad.squadId || squad.id;
      const squadName = normalizeTeam(squad.squadName || squad.teamName || squad.name || '');
      
      console.log(`[parseSeriesSquads] Squad: id=${squadId}, name="${squad.squadName || squad.teamName || squad.name}"`);
      
      // Check if this squad matches team A
      const matchesTeamA = squadName.includes(teamANorm) || teamANorm.includes(squadName) ||
                           squadName.includes(teamAShortNorm) || squadName === teamAShortNorm;
      
      // Check if this squad matches team B
      const matchesTeamB = squadName.includes(teamBNorm) || teamBNorm.includes(squadName) ||
                           squadName.includes(teamBShortNorm) || squadName === teamBShortNorm;
      
      if (matchesTeamA && squadId && !result.teamASquadId) {
        result.teamASquadId = squadId.toString();
        console.log(`[parseSeriesSquads] Matched TeamA squad: ${squadId}`);
      } else if (matchesTeamB && squadId && !result.teamBSquadId) {
        result.teamBSquadId = squadId.toString();
        console.log(`[parseSeriesSquads] Matched TeamB squad: ${squadId}`);
      }
      
      // Also try to extract players if they're embedded in the squad object
      if (squad.players || squad.player || squad.squad) {
        const players = extractPlayersFromTeam(squad);
        if (players.length > 0) {
          if (matchesTeamA && result.teamA.length === 0) {
            result.teamA = players;
          } else if (matchesTeamB && result.teamB.length === 0) {
            result.teamB = players;
          }
        }
      }
    }
  }
  
  console.log(`[parseSeriesSquads] Result: TeamA=${result.teamA.length} (squadId=${result.teamASquadId}), TeamB=${result.teamB.length} (squadId=${result.teamBSquadId})`);
  return result;
}

// Parse squad detail endpoint (/series/v1/{seriesId}/squads/{squadId})
// This returns full player list for a specific team
function parseSquadDetailPlayers(data: any): Player[] {
  const players: Player[] = [];
  const seen = new Set<string>();
  
  console.log(`[parseSquadDetailPlayers] Parsing squad detail, keys: ${Object.keys(data).join(', ')}`);
  
  // The response structure could be:
  // { "player": [ { "id": xx, "name": "Player Name", "role": "Batsman", ... }, ... ] }
  // Or: { "players": [...] }
  // Or: { "squad": { "player": [...] } }
  
  const playerArrays = [
    data.player,
    data.players,
    data.squad?.player,
    data.squad?.players,
    data.playingXI,
    data.playing11,
    data.team?.player,
    data.team?.players,
  ];
  
  for (const arr of playerArrays) {
    if (Array.isArray(arr) && arr.length > 0) {
      console.log(`[parseSquadDetailPlayers] Found player array with ${arr.length} items`);
      
      for (const p of arr) {
        const player = extractPlayerInfoV2(p);
        if (player && !seen.has(player.name.toLowerCase())) {
          seen.add(player.name.toLowerCase());
          players.push(player);
        }
      }
      
      if (players.length >= 11) break;
    }
  }
  
  // If no players found, try recursive search
  if (players.length === 0) {
    const foundPlayers = findPlayersInObject(data);
    for (const p of foundPlayers) {
      if (!seen.has(p.name.toLowerCase())) {
        seen.add(p.name.toLowerCase());
        players.push(p);
      }
    }
  }
  
  console.log(`[parseSquadDetailPlayers] Found ${players.length} players`);
  return players;
}
