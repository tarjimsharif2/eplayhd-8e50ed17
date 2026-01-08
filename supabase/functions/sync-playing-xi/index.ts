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
          alreadyExists: true
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

    // We need a cricbuzz match ID
    if (!cricbuzzMatchId) {
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
      let foundMatchId: string | null = null;
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
              foundMatchId = matchInfo.matchId?.toString();
              console.log(`[sync-playing-xi] Found match: ${foundMatchId} - ${team1Name} vs ${team2Name}`);
              break;
            }
          }
          if (foundMatchId) break;
        }
        if (foundMatchId) break;
      }

      if (!foundMatchId) {
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: `Match not found in live matches. Please set Cricbuzz Match ID manually.`
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Use the found match ID
      return await fetchAndSaveSquad(supabase, rapidApiKey, foundMatchId, matchId, teamAId, teamBId, teamAName, teamAShortName, teamBName, teamBShortName);
    }

    // Use provided cricbuzz match ID
    return await fetchAndSaveSquad(supabase, rapidApiKey, cricbuzzMatchId, matchId, teamAId, teamBId, teamAName, teamAShortName, teamBName, teamBShortName);

  } catch (error: unknown) {
    console.error('[sync-playing-xi] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function fetchAndSaveSquad(
  supabase: any,
  rapidApiKey: string,
  cricbuzzMatchId: string,
  matchId: string,
  teamAId: string,
  teamBId: string,
  teamAName: string,
  teamAShortName: string,
  teamBName: string,
  teamBShortName: string
): Promise<Response> {
  // Fetch squad from Cricbuzz
  const squadUrl = `https://cricbuzz-cricket.p.rapidapi.com/mcenter/v1/${cricbuzzMatchId}/team/1`;
  const squadUrl2 = `https://cricbuzz-cricket.p.rapidapi.com/mcenter/v1/${cricbuzzMatchId}/team/2`;
  
  console.log(`[sync-playing-xi] Fetching squad for match: ${cricbuzzMatchId}`);
  
  const [response1, response2] = await Promise.all([
    fetchWithRetry(squadUrl, {
      method: 'GET',
      headers: {
        'x-rapidapi-host': 'cricbuzz-cricket.p.rapidapi.com',
        'x-rapidapi-key': rapidApiKey,
      },
    }),
    fetchWithRetry(squadUrl2, {
      method: 'GET',
      headers: {
        'x-rapidapi-host': 'cricbuzz-cricket.p.rapidapi.com',
        'x-rapidapi-key': rapidApiKey,
      },
    }),
  ]);

  if (!response1.ok && !response2.ok) {
    console.error(`[sync-playing-xi] Squad API error: ${response1.status}, ${response2.status}`);
    return new Response(
      JSON.stringify({ success: false, error: 'Failed to fetch squad data' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const playersToAdd: any[] = [];
  
  // Process team 1
  if (response1.ok) {
    const team1Data = await response1.json();
    console.log(`[sync-playing-xi] Team 1 response:`, JSON.stringify(team1Data).substring(0, 500));
    
    const players1 = await processTeamSquad(team1Data, matchId, teamAId, teamBId, teamAName, teamAShortName, teamBName, teamBShortName);
    playersToAdd.push(...players1);
  }
  
  // Process team 2
  if (response2.ok) {
    const team2Data = await response2.json();
    console.log(`[sync-playing-xi] Team 2 response:`, JSON.stringify(team2Data).substring(0, 500));
    
    const players2 = await processTeamSquad(team2Data, matchId, teamAId, teamBId, teamAName, teamAShortName, teamBName, teamBShortName);
    playersToAdd.push(...players2);
  }

  if (playersToAdd.length === 0) {
    return new Response(
      JSON.stringify({ success: false, error: 'No squad data available. Match may not have started yet.' }),
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
      JSON.stringify({ success: false, error: insertError.message }),
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
}

function processTeamSquad(
  teamData: any,
  matchId: string,
  teamAId: string,
  teamBId: string,
  teamAName: string,
  teamAShortName: string,
  teamBName: string,
  teamBShortName: string
): any[] {
  const players: any[] = [];
  
  // Get playing XI from the response
  const playingXI = teamData.players?.['playing XI'] || teamData.players?.playingXI || [];
  const teamInfo = teamData.teamDetails || {};
  const apiTeamName = teamInfo.teamName || teamInfo.teamSName || '';
  
  console.log(`[sync-playing-xi] Processing team: ${apiTeamName}, playing XI count: ${playingXI.length}`);
  
  if (playingXI.length === 0) return players;
  
  // Determine which local team this matches
  let localTeamId: string | null = null;
  
  if (teamsMatch(teamAName, teamAShortName, apiTeamName)) {
    localTeamId = teamAId;
  } else if (teamsMatch(teamBName, teamBShortName, apiTeamName)) {
    localTeamId = teamBId;
  }
  
  if (!localTeamId) {
    console.log(`[sync-playing-xi] Could not match team: ${apiTeamName} to either ${teamAName} or ${teamBName}`);
    return players;
  }
  
  playingXI.forEach((player: any, index: number) => {
    const playerName = player.name || player.fullName || '';
    const role = player.role || '';
    const isCaptain = player.captain === true || player.isCaptain === true;
    const isKeeper = player.keeper === true || player.isKeeper === true || role.toLowerCase().includes('keeper');
    
    if (!playerName) return;
    
    players.push({
      match_id: matchId,
      team_id: localTeamId,
      player_name: playerName,
      player_role: role || null,
      is_captain: isCaptain,
      is_vice_captain: false,
      is_wicket_keeper: isKeeper,
      batting_order: index + 1,
    });
  });
  
  return players;
}
