import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// Mark a server as not working - moves it to end of list
export const useMarkServerNotWorking = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (serverId: string) => {
      // First get the current server to check its state
      const { data: server, error: fetchError } = await supabase
        .from('streaming_servers')
        .select('*')
        .eq('id', serverId)
        .single();
      
      if (fetchError || !server) throw fetchError || new Error('Server not found');
      
      // If already marked as not working, skip
      if (server.is_working === false) {
        return server;
      }
      
      // Get max display order for this match
      const { data: maxOrderResult } = await supabase
        .from('streaming_servers')
        .select('display_order')
        .eq('match_id', server.match_id)
        .order('display_order', { ascending: false })
        .limit(1)
        .single();
      
      const maxOrder = maxOrderResult?.display_order || 0;
      
      // Update server: save original order, move to end, mark as not working
      const { data, error } = await supabase
        .from('streaming_servers')
        .update({
          is_working: false,
          original_display_order: server.original_display_order ?? server.display_order,
          display_order: maxOrder + 100, // Move to end with buffer
        })
        .eq('id', serverId)
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

// Mark a server as working again - restores original position
export const useMarkServerWorking = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (serverId: string) => {
      // First get the current server
      const { data: server, error: fetchError } = await supabase
        .from('streaming_servers')
        .select('*')
        .eq('id', serverId)
        .single();
      
      if (fetchError || !server) throw fetchError || new Error('Server not found');
      
      // If already working, skip
      if (server.is_working !== false) {
        return server;
      }
      
      // Restore original display order
      const { data, error } = await supabase
        .from('streaming_servers')
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
      queryClient.invalidateQueries({ queryKey: ['streaming_servers'] });
    },
  });
};
