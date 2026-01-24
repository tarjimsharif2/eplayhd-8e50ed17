import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// Extended permissions list
export const AVAILABLE_PERMISSIONS = [
  // Content Management
  { key: 'manage_matches', label: 'Match Management', description: 'Create, edit, delete matches', category: 'content' },
  { key: 'manage_teams', label: 'Team Management', description: 'Create, edit, delete teams', category: 'content' },
  { key: 'manage_tournaments', label: 'Tournament Management', description: 'Create, edit, delete tournaments', category: 'content' },
  { key: 'manage_banners', label: 'Banner Management', description: 'Create, edit, delete banners', category: 'content' },
  { key: 'manage_pages', label: 'Page Management', description: 'Create, edit, delete dynamic pages', category: 'content' },
  { key: 'manage_points_table', label: 'Points Table', description: 'Edit tournament points tables', category: 'content' },
  { key: 'manage_playing_xi', label: 'Playing XI', description: 'Manage playing XI for matches', category: 'content' },
  
  // Streaming
  { key: 'manage_streaming', label: 'Streaming Servers', description: 'Manage streaming servers', category: 'streaming' },
  { key: 'manage_saved_servers', label: 'Saved Servers', description: 'Manage saved streaming servers', category: 'streaming' },
  { key: 'manage_sponsor_notices', label: 'Sponsor Notices', description: 'Manage sponsor notices', category: 'streaming' },
  
  // Settings
  { key: 'manage_settings', label: 'Site Settings', description: 'Edit site settings and configuration', category: 'settings' },
  { key: 'manage_seo', label: 'SEO Settings', description: 'Manage SEO, sitemap, robots.txt', category: 'settings' },
  { key: 'manage_ads', label: 'Ads Settings', description: 'Manage ad codes and placements', category: 'settings' },
  { key: 'manage_api_keys', label: 'API Key Settings', description: 'Manage Cricket API and other API keys', category: 'settings' },
  
  // User Management
  { key: 'manage_users', label: 'User Management', description: 'Create, edit, delete users', category: 'users' },
  { key: 'manage_roles', label: 'Role Management', description: 'Create, edit, delete roles', category: 'users' },
  { key: 'assign_roles', label: 'Assign Roles', description: 'Assign roles to users', category: 'users' },
  { key: 'manage_permissions', label: 'Permission Management', description: 'Manage role and user permissions', category: 'users' },
  
  // Analytics & Monitoring
  { key: 'view_analytics', label: 'View Analytics', description: 'View site analytics and stats', category: 'analytics' },
  { key: 'view_logs', label: 'View Logs', description: 'View system logs and activities', category: 'analytics' },
  { key: 'view_api_status', label: 'API Status', description: 'View API sync status and health', category: 'analytics' },
] as const;

export type Permission = typeof AVAILABLE_PERMISSIONS[number]['key'];

export interface CustomRole {
  id: string;
  name: string;
  display_name: string;
  description: string | null;
  is_system: boolean;
  color: string;
  created_at: string;
  updated_at: string;
}

export interface CustomRolePermission {
  id: string;
  role_id: string;
  permission: string;
  created_at: string;
}

export interface UserCustomRole {
  id: string;
  user_id: string;
  role_id: string;
  created_at: string;
}

// Get all custom roles
export const useCustomRoles = () => {
  return useQuery({
    queryKey: ['custom_roles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('roles')
        .select('*')
        .order('is_system', { ascending: false })
        .order('created_at', { ascending: true });
      
      if (error) throw error;
      return data as CustomRole[];
    },
  });
};

// Get permissions for a specific role
export const useCustomRolePermissions = (roleId: string | undefined) => {
  return useQuery({
    queryKey: ['custom_role_permissions', roleId],
    queryFn: async () => {
      if (!roleId) return [];
      
      const { data, error } = await supabase
        .from('custom_role_permissions')
        .select('*')
        .eq('role_id', roleId);
      
      if (error) throw error;
      return data as CustomRolePermission[];
    },
    enabled: !!roleId,
  });
};

// Get all custom role permissions (for all roles)
export const useAllCustomRolePermissions = () => {
  return useQuery({
    queryKey: ['all_custom_role_permissions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('custom_role_permissions')
        .select('*');
      
      if (error) throw error;
      return data as CustomRolePermission[];
    },
  });
};

// Get user's custom roles
export const useUserCustomRoles = (userId: string | undefined) => {
  return useQuery({
    queryKey: ['user_custom_roles', userId],
    queryFn: async () => {
      if (!userId) return [];
      
      const { data, error } = await supabase
        .from('user_custom_roles')
        .select('*, roles(*)')
        .eq('user_id', userId);
      
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
  });
};

// Create a new custom role
export const useCreateRole = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ name, displayName, description, color }: { 
      name: string; 
      displayName: string; 
      description?: string;
      color?: string;
    }) => {
      const { data, error } = await supabase
        .from('roles')
        .insert({
          name: name.toLowerCase().replace(/\s+/g, '_'),
          display_name: displayName,
          description,
          color: color || '#6b7280',
          is_system: false,
        })
        .select()
        .single();
      
      if (error) throw error;
      return data as CustomRole;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['custom_roles'] });
    },
  });
};

// Update a custom role
export const useUpdateRole = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, displayName, description, color }: { 
      id: string;
      displayName: string; 
      description?: string;
      color?: string;
    }) => {
      const { data, error } = await supabase
        .from('roles')
        .update({
          display_name: displayName,
          description,
          color,
        })
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data as CustomRole;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['custom_roles'] });
    },
  });
};

// Delete a custom role
export const useDeleteRole = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (roleId: string) => {
      // Check if it's a system role first
      const { data: role } = await supabase
        .from('roles')
        .select('is_system')
        .eq('id', roleId)
        .single();
      
      if (role?.is_system) {
        throw new Error('Cannot delete system roles');
      }
      
      const { error } = await supabase
        .from('roles')
        .delete()
        .eq('id', roleId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['custom_roles'] });
      queryClient.invalidateQueries({ queryKey: ['user_custom_roles'] });
    },
  });
};

// Update permissions for a custom role
export const useUpdateCustomRolePermissions = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ roleId, permissions }: { roleId: string; permissions: string[] }) => {
      // Delete existing permissions
      await supabase
        .from('custom_role_permissions')
        .delete()
        .eq('role_id', roleId);
      
      // Insert new permissions
      if (permissions.length > 0) {
        const { error } = await supabase
          .from('custom_role_permissions')
          .insert(permissions.map(p => ({ role_id: roleId, permission: p })));
        
        if (error) throw error;
      }
    },
    onSuccess: (_, { roleId }) => {
      queryClient.invalidateQueries({ queryKey: ['custom_role_permissions', roleId] });
      queryClient.invalidateQueries({ queryKey: ['all_custom_role_permissions'] });
    },
  });
};

// Assign custom role to user
export const useAssignCustomRole = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ userId, roleId }: { userId: string; roleId: string }) => {
      const { data, error } = await supabase
        .from('user_custom_roles')
        .insert({ user_id: userId, role_id: roleId })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: (_, { userId }) => {
      queryClient.invalidateQueries({ queryKey: ['user_custom_roles', userId] });
      queryClient.invalidateQueries({ queryKey: ['users_with_roles'] });
    },
  });
};

// Remove custom role from user
export const useRemoveCustomRole = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ userId, roleId }: { userId: string; roleId: string }) => {
      const { error } = await supabase
        .from('user_custom_roles')
        .delete()
        .eq('user_id', userId)
        .eq('role_id', roleId);
      
      if (error) throw error;
    },
    onSuccess: (_, { userId }) => {
      queryClient.invalidateQueries({ queryKey: ['user_custom_roles', userId] });
      queryClient.invalidateQueries({ queryKey: ['users_with_roles'] });
    },
  });
};

// Permission categories for UI grouping
export const PERMISSION_CATEGORIES = [
  { key: 'content', label: 'Content Management', icon: 'FileText' },
  { key: 'streaming', label: 'Streaming', icon: 'Play' },
  { key: 'settings', label: 'Settings', icon: 'Settings' },
  { key: 'users', label: 'User Management', icon: 'Users' },
  { key: 'analytics', label: 'Analytics', icon: 'BarChart' },
] as const;

export const getPermissionsByCategory = (category: string) => {
  return AVAILABLE_PERMISSIONS.filter(p => p.category === category);
};
