import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GoalEvent {
  player: string;
  minute: string;
  assist?: string;
  type: 'goal' | 'penalty' | 'own_goal';
}

interface SubstitutionEvent {
  playerOut: string;
  playerIn: string;
  minute: string;
}

interface PlayerInfo {
  name: string;
  position: string;
  jerseyNumber?: string;
  isCaptain?: boolean;
}

interface FootballMatch {
  homeTeam: string;
  awayTeam: string;
  homeScore: string | null;
  awayScore: string | null;
  status: string;
  minute: string | null;
  competition: string | null;
  startTime: string | null;
  homeGoals?: GoalEvent[];
  awayGoals?: GoalEvent[];
  homeLineup?: PlayerInfo[];
  awayLineup?: PlayerInfo[];
  homeSubs?: SubstitutionEvent[];
  awaySubs?: SubstitutionEvent[];
}

// Normalize team name for matching
function normalizeTeamName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+fc$/i, '')
    .replace(/\s+united$/i, ' utd')
    .replace(/\s+city$/i, '')
    .replace(/manchester\s+/i, 'man ')
    .replace(/tottenham\s+hotspur/i, 'spurs')
    .replace(/wolverhampton\s+wanderers/i, 'wolves')
    .replace(/west\s+ham\s+united/i, 'west ham')
    .replace(/newcastle\s+united/i, 'newcastle')
    .replace(/\s+/g, ' ')
    .trim();
}

// Match team names with fuzzy matching
function teamsMatch(dbTeam: string, apiTeam: string): boolean {
  const normalizedDb = normalizeTeamName(dbTeam);
  const normalizedApi = normalizeTeamName(apiTeam);
  
  if (normalizedDb === normalizedApi) return true;
  if (normalizedDb.includes(normalizedApi) || normalizedApi.includes(normalizedDb)) return true;
  
  const dbWords = normalizedDb.split(' ').filter(w => w.length > 2);
  const apiWords = normalizedApi.split(' ').filter(w => w.length > 2);
  
  const matchingWords = dbWords.filter(w => apiWords.includes(w));
  if (matchingWords.length >= 1 && matchingWords.length >= Math.min(dbWords.length, apiWords.length) * 0.5) {
    return true;
  }
  
  return false;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('[auto-sync-football] Starting automatic football score sync...');
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get all live AND recently completed football matches with auto_sync enabled
    const now = new Date();
    const { data: sportsData } = await supabase
      .from('sports')
      .select('id')
      .ilike('name', '%football%');
    
    const footballSportIds = (sportsData || []).map(s => s.id);
    
    if (footballSportIds.length === 0) {
      console.log('[auto-sync-football] No football sport found');
      return new Response(JSON.stringify({ success: true, message: 'No football sport found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get matches: live, completed (48h), and upcoming within 60 minutes
    const { data: liveMatches, error: matchError } = await supabase
      .from('matches')
      .select(`
        id,
        team_a_id,
        team_b_id,
        score_a,
        score_b,
        status,
        match_minute,
        sport_id,
        auto_sync_enabled,
        match_start_time,
        team_a:teams!matches_team_a_id_fkey(name, short_name),
        team_b:teams!matches_team_b_id_fkey(name, short_name)
      `)
      .in('status', ['upcoming', 'live', 'completed'])
      .eq('is_active', true)
      .eq('auto_sync_enabled', true)
      .in('sport_id', footballSportIds);

    if (matchError) {
      console.error('[auto-sync-football] Error fetching matches:', matchError);
      throw matchError;
    }

    // Filter: completed within 48h, live always, upcoming within 60 minutes
    const footballMatches = (liveMatches || []).filter(m => {
      if (m.status === 'completed' && m.match_start_time) {
        const matchTime = new Date(m.match_start_time);
        const hoursSinceMatch = (now.getTime() - matchTime.getTime()) / (1000 * 60 * 60);
        return hoursSinceMatch <= 48;
      }
      if (m.status === 'upcoming' && m.match_start_time) {
        const matchTime = new Date(m.match_start_time);
        const minutesUntilMatch = (matchTime.getTime() - now.getTime()) / (1000 * 60);
        // Sync upcoming matches within 60 minutes to get early lineup data
        return minutesUntilMatch <= 60 && minutesUntilMatch >= -10;
      }
      return true; // Live matches always sync
    });

    if (footballMatches.length === 0) {
      console.log('[auto-sync-football] No football matches to sync');
      return new Response(JSON.stringify({ success: true, message: 'No matches to sync', updated: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[auto-sync-football] Found ${footballMatches.length} football matches to sync`);

    // Fetch scores from ESPN API via scrape-football-scores function
    const { data: apiResponse, error: apiError } = await supabase.functions.invoke(
      'scrape-football-scores',
      { body: { allLeagues: true, includeDetails: true } }
    );

    if (apiError || !apiResponse?.success) {
      console.error('[auto-sync-football] API error:', apiError || apiResponse?.error);
      throw new Error(apiError?.message || apiResponse?.error || 'API fetch failed');
    }

    const apiMatches: FootballMatch[] = apiResponse.matches || [];
    console.log(`[auto-sync-football] API returned ${apiMatches.length} matches`);

    let updatedCount = 0;
    const results: { matchId: string; teamA: string; teamB: string; scoreA: string | null; scoreB: string | null }[] = [];

    // Match and update scores
    for (const dbMatch of footballMatches) {
      const teamA = (dbMatch.team_a as unknown) as { name: string; short_name: string } | null;
      const teamB = (dbMatch.team_b as unknown) as { name: string; short_name: string } | null;
      const teamAName = teamA?.name || '';
      const teamAShort = teamA?.short_name || '';
      const teamBName = teamB?.name || '';
      const teamBShort = teamB?.short_name || '';
      const teamAId = dbMatch.team_a_id;
      const teamBId = dbMatch.team_b_id;

      // Find matching API match
      const apiMatch = apiMatches.find(api => {
        const homeMatches = teamsMatch(teamAName, api.homeTeam) || teamsMatch(teamAShort, api.homeTeam);
        const awayMatches = teamsMatch(teamBName, api.awayTeam) || teamsMatch(teamBShort, api.awayTeam);
        return homeMatches && awayMatches;
      });

      // Also check reverse (in case home/away is swapped)
      const apiMatchReverse = !apiMatch ? apiMatches.find(api => {
        const homeMatches = teamsMatch(teamBName, api.homeTeam) || teamsMatch(teamBShort, api.homeTeam);
        const awayMatches = teamsMatch(teamAName, api.awayTeam) || teamsMatch(teamAShort, api.awayTeam);
        return homeMatches && awayMatches;
      }) : null;

      const matchedApi = apiMatch || apiMatchReverse;
      const isReversed = !!apiMatchReverse && !apiMatch;

      if (matchedApi) {
        const newScoreA = isReversed ? matchedApi.awayScore : matchedApi.homeScore;
        const newScoreB = isReversed ? matchedApi.homeScore : matchedApi.awayScore;
        
        const goalsTeamA = isReversed ? matchedApi.awayGoals : matchedApi.homeGoals;
        const goalsTeamB = isReversed ? matchedApi.homeGoals : matchedApi.awayGoals;
        
        const lineupTeamA = isReversed ? matchedApi.awayLineup : matchedApi.homeLineup;
        const lineupTeamB = isReversed ? matchedApi.homeLineup : matchedApi.awayLineup;
        
        const subsTeamA = isReversed ? matchedApi.awaySubs : matchedApi.homeSubs;
        const subsTeamB = isReversed ? matchedApi.homeSubs : matchedApi.awaySubs;
        
        // Parse minute from API
        let newMinute: number | null = null;
        if (matchedApi.minute) {
          const minuteMatch = matchedApi.minute.match(/(\d+)/);
          if (minuteMatch) {
            newMinute = parseInt(minuteMatch[1], 10);
          }
        }

        // Determine new status
        let newStatus = dbMatch.status;
        if (matchedApi.status === 'Completed') {
          newStatus = 'completed';
        } else if (matchedApi.status === 'Half Time') {
          newStatus = 'live';
          newMinute = 45;
        } else if (matchedApi.status === 'Live') {
          newStatus = 'live';
        }

        // Check if update needed
        const scoreChanged = newScoreA !== dbMatch.score_a || newScoreB !== dbMatch.score_b;
        const minuteChanged = newMinute !== null && newMinute !== dbMatch.match_minute;
        const statusChanged = newStatus !== dbMatch.status;
        const hasGoalData = (goalsTeamA?.length || 0) > 0 || (goalsTeamB?.length || 0) > 0;

        if (scoreChanged || minuteChanged || statusChanged || hasGoalData) {
          const updateData: Record<string, unknown> = {};
          
          if (newScoreA !== null) updateData.score_a = newScoreA;
          if (newScoreB !== null) updateData.score_b = newScoreB;
          if (newMinute !== null) updateData.match_minute = newMinute;
          if (statusChanged) updateData.status = newStatus;
          if (goalsTeamA) updateData.goals_team_a = goalsTeamA;
          if (goalsTeamB) updateData.goals_team_b = goalsTeamB;
          updateData.last_api_sync = new Date().toISOString();

          const { error: updateError } = await supabase
            .from('matches')
            .update(updateData)
            .eq('id', dbMatch.id);

          if (updateError) {
            console.error(`[auto-sync-football] Error updating match ${dbMatch.id}:`, updateError);
          } else {
            console.log(`[auto-sync-football] Updated ${teamAName} vs ${teamBName}: ${newScoreA}-${newScoreB} (${newMinute}')`);
            updatedCount++;
            results.push({
              matchId: dbMatch.id,
              teamA: teamAName,
              teamB: teamBName,
              scoreA: newScoreA,
              scoreB: newScoreB,
            });
          }
        }

        // Sync lineup data
        if (lineupTeamA?.length || lineupTeamB?.length) {
          const { data: existingLineup } = await supabase
            .from('match_playing_xi')
            .select('id')
            .eq('match_id', dbMatch.id)
            .limit(1);
          
          if (!existingLineup || existingLineup.length === 0) {
            const lineupInserts = [];
            
            if (lineupTeamA) {
              for (let i = 0; i < lineupTeamA.length; i++) {
                const player = lineupTeamA[i];
                lineupInserts.push({
                  match_id: dbMatch.id,
                  team_id: teamAId,
                  player_name: player.name,
                  player_role: player.position || null,
                  batting_order: i + 1,
                  is_captain: player.isCaptain || false,
                  is_vice_captain: false,
                });
              }
            }
            
            if (lineupTeamB) {
              for (let i = 0; i < lineupTeamB.length; i++) {
                const player = lineupTeamB[i];
                lineupInserts.push({
                  match_id: dbMatch.id,
                  team_id: teamBId,
                  player_name: player.name,
                  player_role: player.position || null,
                  batting_order: i + 1,
                  is_captain: player.isCaptain || false,
                  is_vice_captain: false,
                });
              }
            }
            
            if (lineupInserts.length > 0) {
              const { error: lineupError } = await supabase
                .from('match_playing_xi')
                .insert(lineupInserts);
              
              if (lineupError) {
                console.error(`[auto-sync-football] Error inserting lineup:`, lineupError);
              } else {
                console.log(`[auto-sync-football] Inserted ${lineupInserts.length} players for ${teamAName} vs ${teamBName}`);
              }
            }
          }
        }

        // Sync substitution data
        if (subsTeamA?.length || subsTeamB?.length) {
          const { data: existingSubs } = await supabase
            .from('match_substitutions')
            .select('id, minute, player_in, player_out')
            .eq('match_id', dbMatch.id);
          
          const existingSubsSet = new Set(
            (existingSubs || []).map(s => `${s.minute}-${s.player_in}-${s.player_out}`)
          );
          
          const subsInserts = [];
          
          if (subsTeamA) {
            for (const sub of subsTeamA) {
              if (!sub.playerIn || !sub.playerOut || 
                  sub.playerIn === 'Unknown' || sub.playerOut === 'Unknown') {
                continue;
              }
              const key = `${sub.minute}-${sub.playerIn}-${sub.playerOut}`;
              if (!existingSubsSet.has(key)) {
                subsInserts.push({
                  match_id: dbMatch.id,
                  team_id: teamAId,
                  player_out: sub.playerOut,
                  player_in: sub.playerIn,
                  minute: sub.minute,
                });
                existingSubsSet.add(key);
              }
            }
          }
          
          if (subsTeamB) {
            for (const sub of subsTeamB) {
              if (!sub.playerIn || !sub.playerOut || 
                  sub.playerIn === 'Unknown' || sub.playerOut === 'Unknown') {
                continue;
              }
              const key = `${sub.minute}-${sub.playerIn}-${sub.playerOut}`;
              if (!existingSubsSet.has(key)) {
                subsInserts.push({
                  match_id: dbMatch.id,
                  team_id: teamBId,
                  player_out: sub.playerOut,
                  player_in: sub.playerIn,
                  minute: sub.minute,
                });
                existingSubsSet.add(key);
              }
            }
          }
          
          if (subsInserts.length > 0) {
            const { error: subsError } = await supabase
              .from('match_substitutions')
              .insert(subsInserts);
            
            if (subsError) {
              console.error(`[auto-sync-football] Error inserting subs:`, subsError);
            } else {
              console.log(`[auto-sync-football] Inserted ${subsInserts.length} substitutions`);
            }
          }
        }
      } else {
        console.log(`[auto-sync-football] No API match found for ${teamAName} vs ${teamBName}`);
      }
    }

    console.log(`[auto-sync-football] Sync complete. Updated ${updatedCount} matches.`);

    return new Response(JSON.stringify({ 
      success: true, 
      updated: updatedCount,
      results,
      totalMatches: footballMatches.length,
      apiMatchesFound: apiMatches.length,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[auto-sync-football] Error:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
