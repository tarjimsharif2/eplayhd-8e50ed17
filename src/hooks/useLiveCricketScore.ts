import { useState, useEffect, useCallback } from 'react';
import { usePublicSiteSettings } from './usePublicSiteSettings';
import { supabase } from '@/integrations/supabase/client';

export interface CricketScoreData {
  teamA: {
    name: string;
    score: string;
    overs: string;
  };
  teamB: {
    name: string;
    score: string;
    overs: string;
  };
  status: string;
  matchStatus: string;
  currentInnings: string;
  runRate: string;
  requiredRunRate: string;
  target: string;
  lastUpdated: Date;
}

interface UseLiveCricketScoreOptions {
  teamAName: string;
  teamBName: string;
  enabled?: boolean;
}

export const useLiveCricketScore = ({
  teamAName,
  teamBName,
  enabled = true,
}: UseLiveCricketScoreOptions) => {
  const [scoreData, setScoreData] = useState<CricketScoreData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const { data: siteSettings } = usePublicSiteSettings();

  const fetchScore = useCallback(async () => {
    if (!siteSettings?.cricket_api_enabled) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Call edge function instead of direct API call
      const { data, error: fnError } = await supabase.functions.invoke('cricket-api', {
        body: {
          action: 'getCurrentMatches',
          teamAName,
          teamBName,
        },
      });

      if (fnError) {
        throw new Error(fnError.message || 'Failed to fetch cricket scores');
      }

      if (!data?.success) {
        if (data?.error) {
          throw new Error(data.error);
        }
        return;
      }

      const matchingMatch = data.match;

      if (!matchingMatch) {
        setScoreData(null);
        return;
      }

      // Parse score data
      const normalizeTeamName = (name: string) => 
        name.toLowerCase().replace(/[^a-z0-9]/g, '');

      const teamANormalized = normalizeTeamName(teamAName);
      const teamBNormalized = normalizeTeamName(teamBName);

      const scores = matchingMatch.score || [];
      const teamAScore = scores.find((s: any) => 
        normalizeTeamName(s.inning || '').includes(teamANormalized)
      );
      const teamBScore = scores.find((s: any) => 
        normalizeTeamName(s.inning || '').includes(teamBNormalized)
      );

      setScoreData({
        teamA: {
          name: teamAName,
          score: teamAScore ? `${teamAScore.r || 0}/${teamAScore.w || 0}` : '-',
          overs: teamAScore ? `${teamAScore.o || 0}` : '-',
        },
        teamB: {
          name: teamBName,
          score: teamBScore ? `${teamBScore.r || 0}/${teamBScore.w || 0}` : '-',
          overs: teamBScore ? `${teamBScore.o || 0}` : '-',
        },
        status: matchingMatch.status || '',
        matchStatus: matchingMatch.matchType || '',
        currentInnings: scores.length > 0 ? scores[scores.length - 1]?.inning || '' : '',
        runRate: '-',
        requiredRunRate: '-',
        target: '-',
        lastUpdated: new Date(),
      });
    } catch (err) {
      console.error('Error fetching cricket score:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch score');
    } finally {
      setIsLoading(false);
    }
  }, [siteSettings?.cricket_api_enabled, teamAName, teamBName]);

  useEffect(() => {
    if (!enabled || !siteSettings?.cricket_api_enabled) {
      return;
    }

    // Initial fetch
    fetchScore();

    // Poll every 30 seconds for live updates
    const interval = setInterval(fetchScore, 30000);

    return () => clearInterval(interval);
  }, [enabled, fetchScore, siteSettings?.cricket_api_enabled]);

  return {
    scoreData,
    isLoading,
    error,
    refetch: fetchScore,
    isEnabled: siteSettings?.cricket_api_enabled,
  };
};
