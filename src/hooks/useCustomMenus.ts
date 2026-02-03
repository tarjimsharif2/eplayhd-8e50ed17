import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface CustomMenu {
  id: string;
  title: string;
  url: string | null;
  icon_name: string | null;
  parent_id: string | null;
  display_order: number;
  is_active: boolean;
  open_in_new_tab: boolean;
  menu_type: string;
  created_at: string;
  updated_at: string;
  children?: CustomMenu[];
}

export const useCustomMenus = () => {
  return useQuery({
    queryKey: ['custom_menus'],
    queryFn: async (): Promise<CustomMenu[]> => {
      const { data, error } = await (supabase as any)
        .from('custom_menus')
        .select('*')
        .order('display_order', { ascending: true });
      
      if (error) throw error;
      return data || [];
    },
  });
};

export const useAllCustomMenus = () => {
  return useQuery({
    queryKey: ['custom_menus_all'],
    queryFn: async (): Promise<CustomMenu[]> => {
      const { data, error } = await (supabase as any)
        .from('custom_menus')
        .select('*')
        .order('display_order', { ascending: true });
      
      if (error) throw error;
      return data || [];
    },
  });
};

// Build menu tree structure
export const buildMenuTree = (menus: CustomMenu[]): CustomMenu[] => {
  const menuMap = new Map<string, CustomMenu>();
  const rootMenus: CustomMenu[] = [];

  // First pass: create map of all menus
  menus.forEach(menu => {
    menuMap.set(menu.id, { ...menu, children: [] });
  });

  // Second pass: build tree
  menus.forEach(menu => {
    const menuWithChildren = menuMap.get(menu.id)!;
    if (menu.parent_id && menuMap.has(menu.parent_id)) {
      const parent = menuMap.get(menu.parent_id)!;
      parent.children = parent.children || [];
      parent.children.push(menuWithChildren);
    } else {
      rootMenus.push(menuWithChildren);
    }
  });

  return rootMenus;
};

export const useCreateMenu = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (menu: Partial<CustomMenu>) => {
      const { data, error } = await (supabase as any)
        .from('custom_menus')
        .insert(menu)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['custom_menus'] });
      queryClient.invalidateQueries({ queryKey: ['custom_menus_all'] });
    },
  });
};

export const useUpdateMenu = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<CustomMenu> & { id: string }) => {
      const { data, error } = await (supabase as any)
        .from('custom_menus')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['custom_menus'] });
      queryClient.invalidateQueries({ queryKey: ['custom_menus_all'] });
    },
  });
};

export const useDeleteMenu = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from('custom_menus')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['custom_menus'] });
      queryClient.invalidateQueries({ queryKey: ['custom_menus_all'] });
    },
  });
};