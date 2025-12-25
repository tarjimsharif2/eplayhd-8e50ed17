import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CricAPIMatch {
  id: string;
  name: string;
  status: string;
  matchType: string;
  venue?: string;
  date: string;
  dateTimeGMT: string;
  teams: string[];
  teamInfo?: { name: string; shortname: string; img: string }[];
  score?: { r: number; w: number; o: number; inning: string }[];
  matchWinner?: string;
  matchEnded?: boolean;
}

// Retry fetch with exponential backoff
async function fetchWithRetry(url: string, maxRetries = 3): Promise<Response> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(15000),
      });
      return response;
    } catch (err) {
      lastError = err as Error;
      console.log(`Attempt ${attempt + 1} failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
      
      if (attempt < maxRetries - 1) {
        const delay = Math.pow(2, attempt) * 1000;
        console.log(`Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError || new Error('All retry attempts failed');
}

// Normalize team name for comparison
function normalizeTeamName(name: string): string {
  return name.toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .replace(/cricket|club|team|xi|eleven/g, '');
}

// Check if two team names match
function teamsMatch(apiTeam: string, dbTeamName: string, dbTeamShort: string): boolean {
  const apiNorm = normalizeTeamName(apiTeam);
  const nameNorm = normalizeTeamName(dbTeamName);
  const shortNorm = normalizeTeamName(dbTeamShort);
  
  return apiNorm.includes(nameNorm) || nameNorm.includes(apiNorm) ||
         apiNorm.includes(shortNorm) || shortNorm === apiNorm ||
         apiNorm === nameNorm;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { matchId } = await req.json();

    if (!matchId) {
      return new Response(
        JSON.stringify({ error: 'matchId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Fetching result for match ID: ${matchId}`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get cricket API key from site_settings
    const { data: settings, error: settingsError } = await supabase
      .from('site_settings')
      .select('cricket_api_key, cricket_api_enabled')
      .limit(1)
      .maybeSingle();

    if (settingsError || !settings?.cricket_api_key || !settings?.cricket_api_enabled) {
      console.error('Cricket API not configured:', settingsError);
      return new Response(
        JSON.stringify({ error: 'Cricket API not configured or disabled' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get match details with team info
    const { data: matchData, error: matchError } = await supabase
      .from('matches')
      .select(`
        *,
        team_a:teams!matches_team_a_id_fkey(id, name, short_name),
        team_b:teams!matches_team_b_id_fkey(id, name, short_name)
      `)
      .eq('id', matchId)
      .maybeSingle();

    if (matchError || !matchData) {
      console.error('Match not found:', matchError);
      return new Response(
        JSON.stringify({ error: 'Match not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const teamAName = matchData.team_a.name;
    const teamBName = matchData.team_b.name;
    const teamAShort = matchData.team_a.short_name;
    const teamBShort = matchData.team_b.short_name;

    console.log(`Looking for match: ${teamAName} (${teamAShort}) vs ${teamBName} (${teamBShort})`);

    // Fetch current matches from CricAPI
    const matchesUrl = `https://api.cricapi.com/v1/currentMatches?apikey=${settings.cricket_api_key}&offset=0`;
    
    console.log('Fetching matches from CricAPI...');
    
    let apiResponse: Response;
    try {
      apiResponse = await fetchWithRetry(matchesUrl);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      console.error('CricAPI fetch failed:', errorMessage);
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'Failed to connect to CricAPI. Please set match result manually.',
          details: errorMessage
        }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const apiData = await apiResponse.json();

    if (apiData.status !== 'success' || !apiData.data) {
      console.error('CricAPI error:', apiData);
      return new Response(
        JSON.stringify({ 
          success: false,
          error: apiData.info || 'Failed to fetch matches from CricAPI'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Find matching match by team names
    const matches: CricAPIMatch[] = apiData.data;
    console.log(`Found ${matches.length} matches from API`);

    let foundMatch: CricAPIMatch | null = null;

    for (const match of matches) {
      if (!match.teams || match.teams.length < 2) continue;

      const [apiTeam1, apiTeam2] = match.teams;
      
      // Check if both teams match (in any order)
      const team1MatchesA = teamsMatch(apiTeam1, teamAName, teamAShort);
      const team1MatchesB = teamsMatch(apiTeam1, teamBName, teamBShort);
      const team2MatchesA = teamsMatch(apiTeam2, teamAName, teamAShort);
      const team2MatchesB = teamsMatch(apiTeam2, teamBName, teamBShort);

      if ((team1MatchesA && team2MatchesB) || (team1MatchesB && team2MatchesA)) {
        foundMatch = match;
        console.log(`Found matching match: ${match.name} (ID: ${match.id})`);
        break;
      }
    }

    if (!foundMatch) {
      console.log('No matching match found in API');
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: `No match found for ${teamAName} vs ${teamBName}. The match may not be in CricAPI's current list.`
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if match has ended
    if (!foundMatch.matchEnded) {
      console.log('Match has not ended yet');
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: 'Match has not ended yet',
          status: foundMatch.status 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Determine winner
    let matchResult: 'team_a_won' | 'team_b_won' | 'tied' | 'no_result' | 'draw' | null = null;
    const statusLower = foundMatch.status.toLowerCase();

    console.log(`Match status: "${foundMatch.status}", Winner: ${foundMatch.matchWinner || 'N/A'}`);

    // Check matchWinner first
    if (foundMatch.matchWinner) {
      if (teamsMatch(foundMatch.matchWinner, teamAName, teamAShort)) {
        matchResult = 'team_a_won';
      } else if (teamsMatch(foundMatch.matchWinner, teamBName, teamBShort)) {
        matchResult = 'team_b_won';
      }
    }

    // Fallback: check status text
    if (!matchResult) {
      const teamALower = teamAName.toLowerCase();
      const teamBLower = teamBName.toLowerCase();
      const teamAShortLower = teamAShort.toLowerCase();
      const teamBShortLower = teamBShort.toLowerCase();

      if ((statusLower.includes(teamALower) || statusLower.includes(teamAShortLower)) && 
          statusLower.includes('won')) {
        matchResult = 'team_a_won';
      } else if ((statusLower.includes(teamBLower) || statusLower.includes(teamBShortLower)) && 
                 statusLower.includes('won')) {
        matchResult = 'team_b_won';
      } else if (statusLower.includes('tied') || statusLower.includes('tie')) {
        matchResult = 'tied';
      } else if (statusLower.includes('no result') || statusLower.includes('abandoned')) {
        matchResult = 'no_result';
      } else if (statusLower.includes('draw')) {
        matchResult = 'draw';
      }
    }

    console.log(`Determined match result: ${matchResult}`);

    if (!matchResult) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: 'Could not determine match result',
          status: foundMatch.status,
          winner: foundMatch.matchWinner
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse score data for innings
    const scores = foundMatch.score || [];
    let teamARuns = 0, teamAOvers = 0;
    let teamBRuns = 0, teamBOvers = 0;

    for (const score of scores) {
      const inningLower = score.inning.toLowerCase();
      if (teamsMatch(score.inning, teamAName, teamAShort)) {
        teamARuns += score.r || 0;
        teamAOvers += score.o || 0;
      } else if (teamsMatch(score.inning, teamBName, teamBShort)) {
        teamBRuns += score.r || 0;
        teamBOvers += score.o || 0;
      }
    }

    console.log(`Scores - ${teamAShort}: ${teamARuns}/${teamAOvers}ov, ${teamBShort}: ${teamBRuns}/${teamBOvers}ov`);

    // Delete existing innings and insert new ones
    await supabase.from('match_innings').delete().eq('match_id', matchId);

    if (teamARuns > 0 || teamAOvers > 0) {
      await supabase.from('match_innings').insert({
        match_id: matchId,
        batting_team_id: matchData.team_a.id,
        innings_number: 1,
        runs: teamARuns,
        overs: teamAOvers,
        wickets: 0,
        is_current: false,
      });
    }

    if (teamBRuns > 0 || teamBOvers > 0) {
      await supabase.from('match_innings').insert({
        match_id: matchId,
        batting_team_id: matchData.team_b.id,
        innings_number: 2,
        runs: teamBRuns,
        overs: teamBOvers,
        wickets: 0,
        is_current: false,
      });
    }

    // Update match result - triggers points table update
    const { error: updateError } = await supabase
      .from('matches')
      .update({ match_result: matchResult, status: 'completed' })
      .eq('id', matchId);

    if (updateError) {
      console.error('Error updating match:', updateError);
      return new Response(
        JSON.stringify({ error: 'Failed to update match result' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Match result updated successfully');

    return new Response(
      JSON.stringify({
        success: true,
        matchResult,
        cricApiMatchId: foundMatch.id,
        status: foundMatch.status,
        teamA: { runs: teamARuns, overs: teamAOvers },
        teamB: { runs: teamBRuns, overs: teamBOvers },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
