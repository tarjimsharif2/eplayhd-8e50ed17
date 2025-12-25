import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface TeamScore {
  name: string;
  score: string;
  overs: string;
}

interface CricbuzzScoreData {
  team1: TeamScore | null;
  team2: TeamScore | null;
  status: string;
  lastUpdated: string;
}

interface UseCricbuzzScoreOptions {
  cricbuzzMatchId: string | null;
  enabled?: boolean;
  refreshInterval?: number;
}

export const useCricbuzzScore = ({
  cricbuzzMatchId,
  enabled = true,
  refreshInterval = 30000,
}: UseCricbuzzScoreOptions) => {
  const [scoreData, setScoreData] = useState<CricbuzzScoreData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchScore = useCallback(async () => {
    if (!cricbuzzMatchId || !enabled) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('scrape-cricket-score', {
        body: { cricbuzzMatchId },
      });

      if (fnError) {
        throw new Error(fnError.message);
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      setScoreData(data);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch score';
      setError(errorMessage);
      console.error('Error fetching Cricbuzz score:', err);
    } finally {
      setIsLoading(false);
    }
  }, [cricbuzzMatchId, enabled]);

  useEffect(() => {
    if (!cricbuzzMatchId || !enabled) {
      setScoreData(null);
      return;
    }

    fetchScore();

    const interval = setInterval(fetchScore, refreshInterval);
    return () => clearInterval(interval);
  }, [cricbuzzMatchId, enabled, refreshInterval, fetchScore]);

  return {
    scoreData,
    isLoading,
    error,
    refetch: fetchScore,
    isEnabled: !!cricbuzzMatchId && enabled,
  };
};
