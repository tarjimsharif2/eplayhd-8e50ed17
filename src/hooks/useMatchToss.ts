import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface ParsedToss {
  winner: string;
  decision: 'bat' | 'bowl';
  rawText: string;
}

interface UseMatchTossOptions {
  matchId: string;
  enabled?: boolean;
}

// Parse toss string like "Delhi Capitals Women, elected to bowl first"
const parseToss = (tossText: string): ParsedToss | null => {
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
  const [isLoading, setIsLoading] = useState(false);

  const parsedToss = useMemo(() => {
    if (!tossRaw) return null;
    return parseToss(tossRaw);
  }, [tossRaw]);

  useEffect(() => {
    if (!enabled || !matchId) return;

    const fetchToss = async () => {
      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from('match_api_scores')
          .select('toss')
          .eq('match_id', matchId)
          .maybeSingle();

        if (!error && data?.toss) {
          setTossRaw(data.toss);
        }
      } catch (err) {
        console.error('Error fetching toss:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchToss();

    // Subscribe to realtime updates
    const channel = supabase
      .channel(`match-toss-${matchId}`)
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

    return () => {
      supabase.removeChannel(channel);
    };
  }, [matchId, enabled]);

  return { toss: tossRaw, parsedToss, isLoading };
};
