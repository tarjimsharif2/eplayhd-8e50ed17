import { useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Match } from '@/hooks/useSportsData';

/**
 * This hook is now DEPRECATED and does nothing.
 * Match status updates are handled server-side by the update-match-status edge function
 * which is called via a cron job. This prevents race conditions between client and server.
 * 
 * The hook is kept for backward compatibility but no longer performs any updates.
 */
export const useMatchStatusUpdater = (matches: Match[] | undefined) => {
  // No-op: Match status is now managed exclusively by the server-side edge function
  // This prevents race conditions where client and server might update status simultaneously
};
