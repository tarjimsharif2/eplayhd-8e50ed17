import { useState, useEffect, useCallback } from 'react';
import { useSiteSettings } from './useSiteSettings';

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
  
  const { data: siteSettings } = useSiteSettings();

  const fetchScore = useCallback(async () => {
    if (!siteSettings?.cricket_api_enabled || !siteSettings?.cricket_api_key) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Fetch current matches from CricAPI
      const response = await fetch(
        `https://api.cricapi.com/v1/currentMatches?apikey=${siteSettings.cricket_api_key}&offset=0`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch cricket scores');
      }

      const data = await response.json();

      if (data.status !== 'success' || !data.data) {
        throw new Error(data.reason || 'No match data available');
      }

      // Find the matching match based on team names
      const normalizeTeamName = (name: string) => 
        name.toLowerCase().replace(/[^a-z0-9]/g, '');

      const teamANormalized = normalizeTeamName(teamAName);
      const teamBNormalized = normalizeTeamName(teamBName);

      const matchingMatch = data.data.find((match: any) => {
        if (!match.teams || match.teams.length < 2) return false;
        
        const matchTeams = match.teams.map((t: string) => normalizeTeamName(t));
        
        // Check if both teams are present in either order
        const hasTeamA = matchTeams.some((t: string) => 
          t.includes(teamANormalized) || teamANormalized.includes(t)
        );
        const hasTeamB = matchTeams.some((t: string) => 
          t.includes(teamBNormalized) || teamBNormalized.includes(t)
        );
        
        return hasTeamA && hasTeamB;
      });

      if (!matchingMatch) {
        setScoreData(null);
        return;
      }

      // Parse score data
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
  }, [siteSettings?.cricket_api_enabled, siteSettings?.cricket_api_key, teamAName, teamBName]);

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
    isEnabled: siteSettings?.cricket_api_enabled && siteSettings?.cricket_api_key,
  };
};
