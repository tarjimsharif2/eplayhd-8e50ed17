import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Verify admin authentication
async function verifyAdminAuth(req: Request): Promise<{ authorized: boolean; error?: string; userId?: string }> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return { authorized: false, error: 'Missing authorization header' };
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  
  const token = authHeader.replace('Bearer ', '');
  const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey);
  
  const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token);
  
  if (authError || !user) {
    return { authorized: false, error: 'Invalid or expired token' };
  }

  // Check if user is admin using service role client
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const { data: roles } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .eq('role', 'admin')
    .single();

  if (!roles) {
    return { authorized: false, error: 'Admin access required' };
  }

  return { authorized: true, userId: user.id };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify admin authentication
    const authResult = await verifyAdminAuth(req);
    if (!authResult.authorized) {
      console.log(`[sync-match-nrr] Auth failed: ${authResult.error}`);
      return new Response(
        JSON.stringify({ success: false, error: authResult.error }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const { matchId } = body;

    if (!matchId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Match ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[sync-match-nrr] Syncing NRR for match: ${matchId}`);

    // Get match details
    const { data: match, error: matchError } = await supabase
      .from('matches')
      .select(`
        id,
        tournament_id,
        team_a_id,
        team_b_id,
        status,
        match_result,
        score_a,
        score_b
      `)
      .eq('id', matchId)
      .single();

    if (matchError || !match) {
      console.error('[sync-match-nrr] Match not found:', matchError);
      return new Response(
        JSON.stringify({ success: false, error: 'Match not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!match.tournament_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'Match does not belong to a tournament' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get innings data for this match
    const { data: innings, error: inningsError } = await supabase
      .from('match_innings')
      .select('*')
      .eq('match_id', matchId)
      .order('innings_number');

    if (inningsError) {
      console.error('[sync-match-nrr] Failed to fetch innings:', inningsError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to fetch innings data' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Calculate runs and overs for each team
    let teamARunsScored = 0;
    let teamAOversFaced = 0;
    let teamARunsConceded = 0;
    let teamAOversBowled = 0;

    let teamBRunsScored = 0;
    let teamBOversFaced = 0;
    let teamBRunsConceded = 0;
    let teamBOversBowled = 0;

    // If we have innings data, calculate from that
    if (innings && innings.length > 0) {
      for (const inn of innings) {
        const runs = inn.runs || 0;
        const overs = parseFloat(inn.overs?.toString() || '0') || 0;
        
        if (inn.batting_team_id === match.team_a_id) {
          teamARunsScored += runs;
          teamAOversFaced += overs;
          teamBRunsConceded += runs;
          teamBOversBowled += overs;
        } else if (inn.batting_team_id === match.team_b_id) {
          teamBRunsScored += runs;
          teamBOversFaced += overs;
          teamARunsConceded += runs;
          teamAOversBowled += overs;
        }
      }
      
      console.log(`[sync-match-nrr] Innings data - Team A: ${teamARunsScored}/${teamAOversFaced} ov, Team B: ${teamBRunsScored}/${teamBOversFaced} ov`);
    } else {
      // Try to parse from score strings (e.g., "256/8 (50 ov)")
      const parseScore = (scoreStr: string | null): { runs: number; overs: number } => {
        if (!scoreStr) return { runs: 0, overs: 0 };
        
        const runsMatch = scoreStr.match(/(\d+)(?:\/\d+)?/);
        const oversMatch = scoreStr.match(/\((\d+(?:\.\d+)?)\s*(?:ov|overs?)?\)/i);
        
        return {
          runs: runsMatch ? parseInt(runsMatch[1]) : 0,
          overs: oversMatch ? parseFloat(oversMatch[1]) : 0,
        };
      };
      
      const scoreA = parseScore(match.score_a);
      const scoreB = parseScore(match.score_b);
      
      teamARunsScored = scoreA.runs;
      teamAOversFaced = scoreA.overs;
      teamBRunsConceded = scoreA.runs;
      teamBOversBowled = scoreA.overs;
      
      teamBRunsScored = scoreB.runs;
      teamBOversFaced = scoreB.overs;
      teamARunsConceded = scoreB.runs;
      teamAOversBowled = scoreB.overs;
      
      console.log(`[sync-match-nrr] Parsed from scores - Team A: ${teamARunsScored}/${teamAOversFaced} ov, Team B: ${teamBRunsScored}/${teamBOversFaced} ov`);
    }

    // Calculate NRR contribution for this match
    const calculateMatchNrr = (runsSc: number, oversFc: number, runsCon: number, oversBw: number): number => {
      if (oversFc <= 0 || oversBw <= 0) return 0;
      const nrr = (runsSc / oversFc) - (runsCon / oversBw);
      return Math.round(nrr * 1000) / 1000;
    };

    const teamAMatchNrr = calculateMatchNrr(teamARunsScored, teamAOversFaced, teamARunsConceded, teamAOversBowled);
    const teamBMatchNrr = calculateMatchNrr(teamBRunsScored, teamBOversFaced, teamBRunsConceded, teamBOversBowled);

    console.log(`[sync-match-nrr] Match NRR contribution - Team A: ${teamAMatchNrr}, Team B: ${teamBMatchNrr}`);

    // Update points table entries
    const updateTeamNrr = async (teamId: string, runsScored: number, oversFaced: number, runsConceded: number, oversBowled: number) => {
      const { data: entry, error: fetchError } = await supabase
        .from('tournament_points_table')
        .select('*')
        .eq('tournament_id', match.tournament_id)
        .eq('team_id', teamId)
        .maybeSingle();

      if (fetchError) {
        console.error(`[sync-match-nrr] Error fetching entry for team ${teamId}:`, fetchError);
        return false;
      }

      if (!entry) {
        console.log(`[sync-match-nrr] No points table entry found for team ${teamId}`);
        return false;
      }

      const newRunsScored = (entry.runs_scored || 0) + runsScored;
      const newOversFaced = (entry.overs_faced || 0) + oversFaced;
      const newRunsConceded = (entry.runs_conceded || 0) + runsConceded;
      const newOversBowled = (entry.overs_bowled || 0) + oversBowled;

      let newNrr = 0;
      if (newOversFaced > 0 && newOversBowled > 0) {
        newNrr = (newRunsScored / newOversFaced) - (newRunsConceded / newOversBowled);
        newNrr = Math.round(newNrr * 1000) / 1000;
      }

      const { error: updateError } = await supabase
        .from('tournament_points_table')
        .update({
          runs_scored: newRunsScored,
          overs_faced: newOversFaced,
          runs_conceded: newRunsConceded,
          overs_bowled: newOversBowled,
          net_run_rate: newNrr,
          updated_at: new Date().toISOString(),
        })
        .eq('id', entry.id);

      if (updateError) {
        console.error(`[sync-match-nrr] Error updating NRR for team ${teamId}:`, updateError);
        return false;
      }

      console.log(`[sync-match-nrr] Updated team ${teamId} - NRR: ${newNrr}`);
      return true;
    };

    const teamAUpdated = await updateTeamNrr(match.team_a_id, teamARunsScored, teamAOversFaced, teamARunsConceded, teamAOversBowled);
    const teamBUpdated = await updateTeamNrr(match.team_b_id, teamBRunsScored, teamBOversFaced, teamBRunsConceded, teamBOversBowled);

    if (teamAUpdated || teamBUpdated) {
      const { error: rpcError } = await supabase.rpc('recalculate_tournament_positions', {
        p_tournament_id: match.tournament_id
      });

      if (rpcError) {
        console.error('[sync-match-nrr] Error recalculating positions:', rpcError);
      } else {
        console.log('[sync-match-nrr] Positions recalculated');
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'NRR synced to points table',
        teamA: { updated: teamAUpdated, matchNrr: teamAMatchNrr },
        teamB: { updated: teamBUpdated, matchNrr: teamBMatchNrr },
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('[sync-match-nrr] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
