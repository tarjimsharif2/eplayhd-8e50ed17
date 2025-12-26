import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// Full site settings (only accessible by admins)
export interface SiteSettings {
  id: string;
  site_name: string;
  site_title: string;
  site_description: string | null;
  site_keywords: string | null;
  logo_url: string | null;
  favicon_url: string | null;
  og_image_url: string | null;
  footer_text: string | null;
  google_analytics_id: string | null;
  created_at: string;
  updated_at: string;
  // Ad settings
  header_ad_code: string | null;
  sidebar_ad_code: string | null;
  footer_ad_code: string | null;
  in_article_ad_code: string | null;
  popup_ad_code: string | null;
  ads_enabled: boolean;
  google_adsense_id: string | null;
  // Additional SEO
  canonical_url: string | null;
  robots_txt: string | null;
  schema_org_enabled: boolean;
  twitter_handle: string | null;
  facebook_app_id: string | null;
  telegram_link: string | null;
  social_links: Record<string, string>;
  // Cricket API settings (sensitive - admin only)
  cricket_api_key: string | null;
  cricket_api_enabled: boolean;
  // SMTP settings
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_user: string | null;
  smtp_password: string | null;
  smtp_from_email: string | null;
  smtp_from_name: string | null;
  smtp_enabled: boolean;
}

// Admin-only hook for full site settings (requires admin role)
export const useSiteSettings = () => {
  return useQuery({
    queryKey: ['site_settings_admin'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('site_settings')
        .select('*')
        .limit(1)
        .maybeSingle();
      
      if (error) {
        // If RLS blocks access, return null instead of throwing
        if (error.code === 'PGRST116' || error.message.includes('row-level security')) {
          console.warn('Access to full site settings denied - admin role required');
          return null;
        }
        throw error;
      }
      return data as SiteSettings | null;
    },
  });
};

export const useUpdateSiteSettings = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, ...settings }: Partial<SiteSettings> & { id: string }) => {
      const { data, error } = await supabase
        .from('site_settings')
        .update(settings)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['site_settings'] });
      queryClient.invalidateQueries({ queryKey: ['site_settings_admin'] });
    },
  });
};
