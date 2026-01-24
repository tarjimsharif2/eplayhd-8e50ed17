import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export type PermissionKey = 
  | 'manage_matches'
  | 'manage_teams'
  | 'manage_tournaments'
  | 'manage_banners'
  | 'manage_pages'
  | 'manage_points_table'
  | 'manage_playing_xi'
  | 'manage_streaming'
  | 'manage_saved_servers'
  | 'manage_sponsor_notices'
  | 'manage_settings'
  | 'manage_seo'
  | 'manage_ads'
  | 'manage_api_keys'
  | 'manage_users'
  | 'manage_roles'
  | 'assign_roles'
  | 'manage_permissions'
  | 'view_analytics'
  | 'view_logs'
  | 'view_api_status';

interface UserPermissionData {
  permissions: string[];
  isAdmin: boolean;
  isLoading: boolean;
}

// Hook to get current user's effective permissions
export const useCurrentUserPermissions = (): UserPermissionData => {
  const { user } = useAuth();
  
  const { data, isLoading } = useQuery({
    queryKey: ['current_user_permissions', user?.id],
    queryFn: async () => {
      if (!user?.id) return { permissions: [], isAdmin: false };
      
      // Check if user is admin (admins have all permissions)
      const { data: userRole } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .single();
      
      const isAdmin = userRole?.role === 'admin';
      
      // If admin, return all permissions
      if (isAdmin) {
        return { 
          permissions: ['*'], // Special marker for all permissions
          isAdmin: true 
        };
      }
      
      // Get role-based permissions
      let rolePermissions: { permission: string }[] = [];
      if (userRole?.role) {
        const { data } = await supabase
          .from('role_permissions')
          .select('permission')
          .eq('role', userRole.role);
        rolePermissions = data || [];
      }
      
      // Get custom role permissions
      const { data: userCustomRoles } = await supabase
        .from('user_custom_roles')
        .select('role_id')
        .eq('user_id', user.id);
      
      let customPermissions: string[] = [];
      if (userCustomRoles && userCustomRoles.length > 0) {
        const roleIds = userCustomRoles.map(r => r.role_id);
        const { data: customRolePerms } = await supabase
          .from('custom_role_permissions')
          .select('permission')
          .in('role_id', roleIds);
        
        customPermissions = customRolePerms?.map(p => p.permission) || [];
      }
      
      // Get user-specific permission overrides
      const { data: userOverrides } = await supabase
        .from('user_permissions')
        .select('permission, granted')
        .eq('user_id', user.id);
      
      // Build effective permissions set
      const basePermissions = new Set([
        ...(rolePermissions?.map(p => p.permission) || []),
        ...customPermissions
      ]);
      
      // Apply user overrides
      userOverrides?.forEach(override => {
        if (override.granted) {
          basePermissions.add(override.permission);
        } else {
          basePermissions.delete(override.permission);
        }
      });
      
      return {
        permissions: Array.from(basePermissions),
        isAdmin: false
      };
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });
  
  return {
    permissions: data?.permissions || [],
    isAdmin: data?.isAdmin || false,
    isLoading
  };
};

// Hook to check if user has a specific permission
export const useHasPermission = (permission: PermissionKey): boolean => {
  const { permissions, isAdmin } = useCurrentUserPermissions();
  
  // Admins have all permissions
  if (isAdmin || permissions.includes('*')) {
    return true;
  }
  
  return permissions.includes(permission);
};

// Hook to check multiple permissions at once
export const useHasAnyPermission = (permissionList: PermissionKey[]): boolean => {
  const { permissions, isAdmin } = useCurrentUserPermissions();
  
  if (isAdmin || permissions.includes('*')) {
    return true;
  }
  
  return permissionList.some(p => permissions.includes(p));
};

// Hook to check if user has all specified permissions
export const useHasAllPermissions = (permissionList: PermissionKey[]): boolean => {
  const { permissions, isAdmin } = useCurrentUserPermissions();
  
  if (isAdmin || permissions.includes('*')) {
    return true;
  }
  
  return permissionList.every(p => permissions.includes(p));
};

// Hook to check if user has access to admin panel (has any permission)
export const useHasAdminAccess = (): { hasAccess: boolean; isLoading: boolean } => {
  const { permissions, isAdmin, isLoading } = useCurrentUserPermissions();
  
  if (isLoading) {
    return { hasAccess: false, isLoading: true };
  }
  
  // Admins always have access
  if (isAdmin || permissions.includes('*')) {
    return { hasAccess: true, isLoading: false };
  }
  
  // Any user with at least one permission has access
  return { hasAccess: permissions.length > 0, isLoading: false };
};

// Map admin tabs to required permissions
export const TAB_PERMISSIONS: Record<string, PermissionKey[]> = {
  'matches': ['manage_matches'],
  'live-scores': ['manage_matches'],
  'streaming': ['manage_streaming'],
  'teams': ['manage_teams'],
  'tournaments': ['manage_tournaments'],
  'points-table': ['manage_points_table'],
  'sports': ['manage_matches'], // Sports is part of match management
  'banners': ['manage_banners'],
  'pages': ['manage_pages'],
  'ads': ['manage_ads'],
  'live-api': ['manage_api_keys'],
  'sitemap': ['manage_seo'],
  'sponsor': ['manage_sponsor_notices'],
  'settings': ['manage_settings'],
  'users': ['manage_users'],
};

// Get visible tabs based on user permissions
export const useVisibleAdminTabs = (): string[] => {
  const { permissions, isAdmin, isLoading } = useCurrentUserPermissions();
  
  if (isLoading) return [];
  
  // Admins see all tabs
  if (isAdmin || permissions.includes('*')) {
    return Object.keys(TAB_PERMISSIONS);
  }
  
  // Filter tabs based on permissions
  return Object.entries(TAB_PERMISSIONS)
    .filter(([_, requiredPerms]) => 
      requiredPerms.some(p => permissions.includes(p))
    )
    .map(([tab]) => tab);
};
