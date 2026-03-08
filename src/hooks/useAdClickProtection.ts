import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { usePublicSiteSettings } from '@/hooks/usePublicSiteSettings';
import { getDeviceFingerprint } from '@/lib/deviceFingerprint';

interface AdClickProtectionConfig {
  enabled: boolean;
  max_clicks: number;
  time_window_days: number;
  block_duration_hours: number;
}

const DEFAULT_CONFIG: AdClickProtectionConfig = {
  enabled: false,
  max_clicks: 10,
  time_window_days: 1,
  block_duration_hours: 24,
};

export const useAdClickProtection = () => {
  const { data: settings } = usePublicSiteSettings();
  const [isBlocked, setIsBlocked] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const fingerprintRef = useRef<string | null>(null);
  const checkedRef = useRef(false);

  const config: AdClickProtectionConfig = (settings as any)?.ad_click_protection || DEFAULT_CONFIG;

  // Check if device is blocked on mount
  useEffect(() => {
    if (!config.enabled || checkedRef.current) {
      setIsLoading(false);
      return;
    }

    const checkBlocked = async () => {
      try {
        const fp = await getDeviceFingerprint();
        fingerprintRef.current = fp;

        const { data } = await (supabase as any)
          .from('ad_click_logs')
          .select('blocked_until, click_count, first_click_at')
          .eq('device_fingerprint', fp)
          .maybeSingle();

        if (data?.blocked_until) {
          const blockedUntil = new Date(data.blocked_until);
          if (blockedUntil > new Date()) {
            setIsBlocked(true);
          } else {
            // Block expired, reset
            await (supabase as any)
              .from('ad_click_logs')
              .update({ 
                blocked_until: null, 
                click_count: 0, 
                first_click_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              })
              .eq('device_fingerprint', fp);
            setIsBlocked(false);
          }
        }
      } catch (err) {
        console.error('Ad click protection check failed:', err);
      } finally {
        setIsLoading(false);
        checkedRef.current = true;
      }
    };

    checkBlocked();
  }, [config.enabled]);

  // Track ad click
  const trackAdClick = useCallback(async () => {
    if (!config.enabled) return;

    try {
      const fp = fingerprintRef.current || await getDeviceFingerprint();
      fingerprintRef.current = fp;

      const now = new Date();
      const windowStart = new Date(now.getTime() - config.time_window_days * 24 * 60 * 60 * 1000);

      // Get existing record
      const { data: existing } = await (supabase as any)
        .from('ad_click_logs')
        .select('*')
        .eq('device_fingerprint', fp)
        .maybeSingle();

      if (existing) {
        const firstClick = new Date(existing.first_click_at);
        
        // If first click is outside the window, reset counter
        if (firstClick < windowStart) {
          await (supabase as any)
            .from('ad_click_logs')
            .update({
              click_count: 1,
              first_click_at: now.toISOString(),
              last_click_at: now.toISOString(),
              blocked_until: null,
              updated_at: now.toISOString(),
            })
            .eq('device_fingerprint', fp);
          return;
        }

        const newCount = (existing.click_count || 0) + 1;
        const updateData: any = {
          click_count: newCount,
          last_click_at: now.toISOString(),
          updated_at: now.toISOString(),
        };

        // Check if exceeded limit
        if (newCount >= config.max_clicks) {
          const blockedUntil = new Date(now.getTime() + config.block_duration_hours * 60 * 60 * 1000);
          updateData.blocked_until = blockedUntil.toISOString();
          setIsBlocked(true);
        }

        await (supabase as any)
          .from('ad_click_logs')
          .update(updateData)
          .eq('device_fingerprint', fp);
      } else {
        // First click from this device
        await (supabase as any)
          .from('ad_click_logs')
          .insert({
            device_fingerprint: fp,
            click_count: 1,
            first_click_at: now.toISOString(),
            last_click_at: now.toISOString(),
          });
      }
    } catch (err) {
      console.error('Ad click tracking failed:', err);
    }
  }, [config]);

  return {
    isBlocked: config.enabled ? isBlocked : false,
    isLoading: config.enabled ? isLoading : false,
    trackAdClick,
    config,
  };
};
