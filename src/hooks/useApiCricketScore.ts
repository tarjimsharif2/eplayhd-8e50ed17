import { useState, useEffect, useCallback } from 'react';
import { usePublicSiteSettings } from './usePublicSiteSettings';
import { supabase } from '@/integrations/supabase/client';

export interface BatsmanData {
  player: string;
  runs: string;
  balls: string;
  fours: string;
  sixes: string;
  sr: string;
  how_out: string;
  team?: string;
  innings?: string;
}

export interface BowlerData {
  player: string;
  overs: string;
  maidens: string;
  runs: string;
  wickets: string;
  econ: string;
  team?: string;
  innings?: string;
}

export interface ExtrasData {
  wides: number;
  noballs: number;
  byes: number;
  legbyes: number;
  total: number;
  team?: string;
  innings?: string;
}

export interface ApiCricketScoreData {
  homeTeam: string;
  awayTeam: string;
  homeTeamLogo?: string;
  awayTeamLogo?: string;
  homeScore: string;
  awayScore: string;
  homeOvers?: string | null;
  awayOvers?: string | null;
  homeRunRate?: string | null;
  awayRunRate?: string | null;
  status: string;
  statusInfo?: string;
  eventLive: boolean;
  eventType?: string;
  toss?: string;
  venue?: string;
  leagueName?: string;
  lastUpdated: Date;
  fromDatabase?: boolean;
  batsmen?: BatsmanData[];
  bowlers?: BowlerData[];
  scorecard?: any[];
  extras?: ExtrasData[];
}

interface UseApiCricketScoreOptions {
  teamAName: string;
  teamBName: string;
  enabled?: boolean;
  matchId?: string;
}

export const useApiCricketScore = ({
  teamAName,
  teamBName,
  enabled = true,
  matchId,
}: UseApiCricketScoreOptions) => {
  const [scoreData, setScoreData] = useState<ApiCricketScoreData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const { data: siteSettings } = usePublicSiteSettings();

  // Fetch scores from database only (synced by server-side cron job)
  const fetchFromDatabase = useCallback(async () => {
    if (!matchId) return null;

    try {
      // First, try to get detailed data from match_api_scores
      const { data: apiScores, error: apiScoresError } = await supabase
        .from('match_api_scores')
        .select('*')
        .eq('match_id', matchId)
        .maybeSingle();

      if (apiScoresError) {
        console.error('Error fetching API scores:', apiScoresError);
      }

      // Also get basic match info
      const { data: match, error: matchError } = await supabase
        .from('matches')
        .select(`
          score_a,
          score_b,
          status,
          last_api_sync,
          team_a:teams!matches_team_a_id_fkey(name, short_name, logo_url),
          team_b:teams!matches_team_b_id_fkey(name, short_name, logo_url)
        `)
        .eq('id', matchId)
        .maybeSingle();

      if (matchError || !match) return null;

      // If we have detailed API scores, use them
      if (apiScores) {
        return {
          homeTeam: apiScores.home_team || (match.team_a as any)?.name || teamAName,
          awayTeam: apiScores.away_team || (match.team_b as any)?.name || teamBName,
          homeTeamLogo: (match.team_a as any)?.logo_url,
          awayTeamLogo: (match.team_b as any)?.logo_url,
          homeScore: apiScores.home_score || match.score_a || '-',
          awayScore: apiScores.away_score || match.score_b || '-',
          homeOvers: apiScores.home_overs,
          awayOvers: apiScores.away_overs,
          status: apiScores.status || (match.status === 'live' ? 'Live' : match.status === 'completed' ? 'Finished' : 'Upcoming'),
          statusInfo: apiScores.status_info,
          eventLive: apiScores.event_live || match.status === 'live',
          venue: apiScores.venue,
          toss: apiScores.toss,
          lastUpdated: apiScores.last_synced_at ? new Date(apiScores.last_synced_at) : new Date(),
          fromDatabase: true,
          batsmen: (apiScores.batsmen as unknown as BatsmanData[]) || [],
          bowlers: (apiScores.bowlers as unknown as BowlerData[]) || [],
          extras: (apiScores.extras as unknown as ExtrasData[]) || [],
        } as ApiCricketScoreData;
      }

      // Fallback to basic match info only
      if (!match.score_a && !match.score_b) return null;

      return {
        homeTeam: (match.team_a as any)?.name || teamAName,
        awayTeam: (match.team_b as any)?.name || teamBName,
        homeTeamLogo: (match.team_a as any)?.logo_url,
        awayTeamLogo: (match.team_b as any)?.logo_url,
        homeScore: match.score_a || '-',
        awayScore: match.score_b || '-',
        status: match.status === 'live' ? 'Live' : match.status === 'completed' ? 'Finished' : 'Upcoming',
        eventLive: match.status === 'live',
        lastUpdated: match.last_api_sync ? new Date(match.last_api_sync) : new Date(),
        fromDatabase: true,
      } as ApiCricketScoreData;
    } catch (err) {
      console.error('Error fetching from database:', err);
      return null;
    }
  }, [matchId, teamAName, teamBName]);

  const fetchScore = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const dbData = await fetchFromDatabase();
      if (dbData) {
        setScoreData(dbData);
      } else {
        setScoreData(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch score');
    } finally {
      setIsLoading(false);
    }
  }, [fetchFromDatabase]);

  // Set up realtime subscription for match updates
  useEffect(() => {
    if (!enabled || !matchId) return;

    // Initial fetch
    fetchScore();

    // Subscribe to realtime updates for match_api_scores
    const apiScoresChannel = supabase
      .channel(`match-api-scores-${matchId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'match_api_scores',
          filter: `match_id=eq.${matchId}`,
        },
        (payload) => {
          console.log('API scores updated:', payload);
          fetchScore();
        }
      )
      .subscribe();

    // Also subscribe to main matches table updates
    const matchesChannel = supabase
      .channel(`match-${matchId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'matches',
          filter: `id=eq.${matchId}`,
        },
        (payload) => {
          fetchScore();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(apiScoresChannel);
      supabase.removeChannel(matchesChannel);
    };
  }, [enabled, matchId, fetchScore]);

  // Refetch just re-reads from database (no API calls from client)
  const refetch = useCallback(async () => {
    await fetchScore();
  }, [fetchScore]);

  return {
    scoreData,
    isLoading,
    error,
    refetch,
    isEnabled: siteSettings?.api_cricket_enabled && enabled,
  };
};