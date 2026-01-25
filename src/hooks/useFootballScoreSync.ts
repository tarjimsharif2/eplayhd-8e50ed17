import { useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { usePublicSiteSettings } from '@/hooks/usePublicSiteSettings';

interface FootballMatch {
  homeTeam: string;
  awayTeam: string;
  homeScore: string | null;
  awayScore: string | null;
  status: string;
  minute: string | null;
  competition: string | null;
  startTime: string | null;
}

interface SyncResult {
  matchId: string;
  teamA: string;
  teamB: string;
  scoreA: string | null;
  scoreB: string | null;
  status: string;
  updated: boolean;
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
  
  // Exact match
  if (normalizedDb === normalizedApi) return true;
  
  // One contains the other
  if (normalizedDb.includes(normalizedApi) || normalizedApi.includes(normalizedDb)) return true;
  
  // Word-based matching
  const dbWords = normalizedDb.split(' ').filter(w => w.length > 2);
  const apiWords = normalizedApi.split(' ').filter(w => w.length > 2);
  
  const matchingWords = dbWords.filter(w => apiWords.includes(w));
  if (matchingWords.length >= 1 && matchingWords.length >= Math.min(dbWords.length, apiWords.length) * 0.5) {
    return true;
  }
  
  return false;
}

export function useFootballScoreSync(intervalSeconds: number = 60) {
  const queryClient = useQueryClient();
  const { data: siteSettings } = usePublicSiteSettings();
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isSyncingRef = useRef(false);

  const syncScores = useCallback(async (): Promise<SyncResult[]> => {
    if (isSyncingRef.current) {
      console.log('[Football Sync] Already syncing, skipping...');
      return [];
    }

    isSyncingRef.current = true;
    const results: SyncResult[] = [];

    try {
      console.log('[Football Sync] Starting sync...');

      // Get all live football matches from database
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
          team_a:teams!matches_team_a_id_fkey(name, short_name),
          team_b:teams!matches_team_b_id_fkey(name, short_name),
          sport:sports!matches_sport_id_fkey(name)
        `)
        .eq('status', 'live')
        .eq('is_active', true);

      if (matchError) {
        console.error('[Football Sync] Error fetching matches:', matchError);
        return results;
      }

      // Filter only football matches with auto_sync enabled
      const footballMatches = (liveMatches || []).filter(m => 
        m.sport?.name?.toLowerCase() === 'football' && 
        m.auto_sync_enabled === true
      );

      if (footballMatches.length === 0) {
        console.log('[Football Sync] No live football matches with auto-sync enabled');
        return results;
      }

      console.log(`[Football Sync] Found ${footballMatches.length} live football matches`);

      // Fetch scores from ESPN API (all leagues)
      const { data: apiResponse, error: apiError } = await supabase.functions.invoke(
        'scrape-football-scores',
        { body: { allLeagues: true } }
      );

      if (apiError || !apiResponse?.success) {
        console.error('[Football Sync] API error:', apiError || apiResponse?.error);
        return results;
      }

      const apiMatches: FootballMatch[] = apiResponse.matches || [];
      console.log(`[Football Sync] API returned ${apiMatches.length} matches`);

      // Match and update scores
      for (const dbMatch of footballMatches) {
        const teamAName = dbMatch.team_a?.name || '';
        const teamAShort = dbMatch.team_a?.short_name || '';
        const teamBName = dbMatch.team_b?.name || '';
        const teamBShort = dbMatch.team_b?.short_name || '';

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
          }

          // Check if update needed
          const scoreChanged = newScoreA !== dbMatch.score_a || newScoreB !== dbMatch.score_b;
          const minuteChanged = newMinute !== null && newMinute !== dbMatch.match_minute;
          const statusChanged = newStatus !== dbMatch.status;

          if (scoreChanged || minuteChanged || statusChanged) {
            const updateData: Record<string, unknown> = {};
            
            if (newScoreA !== null) updateData.score_a = newScoreA;
            if (newScoreB !== null) updateData.score_b = newScoreB;
            if (newMinute !== null) updateData.match_minute = newMinute;
            if (statusChanged) updateData.status = newStatus;
            updateData.last_api_sync = new Date().toISOString();

            const { error: updateError } = await supabase
              .from('matches')
              .update(updateData)
              .eq('id', dbMatch.id);

            if (updateError) {
              console.error(`[Football Sync] Error updating match ${dbMatch.id}:`, updateError);
            } else {
              console.log(`[Football Sync] Updated ${teamAName} vs ${teamBName}: ${newScoreA}-${newScoreB} (${newMinute}')`);
              results.push({
                matchId: dbMatch.id,
                teamA: teamAName,
                teamB: teamBName,
                scoreA: newScoreA,
                scoreB: newScoreB,
                status: newStatus,
                updated: true,
              });
            }
          }
        } else {
          console.log(`[Football Sync] No API match found for ${teamAName} vs ${teamBName}`);
        }
      }

      // Invalidate queries to refresh UI
      if (results.length > 0) {
        queryClient.invalidateQueries({ queryKey: ['matches'] });
      }

      console.log(`[Football Sync] Sync complete. Updated ${results.length} matches.`);

    } catch (error) {
      console.error('[Football Sync] Sync error:', error);
    } finally {
      isSyncingRef.current = false;
    }

    return results;
  }, [queryClient]);

  useEffect(() => {
    // Initial sync
    syncScores();

    // Set up interval
    intervalRef.current = setInterval(() => {
      syncScores();
    }, intervalSeconds * 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [syncScores, intervalSeconds]);

  return { syncScores };
}
