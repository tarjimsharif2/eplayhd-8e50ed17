import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface ParsedToss {
  winner: string;
  winnerId?: string;
  decision: 'bat' | 'bowl';
  rawText: string;
  source: 'api' | 'manual';
}

interface UseMatchTossOptions {
  matchId: string;
  enabled?: boolean;
}

// Parse toss string like "Delhi Capitals Women, elected to bowl first"
const parseToss = (tossText: string): Omit<ParsedToss, 'source'> | null => {
  if (!tossText) return null;
  
  // Pattern: "TeamName, elected to bat/bowl first"
  const match = tossText.match(/^(.+?),?\s*elected\s+to\s+(bat|bowl)\s*(?:first)?$/i);
  
  if (match) {
    return {
      winner: match[1].trim(),
      decision: match[2].toLowerCase() as 'bat' | 'bowl',
      rawText: tossText,
    };
  }
  
  // Fallback: try alternate patterns
  const altMatch = tossText.match(/^(.+?)\s+(?:won|wins)\s+(?:the\s+)?toss\s+(?:and\s+)?(?:chose|opt(?:ed)?)\s+to\s+(bat|bowl)/i);
  if (altMatch) {
    return {
      winner: altMatch[1].trim(),
      decision: altMatch[2].toLowerCase() as 'bat' | 'bowl',
      rawText: tossText,
    };
  }
  
  return null;
};

export const useMatchToss = ({ matchId, enabled = true }: UseMatchTossOptions) => {
  const [tossRaw, setTossRaw] = useState<string | null>(null);
  const [manualToss, setManualToss] = useState<{ winnerId: string | null; winnerName: string | null; decision: string | null } | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Determine which toss to use: manual takes precedence if set
  const parsedToss = useMemo((): ParsedToss | null => {
    // Manual toss takes precedence
    if (manualToss?.winnerId && manualToss?.decision && manualToss?.winnerName) {
      return {
        winner: manualToss.winnerName,
        winnerId: manualToss.winnerId,
        decision: manualToss.decision as 'bat' | 'bowl',
        rawText: `${manualToss.winnerName}, elected to ${manualToss.decision} first`,
        source: 'manual',
      };
    }
    
    // Fall back to API toss
    if (tossRaw) {
      const parsed = parseToss(tossRaw);
      if (parsed) {
        return { ...parsed, source: 'api' };
      }
    }
    
    return null;
  }, [tossRaw, manualToss]);

  useEffect(() => {
    if (!enabled || !matchId) return;

    const fetchToss = async () => {
      setIsLoading(true);
      try {
        // Fetch both API toss and manual toss data
        const [apiResult, matchResult] = await Promise.all([
          supabase
            .from('match_api_scores')
            .select('toss')
            .eq('match_id', matchId)
            .maybeSingle(),
          supabase
            .from('matches')
            .select('toss_winner_id, toss_decision, team_a:teams!matches_team_a_id_fkey(id, name, short_name), team_b:teams!matches_team_b_id_fkey(id, name, short_name)')
            .eq('id', matchId)
            .single()
        ]);

        if (!apiResult.error && apiResult.data?.toss) {
          setTossRaw(apiResult.data.toss);
        }

        if (!matchResult.error && matchResult.data) {
          const { toss_winner_id, toss_decision, team_a, team_b } = matchResult.data;
          if (toss_winner_id && toss_decision) {
            const winnerTeam = (team_a as any)?.id === toss_winner_id ? team_a : team_b;
            setManualToss({
              winnerId: toss_winner_id,
              winnerName: (winnerTeam as any)?.name || (winnerTeam as any)?.short_name || null,
              decision: toss_decision,
            });
          }
        }
      } catch (err) {
        console.error('Error fetching toss:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchToss();

    // Subscribe to realtime updates for both tables
    const apiChannel = supabase
      .channel(`match-toss-api-${matchId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'match_api_scores',
          filter: `match_id=eq.${matchId}`,
        },
        (payload: any) => {
          if (payload.new?.toss) {
            setTossRaw(payload.new.toss);
          }
        }
      )
      .subscribe();

    const matchChannel = supabase
      .channel(`match-toss-manual-${matchId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'matches',
          filter: `id=eq.${matchId}`,
        },
        async (payload: any) => {
          if (payload.new?.toss_winner_id && payload.new?.toss_decision) {
            // Fetch team name for the winner
            const { data } = await supabase
              .from('teams')
              .select('id, name, short_name')
              .eq('id', payload.new.toss_winner_id)
              .single();
            
            if (data) {
              setManualToss({
                winnerId: payload.new.toss_winner_id,
                winnerName: data.name || data.short_name,
                decision: payload.new.toss_decision,
              });
            }
          } else if (!payload.new?.toss_winner_id) {
            setManualToss(null);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(apiChannel);
      supabase.removeChannel(matchChannel);
    };
  }, [matchId, enabled]);

  return { 
    toss: parsedToss?.rawText || tossRaw, 
    parsedToss, 
    isLoading,
    hasManualToss: !!manualToss?.winnerId,
    hasApiToss: !!tossRaw,
  };
};
