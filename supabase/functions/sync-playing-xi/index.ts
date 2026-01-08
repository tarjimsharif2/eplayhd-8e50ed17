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
      // Try to find match from live matches API
      console.log(`[sync-playing-xi] No cricbuzz match ID, searching live matches for: ${teamAName} vs ${teamBName}`);
      
      const liveMatchesUrl = 'https://cricbuzz-cricket.p.rapidapi.com/matches/v1/live';
      const response = await fetchWithRetry(liveMatchesUrl, {
        method: 'GET',
        headers: {
          'x-rapidapi-host': 'cricbuzz-cricket.p.rapidapi.com',
          'x-rapidapi-key': rapidApiKey,
        },
      });

      if (!response.ok) {
        console.error(`[sync-playing-xi] Live matches API error: ${response.status}`);
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to fetch live matches' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const liveData = await response.json();
      console.log(`[sync-playing-xi] Live matches response received`);
      
      // Find matching match
      const typeMatches = liveData.typeMatches || [];
      
      for (const typeMatch of typeMatches) {
        const seriesMatches = typeMatch.seriesMatches || [];
        for (const series of seriesMatches) {
          const matches = series.seriesAdWrapper?.matches || [];
          for (const match of matches) {
            const matchInfo = match.matchInfo;
            if (!matchInfo) continue;
            
            const team1Name = matchInfo.team1?.teamName || matchInfo.team1?.teamSName || '';
            const team2Name = matchInfo.team2?.teamName || matchInfo.team2?.teamSName || '';
            
            const team1Matches = teamsMatch(teamAName, teamAShortName, team1Name) || teamsMatch(teamBName, teamBShortName, team1Name);
            const team2Matches = teamsMatch(teamAName, teamAShortName, team2Name) || teamsMatch(teamBName, teamBShortName, team2Name);
            
            if (team1Matches && team2Matches) {
              actualMatchId = matchInfo.matchId?.toString();
              console.log(`[sync-playing-xi] Found match: ${actualMatchId} - ${team1Name} vs ${team2Name}`);
              break;
            }
          }
          if (actualMatchId) break;
        }
        if (actualMatchId) break;
      }

      if (!actualMatchId) {
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: `Match not found in live matches. Please set Cricbuzz Match ID manually.`,
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

    // Now try to get squad from team endpoints
    const team1Id = matchInfo.matchInfo?.team1?.id || matchInfo.matchInfo?.team1?.teamId;
    const team2Id = matchInfo.matchInfo?.team2?.id || matchInfo.matchInfo?.team2?.teamId;
    
    console.log(`[sync-playing-xi] Team IDs: team1=${team1Id}, team2=${team2Id}`);

    const playersToAdd: any[] = [];

    // Try squad endpoint with team IDs
    for (const [teamNum, teamApiId] of [[1, team1Id], [2, team2Id]]) {
      if (!teamApiId) continue;
      
      try {
        const squadUrl = `https://cricbuzz-cricket.p.rapidapi.com/mcenter/v1/${actualMatchId}/team/${teamNum}`;
        console.log(`[sync-playing-xi] Fetching team ${teamNum} squad: ${squadUrl}`);
        
        const squadResponse = await fetchWithRetry(squadUrl, {
          method: 'GET',
          headers: {
            'x-rapidapi-host': 'cricbuzz-cricket.p.rapidapi.com',
            'x-rapidapi-key': rapidApiKey,
          },
        });

        if (!squadResponse.ok) {
          console.log(`[sync-playing-xi] Team ${teamNum} squad response not ok: ${squadResponse.status}`);
          continue;
        }

        const squadText = await squadResponse.text();
        console.log(`[sync-playing-xi] Team ${teamNum} squad response (first 500 chars):`, squadText.substring(0, 500));
        
        if (!squadText || squadText.trim() === '') {
          console.log(`[sync-playing-xi] Team ${teamNum} squad response is empty`);
          continue;
        }

        let squadData;
        try {
          squadData = JSON.parse(squadText);
        } catch (e) {
          console.error(`[sync-playing-xi] Failed to parse team ${teamNum} squad:`, e);
          continue;
        }

        // Extract playing XI from squad data
        const playingXI = squadData.players?.['playing XI'] || 
                          squadData.players?.playingXI || 
                          squadData.playingXI ||
                          [];
        
        const teamDetails = squadData.teamDetails || {};
        const apiTeamName = teamDetails.teamName || teamDetails.teamSName || '';
        
        console.log(`[sync-playing-xi] Team ${teamNum} (${apiTeamName}): found ${playingXI.length} playing XI players`);

        if (playingXI.length === 0) {
          // Try to get from players object with different keys
          const allPlayers = squadData.players || {};
          for (const key of Object.keys(allPlayers)) {
            if (key.toLowerCase().includes('playing') || key.toLowerCase().includes('xi')) {
              const players = allPlayers[key];
              if (Array.isArray(players) && players.length > 0) {
                console.log(`[sync-playing-xi] Found ${players.length} players in ${key}`);
                for (let i = 0; i < Math.min(players.length, 11); i++) {
                  const player = players[i];
                  const playerName = player.name || player.fullName || '';
                  if (!playerName) continue;
                  
                  // Determine local team ID
                  let localTeamId: string | null = null;
                  if (teamsMatch(teamAName, teamAShortName, apiTeamName)) {
                    localTeamId = teamAId;
                  } else if (teamsMatch(teamBName, teamBShortName, apiTeamName)) {
                    localTeamId = teamBId;
                  } else {
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
          // Process playing XI array
          for (let i = 0; i < playingXI.length; i++) {
            const player = playingXI[i];
            const playerName = player.name || player.fullName || '';
            if (!playerName) continue;
            
            // Determine local team ID
            let localTeamId: string | null = null;
            if (teamsMatch(teamAName, teamAShortName, apiTeamName)) {
              localTeamId = teamAId;
            } else if (teamsMatch(teamBName, teamBShortName, apiTeamName)) {
              localTeamId = teamBId;
            } else {
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

    if (playersToAdd.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'No playing XI data available. The match may not have started or lineup not announced yet.',
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
