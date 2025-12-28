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

  // Fetch scores from database (synced by admin)
  const fetchFromDatabase = useCallback(async () => {
    if (!matchId) return null;

    try {
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

      // Only return if we have synced scores
      if (!match.score_a && !match.score_b) return null;

      return {
        homeTeam: match.team_a?.name || teamAName,
        awayTeam: match.team_b?.name || teamBName,
        homeTeamLogo: match.team_a?.logo_url,
        awayTeamLogo: match.team_b?.logo_url,
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

  // Fetch live scores from API (fallback or manual refresh)
  const fetchFromApi = useCallback(async () => {
    if (!siteSettings?.api_cricket_enabled) {
      return null;
    }

    try {
      const { data, error: fnError } = await supabase.functions.invoke('api-cricket', {
        body: {
          action: 'getLiveScore',
          teamAName,
          teamBName,
        },
      });

      if (fnError) {
        throw new Error(fnError.message || 'Failed to fetch cricket scores');
      }

      if (!data?.success) {
        if (data?.error) {
          if (data.error.includes('disabled') || data.error.includes('not configured')) {
            return null;
          }
          throw new Error(data.error);
        }
        return null;
      }

      const match = data.match;
      if (!match) return null;

      return {
        homeTeam: match.homeTeam,
        awayTeam: match.awayTeam,
        homeTeamLogo: match.homeTeamLogo,
        awayTeamLogo: match.awayTeamLogo,
        homeScore: match.homeScore || '-',
        awayScore: match.awayScore || '-',
        homeOvers: match.homeOvers,
        awayOvers: match.awayOvers,
        homeRunRate: match.homeRunRate,
        awayRunRate: match.awayRunRate,
        status: match.status,
        statusInfo: match.statusInfo,
        eventLive: match.eventLive,
        eventType: match.eventType,
        toss: match.toss,
        venue: match.venue,
        leagueName: match.leagueName,
        lastUpdated: new Date(),
        fromDatabase: false,
        batsmen: match.batsmen || [],
        bowlers: match.bowlers || [],
        scorecard: match.scorecard || [],
        extras: match.extras || [],
      } as ApiCricketScoreData;
    } catch (err) {
      console.error('Error fetching API Cricket score:', err);
      throw err;
    }
  }, [siteSettings?.api_cricket_enabled, teamAName, teamBName]);

  const fetchScore = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // First, try to get from database (admin-synced scores)
      const dbData = await fetchFromDatabase();
      
      // If API is enabled, try to get detailed data (batting/bowling)
      if (siteSettings?.api_cricket_enabled) {
        try {
          const apiData = await fetchFromApi();
          if (apiData) {
            // If we have both DB and API data, merge them (prefer DB scores, API details)
            if (dbData) {
              setScoreData({
                ...apiData,
                homeScore: dbData.homeScore || apiData.homeScore,
                awayScore: dbData.awayScore || apiData.awayScore,
                status: dbData.status,
                eventLive: dbData.eventLive,
                lastUpdated: dbData.lastUpdated,
                fromDatabase: true,
              });
            } else {
              setScoreData(apiData);
            }
            return;
          }
        } catch (apiErr) {
          console.log('API fetch failed, using DB data if available');
        }
      }
      
      // Fallback to DB data only
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
  }, [fetchFromDatabase, fetchFromApi, siteSettings?.api_cricket_enabled]);

  // Set up realtime subscription for match updates
  useEffect(() => {
    if (!enabled || !matchId) return;

    // Initial fetch
    fetchScore();

    // Subscribe to realtime updates for this match
    const channel = supabase
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
          // When match is updated (by admin sync), refresh the score
          fetchScore();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [enabled, matchId, fetchScore]);

  // Manual refetch function (can force API call)
  const refetch = useCallback(async (forceApi = false) => {
    setIsLoading(true);
    setError(null);

    try {
      if (forceApi && siteSettings?.api_cricket_enabled) {
        const apiData = await fetchFromApi();
        if (apiData) {
          setScoreData(apiData);
        }
      } else {
        await fetchScore();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch score');
    } finally {
      setIsLoading(false);
    }
  }, [fetchScore, fetchFromApi, siteSettings?.api_cricket_enabled]);

  return {
    scoreData,
    isLoading,
    error,
    refetch,
    isEnabled: siteSettings?.api_cricket_enabled && enabled,
  };
};
