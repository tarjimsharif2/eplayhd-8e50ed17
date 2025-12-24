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
}

export const useSiteSettings = () => {
  return useQuery({
    queryKey: ['site_settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('site_settings')
        .select('*')
        .limit(1)
        .single();
      
      if (error) throw error;
      return data as SiteSettings;
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
