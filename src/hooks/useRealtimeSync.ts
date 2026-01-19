import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Hook that subscribes to realtime changes on critical tables
 * and invalidates React Query cache when data changes.
 * This ensures the UI stays in sync with the database.
 */
export const useRealtimeSync = () => {
  const queryClient = useQueryClient();

  useEffect(() => {
    // Subscribe to changes on multiple tables
    const channel = supabase
      .channel('db-changes')
      // Site settings changes
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'site_settings' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['site_settings'] });
          queryClient.invalidateQueries({ queryKey: ['site_settings_admin'] });
          queryClient.invalidateQueries({ queryKey: ['site_settings_public'] });
        }
      )
      // Matches changes
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'matches' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['matches'] });
        }
      )
      // Banners changes
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'banners' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['banners'] });
        }
      )
      // Teams changes
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'teams' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['teams'] });
        }
      )
      // Tournaments changes
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tournaments' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['tournaments'] });
        }
      )
      // Streaming servers changes
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'streaming_servers' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['streaming_servers'] });
        }
      )
      // Dynamic pages changes
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'dynamic_pages' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['dynamic_pages'] });
        }
      )
      // Sponsor notices changes
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sponsor_notices' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['sponsor_notices'] });
        }
      )
      // Points table changes
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tournament_points_table' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['points_table'] });
        }
      )
      // Match API scores changes
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'match_api_scores' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['match_api_scores'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);
};
