import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Match, Innings } from '@/hooks/useSportsData';
import { useQueryClient } from '@tanstack/react-query';

export const useRealtimeMatch = (matchId: string | undefined) => {
  const queryClient = useQueryClient();
  const [realtimeMatch, setRealtimeMatch] = useState<Partial<Match> | null>(null);

  useEffect(() => {
    if (!matchId) return;

    // Subscribe to match changes
    const matchChannel = supabase
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
          console.log('Match update received:', payload);
          setRealtimeMatch(payload.new as Partial<Match>);
          // Also invalidate the query cache to ensure data consistency
          queryClient.invalidateQueries({ queryKey: ['match', matchId] });
        }
      )
      .subscribe();

    // Subscribe to innings changes for this match
    const inningsChannel = supabase
      .channel(`innings-${matchId}`)
      .on(
        'postgres_changes',
        {
          event: '*', // Listen to INSERT, UPDATE, DELETE
          schema: 'public',
          table: 'match_innings',
          filter: `match_id=eq.${matchId}`,
        },
        (payload) => {
          console.log('Innings update received:', payload);
          // Invalidate innings query to refetch latest data
          queryClient.invalidateQueries({ queryKey: ['match-innings', matchId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(matchChannel);
      supabase.removeChannel(inningsChannel);
    };
  }, [matchId, queryClient]);

  return { realtimeMatch };
};

// Hook for subscribing to all live matches (for homepage/tournament pages)
export const useRealtimeLiveMatches = () => {
  const queryClient = useQueryClient();

  useEffect(() => {
    // Subscribe to all match updates for live matches
    const matchChannel = supabase
      .channel('live-matches')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'matches',
        },
        (payload) => {
          console.log('Live match update received:', payload);
          // Immediately invalidate and refetch matches query
          queryClient.invalidateQueries({ queryKey: ['matches'] });
          queryClient.refetchQueries({ queryKey: ['matches'] });
        }
      )
      .subscribe();

    // Also subscribe to match_api_scores updates (scores sync from API)
    const apiScoresChannel = supabase
      .channel('live-api-scores')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'match_api_scores',
        },
        (payload) => {
          console.log('API scores update received:', payload);
          // Immediately invalidate and refetch matches query
          queryClient.invalidateQueries({ queryKey: ['matches'] });
          queryClient.refetchQueries({ queryKey: ['matches'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(matchChannel);
      supabase.removeChannel(apiScoresChannel);
    };
  }, [queryClient]);
};
