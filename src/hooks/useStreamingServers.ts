import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface StreamingServer {
  id: string;
  match_id: string;
  server_name: string;
  server_url: string;
  server_type: 'iframe' | 'm3u8' | 'embed' | 'iframe_to_m3u8';
  display_order: number;
  is_active: boolean;
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
  is_working: boolean | null;
  original_display_order: number | null;
  created_at: string;
  updated_at: string;
}

export const useStreamingServers = (matchId: string) => {
  return useQuery({
    queryKey: ['streaming_servers', matchId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('streaming_servers')
        .select('*')
        .eq('match_id', matchId)
        .eq('is_active', true)
        .order('display_order');
      
      if (error) throw error;
      return data as StreamingServer[];
    },
    enabled: !!matchId,
  });
};

export const useAllStreamingServers = (matchId: string) => {
  return useQuery({
    queryKey: ['streaming_servers', 'all', matchId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('streaming_servers')
        .select('*')
        .eq('match_id', matchId)
        .order('display_order');
      
      if (error) throw error;
      return data as StreamingServer[];
    },
    enabled: !!matchId,
  });
};

export const useCreateStreamingServer = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (server: Omit<StreamingServer, 'id' | 'created_at' | 'updated_at'>) => {
      const { data, error } = await supabase
        .from('streaming_servers')
        .insert(server)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['streaming_servers', variables.match_id] });
      queryClient.invalidateQueries({ queryKey: ['streaming_servers', 'all', variables.match_id] });
    },
  });
};

export const useUpdateStreamingServer = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, ...server }: Partial<StreamingServer> & { id: string }) => {
      const { data, error } = await supabase
        .from('streaming_servers')
        .update(server)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['streaming_servers'] });
    },
  });
};

export const useDeleteStreamingServer = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('streaming_servers')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['streaming_servers'] });
    },
  });
};