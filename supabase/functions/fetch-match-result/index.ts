import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CricAPIMatchInfo {
  id: string;
  name: string;
  status: string;
  matchType: string;
  venue: {
    name: string;
    city: string;
  };
  date: string;
  dateTimeGMT: string;
  teams: string[];
  score: {
    r: number;
    w: number;
    o: number;
    inning: string;
  }[];
  matchWinner?: string;
  matchEnded?: boolean;
}

// Retry fetch with exponential backoff
async function fetchWithRetry(url: string, options: RequestInit = {}, maxRetries = 3): Promise<Response> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url, {
        ...options,
        signal: AbortSignal.timeout(15000), // 15 second timeout
      });
      return response;
    } catch (err) {
      lastError = err as Error;
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      console.log(`Attempt ${attempt + 1} failed: ${errorMessage}`);
      
      if (attempt < maxRetries - 1) {
        // Wait with exponential backoff
        const delay = Math.pow(2, attempt) * 1000;
        console.log(`Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError || new Error('All retry attempts failed');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { matchId, cricbuzzMatchId } = await req.json();

    if (!matchId) {
      return new Response(
        JSON.stringify({ error: 'matchId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Fetching result for match ID: ${matchId}, CricAPI ID: ${cricbuzzMatchId}`);

    // Get Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get cricket API key from site_settings
    const { data: settings, error: settingsError } = await supabase
      .from('site_settings')
      .select('cricket_api_key, cricket_api_enabled')
      .limit(1)
      .single();

    if (settingsError || !settings?.cricket_api_key || !settings?.cricket_api_enabled) {
      console.error('Cricket API not configured:', settingsError);
      return new Response(
        JSON.stringify({ error: 'Cricket API not configured or disabled' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get match details to map team names
    const { data: matchData, error: matchError } = await supabase
      .from('matches')
      .select(`
        *,
        team_a:teams!matches_team_a_id_fkey(id, name, short_name),
        team_b:teams!matches_team_b_id_fkey(id, name, short_name)
      `)
      .eq('id', matchId)
      .single();

    if (matchError || !matchData) {
      console.error('Match not found:', matchError);
      return new Response(
        JSON.stringify({ error: 'Match not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch match info from CricAPI with retry
    const apiUrl = `https://api.cricapi.com/v1/match_info?apikey=${settings.cricket_api_key}&id=${cricbuzzMatchId}`;
    
    console.log('Fetching from CricAPI...');
    
    let apiResponse: Response;
    try {
      apiResponse = await fetchWithRetry(apiUrl);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      console.error('CricAPI fetch failed after retries:', errorMessage);
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'Failed to connect to CricAPI. Please check your API key and match ID.',
          details: errorMessage
        }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const apiData = await apiResponse.json();

    console.log('CricAPI response:', JSON.stringify(apiData, null, 2));

    if (apiData.status !== 'success' || !apiData.data) {
      console.error('CricAPI error:', apiData);
      return new Response(
        JSON.stringify({ 
          success: false,
          error: apiData.info || apiData.message || 'Failed to fetch from CricAPI',
          details: 'Make sure the CricAPI Match ID is correct (not Cricbuzz ID)'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const matchInfo: CricAPIMatchInfo = apiData.data;

    // Only process if match has ended
    if (!matchInfo.matchEnded) {
      console.log('Match has not ended yet');
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: 'Match has not ended yet',
          status: matchInfo.status 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Determine winner based on status text
    let matchResult: 'team_a_won' | 'team_b_won' | 'tied' | 'no_result' | 'draw' | null = null;
    const statusLower = matchInfo.status.toLowerCase();
    const teamAName = matchData.team_a.name.toLowerCase();
    const teamBName = matchData.team_b.name.toLowerCase();
    const teamAShort = matchData.team_a.short_name.toLowerCase();
    const teamBShort = matchData.team_b.short_name.toLowerCase();

    console.log(`Checking status: "${matchInfo.status}"`);
    console.log(`Team A: ${teamAName} (${teamAShort}), Team B: ${teamBName} (${teamBShort})`);

    // Check for winner
    if (matchInfo.matchWinner) {
      const winnerLower = matchInfo.matchWinner.toLowerCase();
      if (winnerLower.includes(teamAName) || winnerLower.includes(teamAShort) || 
          teamAName.includes(winnerLower) || teamAShort === winnerLower) {
        matchResult = 'team_a_won';
      } else if (winnerLower.includes(teamBName) || winnerLower.includes(teamBShort) ||
                 teamBName.includes(winnerLower) || teamBShort === winnerLower) {
        matchResult = 'team_b_won';
      }
    }

    // Fallback: check status text
    if (!matchResult) {
      if (statusLower.includes(teamAName) && statusLower.includes('won')) {
        matchResult = 'team_a_won';
      } else if (statusLower.includes(teamBName) && statusLower.includes('won')) {
        matchResult = 'team_b_won';
      } else if (statusLower.includes(teamAShort) && statusLower.includes('won')) {
        matchResult = 'team_a_won';
      } else if (statusLower.includes(teamBShort) && statusLower.includes('won')) {
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
          message: 'Could not determine match result from API response',
          status: matchInfo.status,
          winner: matchInfo.matchWinner
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get innings data for NRR calculation
    const scores = matchInfo.score || [];
    let teamARuns = 0, teamAOvers = 0;
    let teamBRuns = 0, teamBOvers = 0;

    for (const score of scores) {
      const inningLower = score.inning.toLowerCase();
      if (inningLower.includes(teamAName) || inningLower.includes(teamAShort)) {
        teamARuns += score.r || 0;
        teamAOvers += score.o || 0;
      } else if (inningLower.includes(teamBName) || inningLower.includes(teamBShort)) {
        teamBRuns += score.r || 0;
        teamBOvers += score.o || 0;
      }
    }

    console.log(`Team A: ${teamARuns}/${teamAOvers}ov, Team B: ${teamBRuns}/${teamBOvers}ov`);

    // Delete existing innings and insert new ones
    await supabase
      .from('match_innings')
      .delete()
      .eq('match_id', matchId);

    // Insert innings data for Team A
    if (teamARuns > 0 || teamAOvers > 0) {
      const { error: inningsAError } = await supabase
        .from('match_innings')
        .insert({
          match_id: matchId,
          batting_team_id: matchData.team_a.id,
          innings_number: 1,
          runs: teamARuns,
          overs: teamAOvers,
          wickets: 0,
          is_current: false,
        });

      if (inningsAError) {
        console.error('Error inserting team A innings:', inningsAError);
      }
    }

    // Insert innings data for Team B
    if (teamBRuns > 0 || teamBOvers > 0) {
      const { error: inningsBError } = await supabase
        .from('match_innings')
        .insert({
          match_id: matchId,
          batting_team_id: matchData.team_b.id,
          innings_number: 2,
          runs: teamBRuns,
          overs: teamBOvers,
          wickets: 0,
          is_current: false,
        });

      if (inningsBError) {
        console.error('Error inserting team B innings:', inningsBError);
      }
    }

    // Update match with result - this triggers the points table update
    const { error: updateError } = await supabase
      .from('matches')
      .update({
        match_result: matchResult,
        status: 'completed',
      })
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
        status: matchInfo.status,
        teamA: { runs: teamARuns, overs: teamAOvers },
        teamB: { runs: teamBRuns, overs: teamBOvers },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error fetching match result:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
