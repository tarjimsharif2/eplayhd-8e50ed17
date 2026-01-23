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

  // Normalize team name for matching
  const normalizeTeamName = (name: string): string => {
    return (name || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
  };

  // Common team name aliases for international teams
  const teamAliases: Record<string, string[]> = {
    'australia': ['aus', 'australian', 'aussies'],
    'england': ['eng', 'english'],
    'india': ['ind', 'indian', 'team india'],
    'pakistan': ['pak', 'pakistani'],
    'south africa': ['sa', 'rsa', 'proteas'],
    'new zealand': ['nz', 'nzl', 'kiwis', 'black caps', 'blackcaps'],
    'west indies': ['wi', 'windies', 'caribbean'],
    'sri lanka': ['sl', 'srilanka', 'sri lankan'],
    'bangladesh': ['ban', 'bd', 'bangladeshi', 'tigers'],
    'afghanistan': ['afg', 'afghan'],
  };

  // Get canonical team name from aliases
  const getCanonicalName = (name: string): string => {
    const normalized = normalizeTeamName(name);
    for (const [canonical, aliases] of Object.entries(teamAliases)) {
      if (normalized === canonical || aliases.includes(normalized)) {
        return canonical;
      }
    }
    return normalized;
  };

  // STRICT team name matching - prevents wrong matches like "Rajshahi" vs "Rajasthan"
  const teamsMatch = (name1: string, name2: string): boolean => {
    const n1 = normalizeTeamName(name1);
    const n2 = normalizeTeamName(name2);
    
    if (!n1 || !n2) return false;
    
    // Exact match
    if (n1 === n2) return true;
    
    // Canonical name match (handles aliases like AUS = Australia)
    const canonical1 = getCanonicalName(n1);
    const canonical2 = getCanonicalName(n2);
    if (canonical1 === canonical2 && canonical1 !== n1 && canonical2 !== n2) {
      return true;
    }
    
    const words1 = n1.split(' ').filter(w => w.length > 0);
    const words2 = n2.split(' ').filter(w => w.length > 0);
    
    // Short codes (3 chars or less) - ONLY match via known aliases
    if (words1.length === 1 && n1.length <= 3) {
      for (const [canonical, aliases] of Object.entries(teamAliases)) {
        if (aliases.includes(n1) && (canonical2 === canonical || n2.includes(canonical))) {
          return true;
        }
      }
      return false;
    }
    if (words2.length === 1 && n2.length <= 3) {
      for (const [canonical, aliases] of Object.entries(teamAliases)) {
        if (aliases.includes(n2) && (canonical1 === canonical || n1.includes(canonical))) {
          return true;
        }
      }
      return false;
    }
    
    // Get first and last words
    const firstWord1 = words1[0];
    const lastWord1 = words1[words1.length - 1];
    const firstWord2 = words2[0];
    const lastWord2 = words2[words2.length - 1];
    
    // STRICT: If both have 2+ words, BOTH first AND last words must match exactly
    if (words1.length >= 2 && words2.length >= 2) {
      return firstWord1 === firstWord2 && lastWord1 === lastWord2;
    }
    
    // STRICT: Single word (4+ chars) must exactly match first or last word of the other
    if (words1.length === 1 && n1.length >= 4) {
      return firstWord2 === n1 || lastWord2 === n1;
    }
    if (words2.length === 1 && n2.length >= 4) {
      return firstWord1 === n2 || lastWord1 === n2;
    }
    
    // Check if one is a complete word in the other (e.g., "australia" in "australia men")
    if (n1.length >= 5 && n2.length >= 5) {
      if (words2.includes(n1) || words1.includes(n2)) {
        return true;
      }
    }
    
    return false;
  };

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

      const teamAInfo = match.team_a as any;
      const teamBInfo = match.team_b as any;

      // If we have detailed API scores, use them with correct team mapping
      if (apiScores) {
        // Determine which API side (home/away) corresponds to which database team (A/B)
        // by matching team names
        const homeMatchesTeamA = teamsMatch(apiScores.home_team || '', teamAInfo?.name || teamAName);
        const awayMatchesTeamA = teamsMatch(apiScores.away_team || '', teamAInfo?.name || teamAName);
        
        // Map scores to correct teams based on name matching
        let teamAScore: string;
        let teamAOvers: string | null;
        let teamBScore: string;
        let teamBOvers: string | null;
        
        if (homeMatchesTeamA) {
          // home = teamA, away = teamB
          teamAScore = apiScores.home_score || '';
          teamAOvers = apiScores.home_overs || null;
          teamBScore = apiScores.away_score || '';
          teamBOvers = apiScores.away_overs || null;
        } else if (awayMatchesTeamA) {
          // away = teamA, home = teamB  
          teamAScore = apiScores.away_score || '';
          teamAOvers = apiScores.away_overs || null;
          teamBScore = apiScores.home_score || '';
          teamBOvers = apiScores.home_overs || null;
        } else {
          // Can't determine mapping, use home=A, away=B as fallback
          teamAScore = apiScores.home_score || '';
          teamAOvers = apiScores.home_overs || null;
          teamBScore = apiScores.away_score || '';
          teamBOvers = apiScores.away_overs || null;
        }

        return {
          // Return with teamA/teamB naming for consistency
          homeTeam: teamAInfo?.name || teamAName,
          awayTeam: teamBInfo?.name || teamBName,
          homeTeamLogo: teamAInfo?.logo_url,
          awayTeamLogo: teamBInfo?.logo_url,
          homeScore: teamAScore,
          awayScore: teamBScore,
          homeOvers: teamAOvers,
          awayOvers: teamBOvers,
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
        homeTeam: teamAInfo?.name || teamAName,
        awayTeam: teamBInfo?.name || teamBName,
        homeTeamLogo: teamAInfo?.logo_url,
        awayTeamLogo: teamBInfo?.logo_url,
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

  // Set up realtime subscription for match updates with fallback polling
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
          console.log('API scores updated via realtime:', payload);
          fetchScore();
        }
      )
      .subscribe((status) => {
        console.log('match_api_scores subscription status:', status);
      });

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
          console.log('Match updated via realtime:', payload);
          fetchScore();
        }
      )
      .subscribe((status) => {
        console.log('matches subscription status:', status);
      });

    // Fallback polling every 30 seconds in case realtime misses updates
    const pollInterval = setInterval(() => {
      fetchScore();
    }, 30000);

    return () => {
      supabase.removeChannel(apiScoresChannel);
      supabase.removeChannel(matchesChannel);
      clearInterval(pollInterval);
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