import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface Channel {
  id: string;
  name: string;
  slug: string | null;
  logo_url: string | null;
  logo_background_color: string | null;
  description: string | null;
  seo_title: string | null;
  seo_description: string | null;
  seo_keywords: string | null;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ChannelStreamingServer {
  id: string;
  channel_id: string;
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
  drm_scheme: string | null;
  player_type: string | null;
  clearkey_key_id: string | null;
  clearkey_key: string | null;
  ad_block_enabled: boolean;
  is_working: boolean | null;
  original_display_order: number | null;
  created_at: string;
  updated_at: string;
}

// Fetch all active channels for public display
export const useChannels = () => {
  return useQuery({
    queryKey: ['channels'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('channels')
        .select('*')
        .eq('is_active', true)
        .order('display_order');
      
      if (error) throw error;
      return data as Channel[];
    },
  });
};

// Fetch all channels for admin (including inactive)
export const useAllChannels = () => {
  return useQuery({
    queryKey: ['channels', 'all'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('channels')
        .select('*')
        .order('display_order');
      
      if (error) throw error;
      return data as Channel[];
    },
  });
};

// Fetch single channel by slug
export const useChannelBySlug = (slug: string) => {
  return useQuery({
    queryKey: ['channels', 'slug', slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('channels')
        .select('*')
        .eq('slug', slug)
        .single();
      
      if (error) throw error;
      return data as Channel;
    },
    enabled: !!slug,
  });
};

// Mutations for channels
export const useCreateChannel = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (channel: Omit<Channel, 'id' | 'created_at' | 'updated_at'>) => {
      const { data, error } = await supabase
        .from('channels')
        .insert(channel)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['channels'] });
    },
  });
};

export const useUpdateChannel = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, ...channel }: Partial<Channel> & { id: string }) => {
      const { data, error } = await supabase
        .from('channels')
        .update(channel)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['channels'] });
    },
  });
};

export const useDeleteChannel = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('channels')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['channels'] });
    },
  });
};

// Channel streaming servers hooks
export const useChannelStreamingServers = (channelId: string) => {
  return useQuery({
    queryKey: ['channel_streaming_servers', channelId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('channel_streaming_servers')
        .select('*')
        .eq('channel_id', channelId)
        .eq('is_active', true)
        .order('display_order');
      
      if (error) throw error;
      return data as ChannelStreamingServer[];
    },
    enabled: !!channelId,
  });
};

export const useAllChannelStreamingServers = (channelId: string) => {
  return useQuery({
    queryKey: ['channel_streaming_servers', 'all', channelId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('channel_streaming_servers')
        .select('*')
        .eq('channel_id', channelId)
        .order('display_order');
      
      if (error) throw error;
      return data as ChannelStreamingServer[];
    },
    enabled: !!channelId,
  });
};

export const useCreateChannelServer = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (server: Omit<ChannelStreamingServer, 'id' | 'created_at' | 'updated_at'>) => {
      const { data, error } = await supabase
        .from('channel_streaming_servers')
        .insert(server)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['channel_streaming_servers', variables.channel_id] });
    },
  });
};

export const useUpdateChannelServer = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, ...server }: Partial<ChannelStreamingServer> & { id: string }) => {
      const { data, error } = await supabase
        .from('channel_streaming_servers')
        .update(server)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['channel_streaming_servers'] });
    },
  });
};

export const useDeleteChannelServer = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('channel_streaming_servers')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['channel_streaming_servers'] });
    },
  });
};

// Mark channel server as not working
export const useMarkChannelServerNotWorking = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (serverId: string) => {
      const { data: server, error: fetchError } = await supabase
        .from('channel_streaming_servers')
        .select('*')
        .eq('id', serverId)
        .single();
      
      if (fetchError || !server) throw fetchError || new Error('Server not found');
      
      if (server.is_working === false) return server;
      
      const { data: maxOrderResult } = await supabase
        .from('channel_streaming_servers')
        .select('display_order')
        .eq('channel_id', server.channel_id)
        .order('display_order', { ascending: false })
        .limit(1)
        .single();
      
      const maxOrder = maxOrderResult?.display_order || 0;
      
      const { data, error } = await supabase
        .from('channel_streaming_servers')
        .update({
          is_working: false,
          original_display_order: server.original_display_order ?? server.display_order,
          display_order: maxOrder + 100,
        })
        .eq('id', serverId)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['channel_streaming_servers'] });
    },
  });
};

// Mark channel server as working
export const useMarkChannelServerWorking = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (serverId: string) => {
      const { data: server, error: fetchError } = await supabase
        .from('channel_streaming_servers')
        .select('*')
        .eq('id', serverId)
        .single();
      
      if (fetchError || !server) throw fetchError || new Error('Server not found');
      
      if (server.is_working !== false) return server;
      
      const { data, error } = await supabase
        .from('channel_streaming_servers')
        .update({
          is_working: true,
          display_order: server.original_display_order ?? server.display_order,
        })
        .eq('id', serverId)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['channel_streaming_servers'] });
    },
  });
};
