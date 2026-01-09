import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper function to fetch with retry logic
async function fetchWithRetry(url: string, options: RequestInit, maxRetries = 3): Promise<Response> {
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      lastError = error as Error;
      console.log(`Attempt ${attempt}/${maxRetries} failed: ${error}`);
      
      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt - 1) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError || new Error('Failed to fetch after retries');
}

// Normalize team name for matching
const normalizeTeamName = (name: string): string => {
  return (name || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
};

// Check if team names match
const teamsMatch = (dbTeamName: string, dbShortName: string, apiTeamName: string): boolean => {
  const dbNorm = normalizeTeamName(dbTeamName);
  const dbShortNorm = normalizeTeamName(dbShortName);
  const apiNorm = normalizeTeamName(apiTeamName);
  
  if (!apiNorm) return false;
  
  // Exact match on short name
  if (dbShortNorm === apiNorm) return true;
  
  // Check if names include each other
  if (dbNorm.includes(apiNorm) || apiNorm.includes(dbNorm)) return true;
  if (dbShortNorm && (apiNorm.includes(dbShortNorm) || dbShortNorm.includes(apiNorm))) return true;
  
  return false;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const { matchId, cricbuzzMatchId, teamAId, teamBId, teamAName, teamAShortName, teamBName, teamBShortName } = body;

    if (!matchId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Match ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[sync-playing-xi] Syncing playing XI for match: ${matchId}, cricbuzzMatchId: ${cricbuzzMatchId}`);

    // Check if playing XI already exists for this match
    const { data: existingPlayers, error: existingError } = await supabase
      .from('match_playing_xi')
      .select('id')
      .eq('match_id', matchId)
      .limit(1);

    if (existingError) {
      console.error('[sync-playing-xi] Error checking existing players:', existingError);
    }

    // If players already exist, skip API call
    if (existingPlayers && existingPlayers.length > 0) {
      console.log(`[sync-playing-xi] Players already exist for match ${matchId}, skipping API call`);
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Playing XI already exists',
          alreadyExists: true,
          playersAdded: 0
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get the RapidAPI key from site_settings
    const { data: settings, error: settingsError } = await supabase
      .from('site_settings')
      .select('rapidapi_key, rapidapi_enabled')
      .limit(1)
      .maybeSingle();

    if (settingsError || !settings?.rapidapi_enabled || !settings?.rapidapi_key) {
      console.error('[sync-playing-xi] RapidAPI is disabled or not configured');
      return new Response(
        JSON.stringify({ success: false, error: 'RapidAPI is disabled or not configured' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const rapidApiKey = settings.rapidapi_key;
    let actualMatchId = cricbuzzMatchId;

    // We need a cricbuzz match ID
    if (!actualMatchId) {
      console.log(`[sync-playing-xi] No cricbuzz match ID, searching for: ${teamAName} vs ${teamBName}`);
      
      // Try multiple endpoints to find the match
      const endpoints = [
        'https://cricbuzz-cricket.p.rapidapi.com/matches/v1/live',
        'https://cricbuzz-cricket.p.rapidapi.com/matches/v1/recent',
        'https://cricbuzz-cricket.p.rapidapi.com/schedule/v1/all'
      ];
      
      for (const endpoint of endpoints) {
        if (actualMatchId) break;
        
        try {
          console.log(`[sync-playing-xi] Searching in: ${endpoint}`);
          
          const response = await fetchWithRetry(endpoint, {
            method: 'GET',
            headers: {
              'x-rapidapi-host': 'cricbuzz-cricket.p.rapidapi.com',
              'x-rapidapi-key': rapidApiKey,
            },
          });

          if (!response.ok) {
            console.log(`[sync-playing-xi] Endpoint ${endpoint} error: ${response.status}`);
            continue;
          }

          const data = await response.json();
          
          // Handle schedule endpoint format
          if (endpoint.includes('/schedule/')) {
            const matchScheduleMap = data.matchScheduleMap || [];
            for (const scheduleItem of matchScheduleMap) {
              if (actualMatchId) break;
              const scheduleList = scheduleItem.scheduleAdWrapper?.matchScheduleList || [];
              for (const scheduleMatch of scheduleList) {
                const matchInfo = scheduleMatch.matchInfo || [];
                for (const match of matchInfo) {
                  const team1Name = match.team1?.teamName || match.team1?.teamSName || '';
                  const team2Name = match.team2?.teamName || match.team2?.teamSName || '';
                  
                  console.log(`[sync-playing-xi] Schedule match: ${team1Name} vs ${team2Name}`);
                  
                  const team1Matches = teamsMatch(teamAName, teamAShortName, team1Name) || teamsMatch(teamBName, teamBShortName, team1Name);
                  const team2Matches = teamsMatch(teamAName, teamAShortName, team2Name) || teamsMatch(teamBName, teamBShortName, team2Name);
                  
                  if (team1Matches && team2Matches) {
                    actualMatchId = match.matchId?.toString();
                    console.log(`[sync-playing-xi] Found match in schedule: ${actualMatchId} - ${team1Name} vs ${team2Name}`);
                    break;
                  }
                }
                if (actualMatchId) break;
              }
            }
          } else {
            // Handle live/recent matches format
            const typeMatches = data.typeMatches || [];
            
            for (const typeMatch of typeMatches) {
              if (actualMatchId) break;
              const seriesMatches = typeMatch.seriesMatches || [];
              for (const series of seriesMatches) {
                if (actualMatchId) break;
                const matches = series.seriesAdWrapper?.matches || [];
                for (const match of matches) {
                  const matchInfo = match.matchInfo;
                  if (!matchInfo) continue;
                  
                  const team1Name = matchInfo.team1?.teamName || matchInfo.team1?.teamSName || '';
                  const team2Name = matchInfo.team2?.teamName || matchInfo.team2?.teamSName || '';
                  
                  console.log(`[sync-playing-xi] Match: ${team1Name} vs ${team2Name}`);
                  
                  const team1Matches = teamsMatch(teamAName, teamAShortName, team1Name) || teamsMatch(teamBName, teamBShortName, team1Name);
                  const team2Matches = teamsMatch(teamAName, teamAShortName, team2Name) || teamsMatch(teamBName, teamBShortName, team2Name);
                  
                  if (team1Matches && team2Matches) {
                    actualMatchId = matchInfo.matchId?.toString();
                    console.log(`[sync-playing-xi] Found match: ${actualMatchId} - ${team1Name} vs ${team2Name}`);
                    break;
                  }
                }
              }
            }
          }
        } catch (err) {
          console.error(`[sync-playing-xi] Error fetching ${endpoint}:`, err);
        }
      }

      if (!actualMatchId) {
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: `Match not found in schedule. Please set Cricbuzz Match ID manually or ensure team names match.`,
            playersAdded: 0
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Fetch squad using match info endpoint which includes playing XI
    const matchInfoUrl = `https://cricbuzz-cricket.p.rapidapi.com/mcenter/v1/${actualMatchId}`;
    console.log(`[sync-playing-xi] Fetching match info: ${matchInfoUrl}`);
    
    const matchInfoResponse = await fetchWithRetry(matchInfoUrl, {
      method: 'GET',
      headers: {
        'x-rapidapi-host': 'cricbuzz-cricket.p.rapidapi.com',
        'x-rapidapi-key': rapidApiKey,
      },
    });

    if (!matchInfoResponse.ok) {
      console.error(`[sync-playing-xi] Match info API error: ${matchInfoResponse.status}`);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to fetch match info', playersAdded: 0 }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const matchInfoText = await matchInfoResponse.text();
    console.log(`[sync-playing-xi] Match info response (first 1000 chars):`, matchInfoText.substring(0, 1000));
    
    let matchInfo;
    try {
      matchInfo = JSON.parse(matchInfoText);
    } catch (e) {
      console.error(`[sync-playing-xi] Failed to parse match info:`, e);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to parse match info', playersAdded: 0 }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Now try to get squad from team endpoints - use teamid not id
    const team1Info = matchInfo.team1 || {};
    const team2Info = matchInfo.team2 || {};
    const team1ApiId = team1Info.teamid || team1Info.id || team1Info.teamId;
    const team2ApiId = team2Info.teamid || team2Info.id || team2Info.teamId;
    const team1Name = team1Info.teamname || team1Info.teamName || team1Info.teamsname || '';
    const team2Name = team2Info.teamname || team2Info.teamName || team2Info.teamsname || '';
    
    console.log(`[sync-playing-xi] Team IDs: team1=${team1ApiId} (${team1Name}), team2=${team2ApiId} (${team2Name})`);

    const playersToAdd: any[] = [];

    // Try squad endpoint with team numbers
    const teamConfigs = [
      { teamNum: 1, apiId: team1ApiId, apiName: team1Name },
      { teamNum: 2, apiId: team2ApiId, apiName: team2Name }
    ];
    
    for (const teamConfig of teamConfigs) {
      const { teamNum, apiId, apiName } = teamConfig;
      
      try {
        // First try match-specific squad
        const squadUrl = `https://cricbuzz-cricket.p.rapidapi.com/mcenter/v1/${actualMatchId}/team/${teamNum}`;
        console.log(`[sync-playing-xi] Fetching team ${teamNum} squad: ${squadUrl}`);
        
        const squadResponse = await fetchWithRetry(squadUrl, {
          method: 'GET',
          headers: {
            'x-rapidapi-host': 'cricbuzz-cricket.p.rapidapi.com',
            'x-rapidapi-key': rapidApiKey,
          },
        });

        let squadData: any = null;
        
        if (squadResponse.ok) {
          const squadText = await squadResponse.text();
          console.log(`[sync-playing-xi] Team ${teamNum} squad response (first 500 chars):`, squadText.substring(0, 500));
          
          if (squadText && squadText.trim() !== '') {
            try {
              squadData = JSON.parse(squadText);
            } catch (e) {
              console.error(`[sync-playing-xi] Failed to parse team ${teamNum} squad:`, e);
            }
          } else {
            console.log(`[sync-playing-xi] Team ${teamNum} squad response is empty`);
          }
        } else {
          console.log(`[sync-playing-xi] Team ${teamNum} squad response not ok: ${squadResponse.status}`);
        }

        // If match-specific squad is empty, try hsquad (historic squad) endpoint
        if (!squadData || Object.keys(squadData).length === 0) {
          console.log(`[sync-playing-xi] Trying hsquad endpoint for team ${teamNum}`);
          try {
            const hsquadUrl = `https://cricbuzz-cricket.p.rapidapi.com/mcenter/v1/${actualMatchId}/hsquad`;
            const hsquadResponse = await fetchWithRetry(hsquadUrl, {
              method: 'GET',
              headers: {
                'x-rapidapi-host': 'cricbuzz-cricket.p.rapidapi.com',
                'x-rapidapi-key': rapidApiKey,
              },
            });
            
            if (hsquadResponse.ok) {
              const hsquadText = await hsquadResponse.text();
              console.log(`[sync-playing-xi] hsquad response (first 500 chars):`, hsquadText.substring(0, 500));
              
              if (hsquadText && hsquadText.trim() !== '') {
                try {
                  const hsquadData = JSON.parse(hsquadText);
                  // hsquad returns players for both teams
                  const team1Players = hsquadData.team1?.players || [];
                  const team2Players = hsquadData.team2?.players || [];
                  const playersArray = teamNum === 1 ? team1Players : team2Players;
                  
                  if (playersArray.length > 0) {
                    squadData = { players: { squad: playersArray } };
                    console.log(`[sync-playing-xi] Found ${playersArray.length} players from hsquad for team ${teamNum}`);
                  }
                } catch (e) {
                  console.error(`[sync-playing-xi] Failed to parse hsquad:`, e);
                }
              }
            }
          } catch (e) {
            console.error(`[sync-playing-xi] hsquad error:`, e);
          }
        }

        // If still empty, try series squad endpoint using seriesId
        // First get list of squads, then find matching team
        if ((!squadData || Object.keys(squadData).length === 0) && matchInfo.seriesid) {
          console.log(`[sync-playing-xi] Trying series squads for series ${matchInfo.seriesid}`);
          try {
            // First get list of all squads in the series
            const seriesSquadsListUrl = `https://cricbuzz-cricket.p.rapidapi.com/series/v1/${matchInfo.seriesid}/squads`;
            console.log(`[sync-playing-xi] Fetching series squads list: ${seriesSquadsListUrl}`);
            
            const squadListResponse = await fetchWithRetry(seriesSquadsListUrl, {
              method: 'GET',
              headers: {
                'x-rapidapi-host': 'cricbuzz-cricket.p.rapidapi.com',
                'x-rapidapi-key': rapidApiKey,
              },
            });
            
            if (squadListResponse.ok) {
              const squadListText = await squadListResponse.text();
              console.log(`[sync-playing-xi] Series squads list (first 1000 chars):`, squadListText.substring(0, 1000));
              
              if (squadListText && squadListText.trim() !== '') {
                try {
                  const squadListData = JSON.parse(squadListText);
                  const squads = squadListData.squads || [];
                  
                  // Find the matching squad for this team
                  let matchingSquadId = null;
                  for (const squad of squads) {
                    const squadName = squad.squadName || squad.teamName || '';
                    console.log(`[sync-playing-xi] Checking squad: ${squadName} (id: ${squad.squadId})`);
                    
                    if (teamsMatch(apiName, '', squadName)) {
                      matchingSquadId = squad.squadId;
                      console.log(`[sync-playing-xi] Found matching squad: ${squadName} -> ${matchingSquadId}`);
                      break;
                    }
                  }
                  
                  if (matchingSquadId) {
                    // Now fetch the actual squad players
                    const seriesSquadUrl = `https://cricbuzz-cricket.p.rapidapi.com/series/v1/${matchInfo.seriesid}/squads/${matchingSquadId}`;
                    console.log(`[sync-playing-xi] Fetching series squad: ${seriesSquadUrl}`);
                    
                    const seriesSquadResponse = await fetchWithRetry(seriesSquadUrl, {
                      method: 'GET',
                      headers: {
                        'x-rapidapi-host': 'cricbuzz-cricket.p.rapidapi.com',
                        'x-rapidapi-key': rapidApiKey,
                      },
                    });
                    
                    if (seriesSquadResponse.ok) {
                      const seriesSquadText = await seriesSquadResponse.text();
                      console.log(`[sync-playing-xi] Series squad response (first 1000 chars):`, seriesSquadText.substring(0, 1000));
                      
                      if (seriesSquadText && seriesSquadText.trim() !== '') {
                        try {
                          const seriesSquadData = JSON.parse(seriesSquadText);
                          // Series squad format: player array directly
                          const players = seriesSquadData.player || [];
                          if (players.length > 0) {
                            squadData = { players: { squad: players }, teamDetails: { teamName: apiName } };
                            console.log(`[sync-playing-xi] Found ${players.length} players from series squad for team ${teamNum}`);
                          }
                        } catch (e) {
                          console.error(`[sync-playing-xi] Failed to parse series squad:`, e);
                        }
                      }
                    }
                  }
                } catch (e) {
                  console.error(`[sync-playing-xi] Failed to parse squads list:`, e);
                }
              }
            }
          } catch (e) {
            console.error(`[sync-playing-xi] Series squad error:`, e);
          }
        }

        if (!squadData) {
          console.log(`[sync-playing-xi] No squad data found for team ${teamNum}`);
          continue;
        }

        // Extract playing XI or squad
        const playingXI = squadData.players?.['playing XI'] || 
                          squadData.players?.playingXI || 
                          squadData.playingXI ||
                          squadData.players?.squad ||
                          [];
        
        const teamDetails = squadData.teamDetails || {};
        const detailsTeamName = teamDetails.teamName || teamDetails.teamSName || apiName || '';
        
        console.log(`[sync-playing-xi] Team ${teamNum} (${detailsTeamName}): found ${playingXI.length} players`);

        if (playingXI.length === 0) {
          // Try to get from players object with different keys
          const allPlayers = squadData.players || {};
          for (const key of Object.keys(allPlayers)) {
            if (key.toLowerCase().includes('playing') || key.toLowerCase().includes('xi') || key.toLowerCase().includes('squad')) {
              const players = allPlayers[key];
              if (Array.isArray(players) && players.length > 0) {
                console.log(`[sync-playing-xi] Found ${players.length} players in ${key}`);
                const maxPlayers = Math.min(players.length, 15); // Get up to 15 squad members
                for (let i = 0; i < maxPlayers; i++) {
                  const player = players[i];
                  const playerName = player.name || player.fullName || '';
                  if (!playerName) continue;
                  
                  // Determine local team ID
                  let localTeamId: string | null = null;
                  if (teamsMatch(teamAName, teamAShortName, detailsTeamName)) {
                    localTeamId = teamAId;
                  } else if (teamsMatch(teamBName, teamBShortName, detailsTeamName)) {
                    localTeamId = teamBId;
                  } else {
                    // Fallback based on team order
                    localTeamId = teamNum === 1 ? teamAId : teamBId;
                  }
                  
                  playersToAdd.push({
                    match_id: matchId,
                    team_id: localTeamId,
                    player_name: playerName,
                    player_role: player.role || null,
                    is_captain: player.captain === true || player.isCaptain === true,
                    is_vice_captain: false,
                    is_wicket_keeper: player.keeper === true || player.isKeeper === true,
                    batting_order: i + 1,
                  });
                }
              }
            }
          }
        } else {
          // Process playing XI/squad array
          const maxPlayers = Math.min(playingXI.length, 15);
          for (let i = 0; i < maxPlayers; i++) {
            const player = playingXI[i];
            const playerName = player.name || player.fullName || '';
            if (!playerName) continue;
            
            // Determine local team ID
            let localTeamId: string | null = null;
            if (teamsMatch(teamAName, teamAShortName, detailsTeamName)) {
              localTeamId = teamAId;
            } else if (teamsMatch(teamBName, teamBShortName, detailsTeamName)) {
              localTeamId = teamBId;
            } else {
              // Fallback based on team order
              localTeamId = teamNum === 1 ? teamAId : teamBId;
            }
            
            playersToAdd.push({
              match_id: matchId,
              team_id: localTeamId,
              player_name: playerName,
              player_role: player.role || null,
              is_captain: player.captain === true || player.isCaptain === true,
              is_vice_captain: false,
              is_wicket_keeper: player.keeper === true || player.isKeeper === true,
              batting_order: i + 1,
            });
          }
        }
      } catch (err) {
        console.error(`[sync-playing-xi] Error processing team ${teamNum}:`, err);
      }
    }

    // If still no players, try to extract from scorecard/batting endpoint
    if (playersToAdd.length === 0 && actualMatchId) {
      console.log(`[sync-playing-xi] Trying scorecard endpoint as last resort`);
      
      try {
        // Try batting scorecard for both innings
        for (let inningsNum = 1; inningsNum <= 2; inningsNum++) {
          const scorecardUrl = `https://cricbuzz-cricket.p.rapidapi.com/mcenter/v1/${actualMatchId}/scard`;
          console.log(`[sync-playing-xi] Fetching scorecard: ${scorecardUrl}`);
          
          const scorecardResponse = await fetchWithRetry(scorecardUrl, {
            method: 'GET',
            headers: {
              'x-rapidapi-host': 'cricbuzz-cricket.p.rapidapi.com',
              'x-rapidapi-key': rapidApiKey,
            },
          });

          if (scorecardResponse.ok) {
            const scorecardText = await scorecardResponse.text();
            console.log(`[sync-playing-xi] Scorecard response (first 1000 chars):`, scorecardText.substring(0, 1000));
            
            if (scorecardText && scorecardText.trim() !== '') {
              try {
                const scorecardData = JSON.parse(scorecardText);
                
                // Extract from scorecard - format: scoreCard[].batTeamDetails.batsmenData and bowlTeamDetails.bowlersData
                const scoreCard = scorecardData.scoreCard || [];
                const addedPlayerNames = new Set<string>();
                
                for (const innings of scoreCard) {
                  const batTeamDetails = innings.batTeamDetails || {};
                  const bowlTeamDetails = innings.bowlTeamDetails || {};
                  const batTeamName = batTeamDetails.batTeamName || batTeamDetails.batTeamShortName || '';
                  const bowlTeamName = bowlTeamDetails.bowlTeamName || bowlTeamDetails.bowlTeamShortName || '';
                  
                  // Get batsmen
                  const batsmenData = batTeamDetails.batsmenData || {};
                  let batOrder = 1;
                  for (const key of Object.keys(batsmenData)) {
                    const batsman = batsmenData[key];
                    const playerName = batsman.batName || '';
                    if (!playerName || addedPlayerNames.has(playerName.toLowerCase())) continue;
                    addedPlayerNames.add(playerName.toLowerCase());
                    
                    // Determine team
                    let localTeamId: string | null = null;
                    if (teamsMatch(teamAName, teamAShortName, batTeamName)) {
                      localTeamId = teamAId;
                    } else if (teamsMatch(teamBName, teamBShortName, batTeamName)) {
                      localTeamId = teamBId;
                    } else {
                      localTeamId = teamAId; // fallback
                    }
                    
                    playersToAdd.push({
                      match_id: matchId,
                      team_id: localTeamId,
                      player_name: playerName,
                      player_role: 'Batsman',
                      is_captain: batsman.isCaptain === true,
                      is_vice_captain: false,
                      is_wicket_keeper: batsman.isKeeper === true,
                      batting_order: batOrder++,
                    });
                  }
                  
                  // Get bowlers
                  const bowlersData = bowlTeamDetails.bowlersData || {};
                  let bowlOrder = 1;
                  for (const key of Object.keys(bowlersData)) {
                    const bowler = bowlersData[key];
                    const playerName = bowler.bowlName || '';
                    if (!playerName || addedPlayerNames.has(playerName.toLowerCase())) continue;
                    addedPlayerNames.add(playerName.toLowerCase());
                    
                    // Determine team
                    let localTeamId: string | null = null;
                    if (teamsMatch(teamAName, teamAShortName, bowlTeamName)) {
                      localTeamId = teamAId;
                    } else if (teamsMatch(teamBName, teamBShortName, bowlTeamName)) {
                      localTeamId = teamBId;
                    } else {
                      localTeamId = teamBId; // fallback
                    }
                    
                    playersToAdd.push({
                      match_id: matchId,
                      team_id: localTeamId,
                      player_name: playerName,
                      player_role: 'Bowler',
                      is_captain: bowler.isCaptain === true,
                      is_vice_captain: false,
                      is_wicket_keeper: false,
                      batting_order: bowlOrder++,
                    });
                  }
                }
                
                console.log(`[sync-playing-xi] Extracted ${playersToAdd.length} players from scorecard`);
              } catch (e) {
                console.error(`[sync-playing-xi] Failed to parse scorecard:`, e);
              }
            }
          }
          
          if (playersToAdd.length > 0) break;
        }
      } catch (e) {
        console.error(`[sync-playing-xi] Scorecard fetch error:`, e);
      }
    }

    if (playersToAdd.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'No playing XI data available. Try again after the match has started and batsmen/bowlers are visible.',
          playersAdded: 0
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Insert players
    const { error: insertError } = await supabase
      .from('match_playing_xi')
      .insert(playersToAdd);

    if (insertError) {
      console.error('[sync-playing-xi] Insert error:', insertError);
      return new Response(
        JSON.stringify({ success: false, error: insertError.message, playersAdded: 0 }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[sync-playing-xi] Saved ${playersToAdd.length} players for match ${matchId}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Playing XI synced successfully`,
        playersAdded: playersToAdd.length,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('[sync-playing-xi] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage, playersAdded: 0 }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
