import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// Public site settings (excludes sensitive fields like cricket_api_key)
export interface PublicSiteSettings {
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
  // Cricket API enabled flag (but NOT the key)
  cricket_api_enabled: boolean;
}

export const usePublicSiteSettings = () => {
  return useQuery({
    queryKey: ['site_settings_public'],
    queryFn: async (): Promise<PublicSiteSettings | null> => {
      // Access the public view using type assertion
      const { data, error } = await (supabase as any)
        .from('site_settings_public')
        .select('*')
        .limit(1)
        .maybeSingle();
      
      if (error) throw error;
      return data as PublicSiteSettings | null;
    },
  });
};
