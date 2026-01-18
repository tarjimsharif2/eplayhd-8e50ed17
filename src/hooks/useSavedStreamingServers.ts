import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface SavedStreamingServer {
  id: string;
  server_name: string;
  server_url: string;
  server_type: 'iframe' | 'm3u8' | 'embed' | 'mpd' | 'iframe_to_m3u8';
  referer_value: string | null;
  origin_value: string | null;
  cookie_value: string | null;
  user_agent: string | null;
  drm_license_url: string | null;
  drm_scheme: 'widevine' | 'playready' | 'clearkey' | null;
  player_type: 'hls' | 'clappr' | null;
  ad_block_enabled: boolean;
  clearkey_key_id: string | null;
  clearkey_key: string | null;
  tags: string[];
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export const useSavedStreamingServers = (searchQuery?: string) => {
  return useQuery({
    queryKey: ['saved_streaming_servers', searchQuery],
    queryFn: async () => {
      let query = supabase
        .from('saved_streaming_servers')
        .select('*')
        .order('server_name');
      
      if (searchQuery && searchQuery.trim()) {
        // Search in both server_name and notes
        query = query.or(`server_name.ilike.%${searchQuery}%,notes.ilike.%${searchQuery}%`);
      }
      
      const { data, error } = await query;
      
      if (error) throw error;
      return data as SavedStreamingServer[];
    },
  });
};

export const useCreateSavedStreamingServer = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (server: Omit<SavedStreamingServer, 'id' | 'created_at' | 'updated_at'>) => {
      const { data, error } = await supabase
        .from('saved_streaming_servers')
        .insert(server)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved_streaming_servers'] });
    },
  });
};

export const useUpdateSavedStreamingServer = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, ...server }: Partial<SavedStreamingServer> & { id: string }) => {
      const { data, error } = await supabase
        .from('saved_streaming_servers')
        .update(server)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved_streaming_servers'] });
    },
  });
};

export const useDeleteSavedStreamingServer = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('saved_streaming_servers')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved_streaming_servers'] });
    },
  });
};
