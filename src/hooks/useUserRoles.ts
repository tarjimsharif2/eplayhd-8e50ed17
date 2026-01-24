import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// Available permissions in the system
export const AVAILABLE_PERMISSIONS = [
  { key: 'manage_matches', label: 'Match Management', description: 'Create, edit, delete matches' },
  { key: 'manage_teams', label: 'Team Management', description: 'Create, edit, delete teams' },
  { key: 'manage_tournaments', label: 'Tournament Management', description: 'Create, edit, delete tournaments' },
  { key: 'manage_banners', label: 'Banner Management', description: 'Create, edit, delete banners' },
  { key: 'manage_streaming', label: 'Streaming Servers', description: 'Manage streaming servers' },
  { key: 'manage_settings', label: 'Site Settings', description: 'Edit site settings and configuration' },
  { key: 'manage_users', label: 'User Management', description: 'Manage user roles and permissions' },
  { key: 'manage_pages', label: 'Page Management', description: 'Create, edit, delete dynamic pages' },
  { key: 'manage_points_table', label: 'Points Table', description: 'Edit tournament points tables' },
  { key: 'view_analytics', label: 'View Analytics', description: 'View site analytics and stats' },
] as const;

export type Permission = typeof AVAILABLE_PERMISSIONS[number]['key'];

export interface UserRole {
  id: string;
  user_id: string;
  role: 'admin' | 'moderator' | 'user';
  created_at: string;
}

export interface RolePermission {
  id: string;
  role: 'admin' | 'moderator' | 'user';
  permission: string;
  created_at: string;
}

export interface UserPermission {
  id: string;
  user_id: string;
  permission: string;
  granted: boolean;
  created_at: string;
}

export interface UserWithRole {
  id: string;
  email: string | null;
  role: 'admin' | 'moderator' | 'user' | null;
  created_at: string;
}

// Get all users with their roles
export const useUsersWithRoles = () => {
  return useQuery({
    queryKey: ['users_with_roles'],
    queryFn: async () => {
      // First get all profiles
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('user_id, email, created_at');
      
      if (profilesError) throw profilesError;

      // Then get all user roles
      const { data: roles, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id, role');
      
      if (rolesError) throw rolesError;

      // Merge profiles with roles
      const rolesMap = new Map(roles?.map(r => [r.user_id, r.role]) || []);
      
      return (profiles || []).map(p => ({
        id: p.user_id,
        email: p.email,
        role: rolesMap.get(p.user_id) || null,
        created_at: p.created_at,
      })) as UserWithRole[];
    },
  });
};

// Get role permissions
export const useRolePermissions = () => {
  return useQuery({
    queryKey: ['role_permissions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('role_permissions')
        .select('*');
      
      if (error) throw error;
      return data as RolePermission[];
    },
  });
};

// Get user-specific permissions
export const useUserPermissions = (userId: string | undefined) => {
  return useQuery({
    queryKey: ['user_permissions', userId],
    queryFn: async () => {
      if (!userId) return [];
      
      const { data, error } = await supabase
        .from('user_permissions')
        .select('*')
        .eq('user_id', userId);
      
      if (error) throw error;
      return data as UserPermission[];
    },
    enabled: !!userId,
  });
};

// Assign role to user
export const useAssignRole = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: 'admin' | 'moderator' | 'user' }) => {
      // First delete existing role
      await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', userId);
      
      // Then insert new role
      const { data, error } = await supabase
        .from('user_roles')
        .insert({ user_id: userId, role })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users_with_roles'] });
      queryClient.invalidateQueries({ queryKey: ['user_roles'] });
    },
  });
};

// Remove role from user
export const useRemoveRole = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', userId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users_with_roles'] });
      queryClient.invalidateQueries({ queryKey: ['user_roles'] });
    },
  });
};

// Update role permissions
export const useUpdateRolePermissions = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ role, permissions }: { role: 'admin' | 'moderator' | 'user'; permissions: string[] }) => {
      // Delete existing permissions for this role
      await supabase
        .from('role_permissions')
        .delete()
        .eq('role', role);
      
      // Insert new permissions
      if (permissions.length > 0) {
        const { error } = await supabase
          .from('role_permissions')
          .insert(permissions.map(p => ({ role, permission: p })));
        
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['role_permissions'] });
    },
  });
};

// Update user-specific permissions
export const useUpdateUserPermissions = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ userId, permissions }: { userId: string; permissions: { permission: string; granted: boolean }[] }) => {
      // Delete existing user permissions
      await supabase
        .from('user_permissions')
        .delete()
        .eq('user_id', userId);
      
      // Insert new permissions
      if (permissions.length > 0) {
        const { error } = await supabase
          .from('user_permissions')
          .insert(permissions.map(p => ({ user_id: userId, ...p })));
        
        if (error) throw error;
      }
    },
    onSuccess: (_, { userId }) => {
      queryClient.invalidateQueries({ queryKey: ['user_permissions', userId] });
    },
  });
};
