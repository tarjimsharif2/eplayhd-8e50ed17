import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, matchId, teamAName, teamBName, teamAShort, teamBShort, cricbuzzMatchId } = await req.json();
    
    console.log(`Cricket API request: action=${action}, matchId=${matchId}`);

    // Get Supabase client with service role to access protected settings
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch site settings with service role (bypasses RLS)
    const { data: settings, error: settingsError } = await supabase
      .from('site_settings')
      .select('cricket_api_key, cricket_api_enabled')
      .limit(1)
      .maybeSingle();

    if (settingsError) {
      console.error('Error fetching site settings:', settingsError);
      throw new Error('Failed to fetch site settings');
    }

    if (!settings?.cricket_api_enabled || !settings?.cricket_api_key) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Cricket API not configured or disabled. Enable it in Site Settings.' 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const apiKey = settings.cricket_api_key;

    // Sync match data from CricAPI
    if (action === 'syncMatch') {
      if (!matchId) {
        return new Response(JSON.stringify({ 
          success: false, 
          error: 'Match ID is required' 
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Fetch match from database
      const { data: match, error: matchError } = await supabase
        .from('matches')
        .select(`
          *,
          team_a:teams!matches_team_a_id_fkey(*),
          team_b:teams!matches_team_b_id_fkey(*)
        `)
        .eq('id', matchId)
        .single();

      if (matchError || !match) {
        console.error('Error fetching match:', matchError);
        return new Response(JSON.stringify({ 
          success: false, 
          error: 'Match not found' 
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      console.log(`Syncing match: ${match.team_a?.name} vs ${match.team_b?.name}`);

      // Fetch current matches from CricAPI
      const response = await fetch(
        `https://api.cricapi.com/v1/currentMatches?apikey=${apiKey}&offset=0`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch from CricAPI');
      }

      const data = await response.json();
      
      if (data.status !== 'success' || !data.data) {
        return new Response(JSON.stringify({ 
          success: false, 
          error: data.reason || 'No match data available from CricAPI' 
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Find matching match by cricbuzz_match_id or team names
      const normalizeTeamName = (name: string) => 
        name.toLowerCase().replace(/[^a-z0-9]/g, '');

      let apiMatch = null;

      // First try to match by cricbuzz_match_id if available
      if (match.cricbuzz_match_id) {
        apiMatch = data.data.find((m: any) => m.id === match.cricbuzz_match_id);
      }

      // If not found, try matching by team names
      if (!apiMatch && match.team_a && match.team_b) {
        const teamANormalized = normalizeTeamName(match.team_a.name);
        const teamBNormalized = normalizeTeamName(match.team_b.name);
        const teamAShortNorm = match.team_a.short_name ? normalizeTeamName(match.team_a.short_name) : '';
        const teamBShortNorm = match.team_b.short_name ? normalizeTeamName(match.team_b.short_name) : '';

        apiMatch = data.data.find((m: any) => {
          if (!m.teams || m.teams.length < 2) return false;
          
          const matchTeams = m.teams.map((t: string) => normalizeTeamName(t));
          
          const hasTeamA = matchTeams.some((t: string) => 
            t.includes(teamANormalized) || teamANormalized.includes(t) ||
            (teamAShortNorm && (t.includes(teamAShortNorm) || teamAShortNorm.includes(t)))
          );
          const hasTeamB = matchTeams.some((t: string) => 
            t.includes(teamBNormalized) || teamBNormalized.includes(t) ||
            (teamBShortNorm && (t.includes(teamBShortNorm) || teamBShortNorm.includes(t)))
          );
          
          return hasTeamA && hasTeamB;
        });
      }

      if (!apiMatch) {
        return new Response(JSON.stringify({ 
          success: false, 
          error: 'Match not found in CricAPI. Make sure the match is currently live or recently completed.',
          allMatches: data.data?.map((m: any) => ({ id: m.id, name: m.name, teams: m.teams })) || []
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      console.log('Found API match:', JSON.stringify(apiMatch, null, 2));

      // Parse scores from API response
      let scoreA = null;
      let scoreB = null;
      let matchResult: string | null = null;
      let status = match.status;

      // Parse score from API
      if (apiMatch.score && apiMatch.score.length > 0) {
        // CricAPI returns scores in format like "Team A 250/5 (40.2)"
        const teamAScore = apiMatch.score.find((s: any) => {
          const inningsTeam = normalizeTeamName(s.inning?.split(' ')[0] || '');
          return inningsTeam.includes(normalizeTeamName(match.team_a?.short_name || '')) ||
                 normalizeTeamName(match.team_a?.name || '').includes(inningsTeam);
        });
        
        const teamBScore = apiMatch.score.find((s: any) => {
          const inningsTeam = normalizeTeamName(s.inning?.split(' ')[0] || '');
          return inningsTeam.includes(normalizeTeamName(match.team_b?.short_name || '')) ||
                 normalizeTeamName(match.team_b?.name || '').includes(inningsTeam);
        });

        if (teamAScore) {
          scoreA = `${teamAScore.r || 0}/${teamAScore.w || 0} (${teamAScore.o || 0})`;
        }
        if (teamBScore) {
          scoreB = `${teamBScore.r || 0}/${teamBScore.w || 0} (${teamBScore.o || 0})`;
        }
      }

      // Determine match status and result
      if (apiMatch.matchEnded) {
        status = 'completed';
        
        // Parse result from API
        const resultStatus = (apiMatch.status || '').toLowerCase();
        if (resultStatus.includes('won')) {
          const winnerTeam = resultStatus.split(' won')[0].trim();
          const winnerNormalized = normalizeTeamName(winnerTeam);
          
          if (normalizeTeamName(match.team_a?.name || '').includes(winnerNormalized) ||
              normalizeTeamName(match.team_a?.short_name || '').includes(winnerNormalized) ||
              winnerNormalized.includes(normalizeTeamName(match.team_a?.short_name || ''))) {
            matchResult = 'team_a_won';
          } else if (normalizeTeamName(match.team_b?.name || '').includes(winnerNormalized) ||
                     normalizeTeamName(match.team_b?.short_name || '').includes(winnerNormalized) ||
                     winnerNormalized.includes(normalizeTeamName(match.team_b?.short_name || ''))) {
            matchResult = 'team_b_won';
          }
        } else if (resultStatus.includes('tie') || resultStatus.includes('tied')) {
          matchResult = 'tied';
        } else if (resultStatus.includes('draw') || resultStatus.includes('drawn')) {
          matchResult = 'draw';
        } else if (resultStatus.includes('no result') || resultStatus.includes('abandoned')) {
          matchResult = 'no_result';
        }
      } else if (apiMatch.matchStarted) {
        status = 'live';
      }

      // Update match in database
      const updateData: any = {
        status,
        updated_at: new Date().toISOString(),
      };

      if (scoreA) updateData.score_a = scoreA;
      if (scoreB) updateData.score_b = scoreB;
      if (matchResult) updateData.match_result = matchResult;
      
      // Save cricbuzz_match_id for future syncs
      if (!match.cricbuzz_match_id && apiMatch.id) {
        updateData.cricbuzz_match_id = apiMatch.id;
      }

      const { error: updateError } = await supabase
        .from('matches')
        .update(updateData)
        .eq('id', matchId);

      if (updateError) {
        console.error('Error updating match:', updateError);
        throw new Error('Failed to update match');
      }

      console.log(`Match updated: status=${status}, scoreA=${scoreA}, scoreB=${scoreB}, result=${matchResult}`);

      // If match completed with a result and has a tournament, recalculate points
      if (matchResult && match.tournament_id) {
        console.log('Recalculating tournament positions...');
        const { error: recalcError } = await supabase.rpc('recalculate_tournament_positions', {
          p_tournament_id: match.tournament_id
        });
        
        if (recalcError) {
          console.error('Error recalculating positions:', recalcError);
        } else {
          console.log('Tournament positions recalculated');
        }
      }

      return new Response(JSON.stringify({ 
        success: true, 
        message: 'Match synced successfully',
        data: {
          status,
          score_a: scoreA,
          score_b: scoreB,
          match_result: matchResult,
          api_status: apiMatch.status,
          cricbuzz_match_id: apiMatch.id
        }
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get current matches list
    if (action === 'getCurrentMatches') {
      const response = await fetch(
        `https://api.cricapi.com/v1/currentMatches?apikey=${apiKey}&offset=0`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch from CricAPI');
      }

      const data = await response.json();
      
      if (data.status !== 'success' || !data.data) {
        return new Response(JSON.stringify({ 
          success: false, 
          error: data.reason || 'No match data available' 
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // If team names provided, find matching match
      if (teamAName && teamBName) {
        const normalizeTeamName = (name: string) => 
          name.toLowerCase().replace(/[^a-z0-9]/g, '');

        const teamANormalized = normalizeTeamName(teamAName);
        const teamBNormalized = normalizeTeamName(teamBName);
        const teamAShortNorm = teamAShort ? normalizeTeamName(teamAShort) : '';
        const teamBShortNorm = teamBShort ? normalizeTeamName(teamBShort) : '';

        const matchingMatch = data.data.find((match: any) => {
          if (!match.teams || match.teams.length < 2) return false;
          
          const matchTeams = match.teams.map((t: string) => normalizeTeamName(t));
          
          const hasTeamA = matchTeams.some((t: string) => 
            t.includes(teamANormalized) || teamANormalized.includes(t) ||
            (teamAShortNorm && (t.includes(teamAShortNorm) || teamAShortNorm.includes(t)))
          );
          const hasTeamB = matchTeams.some((t: string) => 
            t.includes(teamBNormalized) || teamBNormalized.includes(t) ||
            (teamBShortNorm && (t.includes(teamBShortNorm) || teamBShortNorm.includes(t)))
          );
          
          return hasTeamA && hasTeamB;
        });

        return new Response(JSON.stringify({ 
          success: true, 
          match: matchingMatch || null 
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ 
        success: true, 
        matches: data.data 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ 
      success: false, 
      error: 'Unknown action' 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in cricket-api function:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
