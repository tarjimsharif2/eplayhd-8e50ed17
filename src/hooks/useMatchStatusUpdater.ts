import { useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Match } from '@/hooks/useSportsData';

export const useMatchStatusUpdater = (matches: Match[] | undefined) => {
  const updateMatchStatus = useCallback(async (matchId: string, newStatus: 'live' | 'completed') => {
    try {
      const { error } = await supabase
        .from('matches')
        .update({ status: newStatus })
        .eq('id', matchId);
      
      if (error) {
        console.error('Error updating match status:', error);
      }
    } catch (err) {
      console.error('Failed to update match status:', err);
    }
  }, []);

  useEffect(() => {
    if (!matches || matches.length === 0) return;

    const checkAndUpdateStatuses = () => {
      const now = new Date();

      matches.forEach((match) => {
        if (!match.match_start_time) return;

        const startTime = new Date(match.match_start_time);
        const durationMs = (match.match_duration_minutes || 180) * 60 * 1000;
        const endTime = new Date(startTime.getTime() + durationMs);

        // If match should be live (started but not ended)
        if (match.status === 'upcoming' && now >= startTime && now < endTime) {
          updateMatchStatus(match.id, 'live');
        }
        
        // If match should be completed (past end time)
        if ((match.status === 'upcoming' || match.status === 'live') && now >= endTime) {
          updateMatchStatus(match.id, 'completed');
        }
      });
    };

    // Check immediately
    checkAndUpdateStatuses();

    // Check every 30 seconds
    const interval = setInterval(checkAndUpdateStatuses, 30000);

    return () => clearInterval(interval);
  }, [matches, updateMatchStatus]);
};
