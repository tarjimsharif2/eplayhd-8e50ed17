import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CricApiPlayer {
  id: string;
  name: string;
  role: string;
  battingStyle?: string;
  bowlingStyle?: string;
  country?: string;
  playerImg?: string;
}

interface CricApiTeam {
  teamName: string;
  shortname: string;
  img?: string;
  players: CricApiPlayer[];
}

interface CricApiResponse {
  apikey: string;
  data: CricApiTeam[];
  status: string;
  info?: {
    hitsToday: number;
    hitsUsed: number;
    hitsLimit: number;
  };
}

interface CricApiMatch {
  id: string;
  name: string;
  matchType: string;
  status: string;
  venue: string;
  date: string;
  dateTimeGMT: string;
  teams: string[];
  teamInfo?: Array<{
    name: string;
    shortname: string;
    img?: string;
  }>;
  score?: Array<{
    r: number;
    w: number;
    o: number;
    inning: string;
  }>;
  series_id?: string;
  fantasyEnabled?: boolean;
  bbbEnabled?: boolean;
  hasSquad?: boolean;
  matchStarted?: boolean;
  matchEnded?: boolean;
}

interface CricApiMatchesResponse {
  apikey: string;
  data: CricApiMatch[];
  status: string;
  info?: {
    hitsToday: number;
    hitsUsed: number;
    hitsLimit: number;
  };
}

// Normalize team name for matching
function normalizeTeamName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s*(women|men|u19|u-19|under-19|under 19)\s*/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Map CricAPI role to our role format
function mapRole(role: string): string | null {
  if (!role || role === '--') return null;
  
  const roleMap: Record<string, string> = {
    'batsman': 'Batsman',
    'bowler': 'Bowler',
    'batting allrounder': 'All-rounder',
    'bowling allrounder': 'All-rounder',
    'allrounder': 'All-rounder',
    'wk-batsman': 'Wicket-keeper',
    'wicketkeeper': 'Wicket-keeper',
  };
  
  const lower = role.toLowerCase().trim();
  return roleMap[lower] || role;
}

// Check if role indicates wicket keeper
function isWicketKeeper(role: string): boolean {
  const lower = (role || '').toLowerCase();
  return lower.includes('wk') || lower.includes('wicket') || lower.includes('keeper');
}

// Match API team to our team using name comparison
function matchTeam(
  apiTeam: CricApiTeam,
  teamAName: string,
  teamAShortName: string,
  teamBName: string,
  teamBShortName: string,
  teamAId: string,
  teamBId: string
): string | null {
  const apiName = normalizeTeamName(apiTeam.teamName);
  const apiShort = apiTeam.shortname?.toLowerCase().trim() || '';
  
  const nameA = normalizeTeamName(teamAName);
  const shortA = teamAShortName?.toLowerCase().trim() || '';
  const nameB = normalizeTeamName(teamBName);
  const shortB = teamBShortName?.toLowerCase().trim() || '';
  
  // Exact matches
  if (apiName === nameA || apiShort === shortA) return teamAId;
  if (apiName === nameB || apiShort === shortB) return teamBId;
  
  // Partial matches
  if (apiName.includes(nameA) || nameA.includes(apiName)) return teamAId;
  if (apiName.includes(nameB) || nameB.includes(apiName)) return teamBId;
  
  // Short name in full name
  if (apiName.includes(shortA) || shortA.includes(apiShort)) return teamAId;
  if (apiName.includes(shortB) || shortB.includes(apiShort)) return teamBId;
  
  return null;
}

// Search through a list of CricAPI matches for our team pair
function findMatchInList(
  matches: CricApiMatch[],
  teamAName: string,
  teamAShortName: string,
  teamBName: string,
  teamBShortName: string
): { matchId: string; matchName: string } | null {
  const normA = normalizeTeamName(teamAName);
  const normB = normalizeTeamName(teamBName);
  const shortA = teamAShortName?.toLowerCase().trim() || '';
  const shortB = teamBShortName?.toLowerCase().trim() || '';

  for (const match of matches) {
    if (!match.teams || match.teams.length < 2) continue;

    const team1 = normalizeTeamName(match.teams[0]);
    const team2 = normalizeTeamName(match.teams[1]);

    const short1 = match.teamInfo?.[0]?.shortname?.toLowerCase().trim() || '';
    const short2 = match.teamInfo?.[1]?.shortname?.toLowerCase().trim() || '';

    const matchesA = (
      team1 === normA || team1.includes(normA) || normA.includes(team1) ||
      short1 === shortA || team2 === normA || team2.includes(normA) || normA.includes(team2) ||
      short2 === shortA
    );
    
    const matchesB = (
      team1 === normB || team1.includes(normB) || normB.includes(team1) ||
      short1 === shortB || team2 === normB || team2.includes(normB) || normB.includes(team2) ||
      short2 === shortB
    );

    if (matchesA && matchesB) {
      return { matchId: match.id, matchName: match.name };
    }
  }
  return null;
}

// Fetch with retry logic for transient network errors
async function fetchWithRetry(url: string, maxRetries = 3): Promise<Response> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url);
      return res;
    } catch (err) {
      console.warn(`[CricAPI] Fetch attempt ${attempt}/${maxRetries} failed: ${err.message}`);
      if (attempt === maxRetries) throw err;
      // Wait before retry: 1s, 2s, 3s
      await new Promise(r => setTimeout(r, attempt * 1000));
    }
  }
  throw new Error('All fetch retries exhausted');
}

// Auto-detect CricAPI match ID - tries currentMatches first, then upcoming matches
async function autoDetectMatchId(
  apiKey: string,
  teamAName: string,
  teamAShortName: string,
  teamBName: string,
  teamBShortName: string
): Promise<{ matchId: string | null; matchName: string | null; error: string | null }> {
  try {
    console.log(`[CricAPI Auto] Searching for match: ${teamAName} vs ${teamBName}`);
    
    // Step 1: Try currentMatches first (live/recent)
    try {
      const currentRes = await fetchWithRetry(`https://api.cricapi.com/v1/currentMatches?apikey=${apiKey}`);
      if (currentRes.ok) {
        const currentData: CricApiMatchesResponse = await currentRes.json();
        if (currentData.status === 'success' && currentData.data && currentData.data.length > 0) {
          console.log(`[CricAPI Auto] Checking ${currentData.data.length} current matches...`);
          const found = findMatchInList(currentData.data, teamAName, teamAShortName, teamBName, teamBShortName);
          if (found) {
            console.log(`[CricAPI Auto] Found in currentMatches: "${found.matchName}" (ID: ${found.matchId})`);
            return { matchId: found.matchId, matchName: found.matchName, error: null };
          }
          console.log('[CricAPI Auto] Not found in currentMatches, trying upcoming matches...');
        }
      }
    } catch (e) {
      console.warn(`[CricAPI Auto] currentMatches failed after retries: ${e.message}, trying matches list...`);
    }

    // Step 2: Fallback to matches list (includes upcoming)
    try {
      const matchesRes = await fetchWithRetry(`https://api.cricapi.com/v1/matches?apikey=${apiKey}&offset=0`);
      if (matchesRes.ok) {
        const matchesData: CricApiMatchesResponse = await matchesRes.json();
        if (matchesData.status === 'success' && matchesData.data && matchesData.data.length > 0) {
          console.log(`[CricAPI Auto] Checking ${matchesData.data.length} all matches...`);
          const found = findMatchInList(matchesData.data, teamAName, teamAShortName, teamBName, teamBShortName);
          if (found) {
            console.log(`[CricAPI Auto] Found in matches list: "${found.matchName}" (ID: ${found.matchId})`);
            return { matchId: found.matchId, matchName: found.matchName, error: null };
          }
        }
      }
    } catch (e) {
      console.warn(`[CricAPI Auto] matches list failed after retries: ${e.message}`);
    }
    
    return { 
      matchId: null, 
      matchName: null, 
      error: `Could not find ${teamAName} vs ${teamBName} in current or upcoming matches. Please try again or set the CricAPI Match ID manually.` 
    };
  } catch (err) {
    console.error('[CricAPI Auto] Error:', err);
    return { matchId: null, matchName: null, error: `Auto-detect failed: ${err.message}. Please try again.` };
  }
}
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { matchId, teamAId, teamBId, teamAName, teamAShortName, teamBName, teamBShortName } = await req.json();

    if (!matchId) {
      return new Response(JSON.stringify({ success: false, error: 'matchId required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[CricAPI Squad] Fetching squad for match ${matchId}`);

    // Get the CricAPI key from site_settings
    const { data: settings, error: settingsError } = await supabase
      .from('site_settings')
      .select('cricket_api_key')
      .limit(1)
      .maybeSingle();

    if (settingsError || !settings?.cricket_api_key) {
      console.error('[CricAPI Squad] API key not configured:', settingsError);
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'CricAPI key not configured. Please add your API key in Settings → API Keys → CricAPI.' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const apiKey = settings.cricket_api_key;

    // Get the match to find cricapi_match_id
    const { data: match, error: matchError } = await supabase
      .from('matches')
      .select('cricapi_match_id')
      .eq('id', matchId)
      .single();

    if (matchError || !match) {
      console.error('[CricAPI Squad] Match not found:', matchError);
      return new Response(JSON.stringify({ success: false, error: 'Match not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let cricapiMatchId = match.cricapi_match_id;
    let autoDetected = false;

    // Auto-detect match ID if not set
    if (!cricapiMatchId) {
      console.log('[CricAPI Squad] No cricapi_match_id set, auto-detecting...');
      
      const detection = await autoDetectMatchId(apiKey, teamAName, teamAShortName, teamBName, teamBShortName);
      
      if (!detection.matchId) {
        return new Response(JSON.stringify({ 
          success: false, 
          error: detection.error || 'Could not auto-detect match ID from CricAPI. Try setting it manually.' 
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      cricapiMatchId = detection.matchId;
      autoDetected = true;

      // Save the detected match ID to the database for future use
      const { error: updateError } = await supabase
        .from('matches')
        .update({ cricapi_match_id: cricapiMatchId })
        .eq('id', matchId);

      if (updateError) {
        console.warn('[CricAPI Squad] Failed to save auto-detected ID:', updateError);
      } else {
        console.log(`[CricAPI Squad] Auto-detected and saved match ID: ${cricapiMatchId} (${detection.matchName})`);
      }
    }

    // Fetch squad from CricAPI
    const apiUrl = `https://api.cricapi.com/v1/match_squad?apikey=${apiKey}&id=${cricapiMatchId}`;
    console.log(`[CricAPI Squad] Fetching from: ${apiUrl.replace(apiKey, '***')}`);

    const response = await fetchWithRetry(apiUrl);
    if (!response.ok) {
      console.error(`[CricAPI Squad] API returned ${response.status}`);
      return new Response(JSON.stringify({ 
        success: false, 
        error: `CricAPI returned status ${response.status}` 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const apiData: CricApiResponse = await response.json();
    console.log(`[CricAPI Squad] Response status: ${apiData.status}, teams: ${apiData.data?.length || 0}`);

    if (apiData.status !== 'success' || !apiData.data || apiData.data.length < 2) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: `CricAPI returned: ${apiData.status}. Teams found: ${apiData.data?.length || 0}. Need at least 2 teams.`,
        info: apiData.info
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Match API teams to our teams
    const teamMapping: Record<string, string> = {};

    for (const apiTeam of apiData.data) {
      const matchedTeamId = matchTeam(
        apiTeam, teamAName, teamAShortName, teamBName, teamBShortName, teamAId, teamBId
      );
      
      if (matchedTeamId) {
        teamMapping[apiTeam.teamName] = matchedTeamId;
        console.log(`[CricAPI Squad] Matched "${apiTeam.teamName}" → ${matchedTeamId === teamAId ? teamAName : teamBName}`);
      } else {
        console.warn(`[CricAPI Squad] Could not match team: "${apiTeam.teamName}"`);
      }
    }

    // If we couldn't match both teams, try positional fallback
    if (Object.keys(teamMapping).length < 2 && apiData.data.length >= 2) {
      console.log('[CricAPI Squad] Using positional fallback for team matching');
      teamMapping[apiData.data[0].teamName] = teamAId;
      teamMapping[apiData.data[1].teamName] = teamBId;
    }

    // Delete existing players for this match
    const { error: deleteError } = await supabase
      .from('match_playing_xi')
      .delete()
      .eq('match_id', matchId);

    if (deleteError) {
      console.error('[CricAPI Squad] Failed to clear existing players:', deleteError);
      throw deleteError;
    }

    // Insert players for each team
    const allPlayers: any[] = [];
    let teamACount = 0;
    let teamBCount = 0;

    for (const apiTeam of apiData.data) {
      const teamId = teamMapping[apiTeam.teamName];
      if (!teamId) continue;

      for (let i = 0; i < apiTeam.players.length; i++) {
        const player = apiTeam.players[i];
        
        allPlayers.push({
          match_id: matchId,
          team_id: teamId,
          player_name: player.name,
          player_role: mapRole(player.role),
          is_captain: false,
          is_vice_captain: false,
          is_wicket_keeper: isWicketKeeper(player.role),
          batting_order: i + 1,
          is_bench: true,
        });

        if (teamId === teamAId) teamACount++;
        else teamBCount++;
      }
    }

    if (allPlayers.length === 0) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'No players found in API response' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { error: insertError } = await supabase
      .from('match_playing_xi')
      .insert(allPlayers);

    if (insertError) {
      console.error('[CricAPI Squad] Failed to insert players:', insertError);
      throw insertError;
    }

    const autoMsg = autoDetected ? ` (Match ID auto-detected: ${cricapiMatchId})` : '';
    console.log(`[CricAPI Squad] Successfully added ${allPlayers.length} players (${teamACount} + ${teamBCount})${autoMsg}`);

    return new Response(JSON.stringify({
      success: true,
      totalPlayers: allPlayers.length,
      teamA: { count: teamACount },
      teamB: { count: teamBCount },
      info: apiData.info,
      autoDetected,
      cricapiMatchId,
      message: `${allPlayers.length} players added from CricAPI (${teamACount} + ${teamBCount})${autoMsg}`
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[CricAPI Squad] Error:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message || 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
