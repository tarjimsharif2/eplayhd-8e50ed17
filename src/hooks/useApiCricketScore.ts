import { useState, useEffect, useCallback } from 'react';
import { usePublicSiteSettings } from './usePublicSiteSettings';
import { supabase } from '@/integrations/supabase/client';

export interface ApiCricketScoreData {
  homeTeam: string;
  awayTeam: string;
  homeTeamLogo?: string;
  awayTeamLogo?: string;
  homeScore: string;
  awayScore: string;
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
}

interface UseApiCricketScoreOptions {
  teamAName: string;
  teamBName: string;
  enabled?: boolean;
}

export const useApiCricketScore = ({
  teamAName,
  teamBName,
  enabled = true,
}: UseApiCricketScoreOptions) => {
  const [scoreData, setScoreData] = useState<ApiCricketScoreData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const { data: siteSettings } = usePublicSiteSettings();

  const fetchScore = useCallback(async () => {
    if (!siteSettings?.api_cricket_enabled) {
      return;
    }

    setIsLoading(true);
    setError(null);

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
          // Don't show error for disabled API - just return null
          if (data.error.includes('disabled') || data.error.includes('not configured')) {
            setScoreData(null);
            return;
          }
          throw new Error(data.error);
        }
        return;
      }

      const match = data.match;

      if (!match) {
        setScoreData(null);
        return;
      }

      setScoreData({
        homeTeam: match.homeTeam,
        awayTeam: match.awayTeam,
        homeTeamLogo: match.homeTeamLogo,
        awayTeamLogo: match.awayTeamLogo,
        homeScore: match.homeScore || '-',
        awayScore: match.awayScore || '-',
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
      });
    } catch (err) {
      console.error('Error fetching API Cricket score:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch score');
    } finally {
      setIsLoading(false);
    }
  }, [siteSettings?.api_cricket_enabled, teamAName, teamBName]);

  useEffect(() => {
    if (!enabled || !siteSettings?.api_cricket_enabled) {
      return;
    }

    // Initial fetch
    fetchScore();

    // Poll every 30 seconds for live updates
    const interval = setInterval(fetchScore, 30000);

    return () => clearInterval(interval);
  }, [enabled, fetchScore, siteSettings?.api_cricket_enabled]);

  return {
    scoreData,
    isLoading,
    error,
    refetch: fetchScore,
    isEnabled: siteSettings?.api_cricket_enabled && enabled,
  };
};
