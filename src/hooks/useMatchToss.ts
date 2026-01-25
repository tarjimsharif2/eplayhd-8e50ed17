import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface UseMatchTossOptions {
  matchId: string;
  enabled?: boolean;
}

export const useMatchToss = ({ matchId, enabled = true }: UseMatchTossOptions) => {
  const [toss, setToss] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

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
          setToss(data.toss);
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
            setToss(payload.new.toss);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [matchId, enabled]);

  return { toss, isLoading };
};
