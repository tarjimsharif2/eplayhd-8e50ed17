import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

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
}

export const useSiteSettings = () => {
  return useQuery({
    queryKey: ['site_settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('site_settings')
        .select('*')
        .limit(1)
        .maybeSingle();
      
      if (error) throw error;
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
    },
  });
};
