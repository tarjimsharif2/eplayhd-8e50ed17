import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface DynamicPage {
  id: string;
  slug: string;
  title: string;
  content: string | null;
  content_type: 'html' | 'text';
  is_active: boolean;
  show_in_header: boolean;
  show_in_footer: boolean;
  display_order: number;
  seo_title: string | null;
  seo_description: string | null;
  seo_keywords: string | null;
  og_image_url: string | null;
  created_at: string;
  updated_at: string;
}

// Fetch all pages (for admin)
export const useDynamicPages = () => {
  return useQuery({
    queryKey: ['dynamic_pages'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('dynamic_pages')
        .select('*')
        .order('display_order', { ascending: true });
      
      if (error) throw error;
      return data as DynamicPage[];
    },
  });
};

// Fetch pages for header menu
export const useHeaderPages = () => {
  return useQuery({
    queryKey: ['dynamic_pages_header'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('dynamic_pages')
        .select('id, slug, title, display_order')
        .eq('is_active', true)
        .eq('show_in_header', true)
        .order('display_order', { ascending: true });
      
      if (error) throw error;
      return data as Pick<DynamicPage, 'id' | 'slug' | 'title' | 'display_order'>[];
    },
  });
};

// Fetch pages for footer menu
export const useFooterPages = () => {
  return useQuery({
    queryKey: ['dynamic_pages_footer'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('dynamic_pages')
        .select('id, slug, title, display_order')
        .eq('is_active', true)
        .eq('show_in_footer', true)
        .order('display_order', { ascending: true });
      
      if (error) throw error;
      return data as Pick<DynamicPage, 'id' | 'slug' | 'title' | 'display_order'>[];
    },
  });
};

// Fetch single page by slug
export const useDynamicPage = (slug: string) => {
  return useQuery({
    queryKey: ['dynamic_page', slug],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('dynamic_pages')
        .select('*')
        .eq('slug', slug)
        .eq('is_active', true)
        .maybeSingle();
      
      if (error) throw error;
      return data as DynamicPage | null;
    },
    enabled: !!slug,
  });
};

// Create page mutation
export const useCreateDynamicPage = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (page: Omit<DynamicPage, 'id' | 'created_at' | 'updated_at'>) => {
      const { data, error } = await (supabase as any)
        .from('dynamic_pages')
        .insert(page)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dynamic_pages'] });
      queryClient.invalidateQueries({ queryKey: ['dynamic_pages_header'] });
      queryClient.invalidateQueries({ queryKey: ['dynamic_pages_footer'] });
    },
  });
};

// Update page mutation
export const useUpdateDynamicPage = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, ...page }: Partial<DynamicPage> & { id: string }) => {
      const { data, error } = await (supabase as any)
        .from('dynamic_pages')
        .update(page)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dynamic_pages'] });
      queryClient.invalidateQueries({ queryKey: ['dynamic_pages_header'] });
      queryClient.invalidateQueries({ queryKey: ['dynamic_pages_footer'] });
      queryClient.invalidateQueries({ queryKey: ['dynamic_page'] });
    },
  });
};

// Delete page mutation
export const useDeleteDynamicPage = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from('dynamic_pages')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dynamic_pages'] });
      queryClient.invalidateQueries({ queryKey: ['dynamic_pages_header'] });
      queryClient.invalidateQueries({ queryKey: ['dynamic_pages_footer'] });
    },
  });
};
