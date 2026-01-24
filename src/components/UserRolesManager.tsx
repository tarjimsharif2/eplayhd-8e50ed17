import { useState, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { 
  useUsersWithRoles, 
  useRolePermissions, 
  useUserPermissions,
  useAssignRole, 
  useRemoveRole,
  useUpdateRolePermissions,
  useUpdateUserPermissions,
  AVAILABLE_PERMISSIONS as OLD_PERMISSIONS,
  UserWithRole 
} from "@/hooks/useUserRoles";
import {
  useCustomRoles,
  useAllCustomRolePermissions,
  useCreateRole,
  useUpdateRole,
  useDeleteRole,
  useUpdateCustomRolePermissions,
  useAssignCustomRole,
  useRemoveCustomRole,
  AVAILABLE_PERMISSIONS,
  PERMISSION_CATEGORIES,
  getPermissionsByCategory,
  CustomRole,
} from "@/hooks/useCustomRoles";
import { Users, Shield, Settings, Search, Loader2, UserCog, Save, X, UserPlus, Trash2, Plus, Edit, Palette } from "lucide-react";

interface UserRolesManagerProps {
  adminSlug: string;
  onAdminSlugChange: (slug: string) => void;
  onSaveAdminSlug: () => void;
  isSaving: boolean;
}

const ROLE_COLORS = [
  '#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#8b5cf6', 
  '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16'
];

const UserRolesManager = ({ adminSlug, onAdminSlugChange, onSaveAdminSlug, isSaving }: UserRolesManagerProps) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUser, setSelectedUser] = useState<UserWithRole | null>(null);
  const [userPermissionsDialogOpen, setUserPermissionsDialogOpen] = useState(false);
  const [rolePermissionsDialogOpen, setRolePermissionsDialogOpen] = useState(false);
  const [selectedRoleForEdit, setSelectedRoleForEdit] = useState<CustomRole | null>(null);
  const [editedRolePermissions, setEditedRolePermissions] = useState<string[]>([]);
  const [editedUserPermissions, setEditedUserPermissions] = useState<{ permission: string; granted: boolean }[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Founder admin ID - cannot be deleted
  const FOUNDER_ADMIN_ID = "e92b51a9-0059-459e-8a5a-838030bc7f97";

  // Get current user ID
  useState(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setCurrentUserId(data.user.id);
      }
    });
  });
  
  // Create user dialog state
  const [createUserDialogOpen, setCreateUserDialogOpen] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserRole, setNewUserRole] = useState<string>('none');
  const [isCreatingUser, setIsCreatingUser] = useState(false);

  // Delete user dialog state
  const [deleteUserDialogOpen, setDeleteUserDialogOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<UserWithRole | null>(null);
  const [isDeletingUser, setIsDeletingUser] = useState(false);

  // Create role dialog state
  const [createRoleDialogOpen, setCreateRoleDialogOpen] = useState(false);
  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleDisplayName, setNewRoleDisplayName] = useState("");
  const [newRoleDescription, setNewRoleDescription] = useState("");
  const [newRoleColor, setNewRoleColor] = useState("#6b7280");

  // Edit role dialog state
  const [editRoleDialogOpen, setEditRoleDialogOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<CustomRole | null>(null);

  // Delete role dialog state
  const [deleteRoleDialogOpen, setDeleteRoleDialogOpen] = useState(false);
  const [roleToDelete, setRoleToDelete] = useState<CustomRole | null>(null);

  const { data: users, isLoading: usersLoading } = useUsersWithRoles();
  const { data: rolePermissions, isLoading: rolePermissionsLoading } = useRolePermissions();
  const { data: userPermissions } = useUserPermissions(selectedUser?.id);
  const { data: customRoles, isLoading: customRolesLoading } = useCustomRoles();
  const { data: allCustomRolePermissions } = useAllCustomRolePermissions();

  const assignRole = useAssignRole();
  const removeRole = useRemoveRole();
  const updateRolePermissions = useUpdateRolePermissions();
  const updateUserPermissions = useUpdateUserPermissions();
  
  const createRole = useCreateRole();
  const updateRole = useUpdateRole();
  const deleteRole = useDeleteRole();
  const updateCustomRolePermissions = useUpdateCustomRolePermissions();

  // Create new user function
  const handleCreateUser = async () => {
    if (!newUserEmail || !newUserPassword) {
      toast({
        title: "Error",
        description: "Email and password are required",
        variant: "destructive"
      });
      return;
    }

    if (newUserPassword.length < 6) {
      toast({
        title: "Error",
        description: "Password must be at least 6 characters",
        variant: "destructive"
      });
      return;
    }

    setIsCreatingUser(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      if (!token) {
        throw new Error('Not authenticated');
      }

      // Map custom roles to standard roles for the edge function
      let roleForFunction = null;
      if (newUserRole !== 'none') {
        const selectedRole = customRoles?.find(r => r.id === newUserRole);
        if (selectedRole && ['admin', 'moderator', 'user'].includes(selectedRole.name)) {
          roleForFunction = selectedRole.name;
        }
      }

      const response = await supabase.functions.invoke('create-user', {
        body: {
          email: newUserEmail,
          password: newUserPassword,
          role: roleForFunction
        }
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      if (!response.data?.success) {
        throw new Error(response.data?.error || 'Failed to create user');
      }

      toast({
        title: "Success",
        description: `User ${newUserEmail} created successfully`
      });

      // Reset form and close dialog
      setNewUserEmail("");
      setNewUserPassword("");
      setNewUserRole('none');
      setCreateUserDialogOpen(false);

      // Refresh users list
      queryClient.invalidateQueries({ queryKey: ['users_with_roles'] });

    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to create user",
        variant: "destructive"
      });
    } finally {
      setIsCreatingUser(false);
    }
  };

  // Delete user function
  const handleDeleteUser = async () => {
    if (!userToDelete) return;

    // Extra protection: prevent deleting founder admin or self
    if (userToDelete.id === FOUNDER_ADMIN_ID) {
      toast({
        title: "Error",
        description: "Cannot delete the founder admin account",
        variant: "destructive"
      });
      return;
    }

    if (userToDelete.id === currentUserId) {
      toast({
        title: "Error",
        description: "Cannot delete your own account",
        variant: "destructive"
      });
      return;
    }

    setIsDeletingUser(true);
    try {
      const response = await supabase.functions.invoke('delete-user', {
        body: { userId: userToDelete.id }
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      if (!response.data?.success) {
        throw new Error(response.data?.error || 'Failed to delete user');
      }

      toast({
        title: "Success",
        description: `User ${userToDelete.email} deleted successfully`
      });

      setDeleteUserDialogOpen(false);
      setUserToDelete(null);
      queryClient.invalidateQueries({ queryKey: ['users_with_roles'] });

    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete user",
        variant: "destructive"
      });
    } finally {
      setIsDeletingUser(false);
    }
  };

  // Create new role
  const handleCreateRole = async () => {
    if (!newRoleName || !newRoleDisplayName) {
      toast({
        title: "Error",
        description: "Role name and display name are required",
        variant: "destructive"
      });
      return;
    }

    try {
      await createRole.mutateAsync({
        name: newRoleName,
        displayName: newRoleDisplayName,
        description: newRoleDescription,
        color: newRoleColor,
      });

      toast({
        title: "Success",
        description: `Role "${newRoleDisplayName}" created successfully`
      });

      setNewRoleName("");
      setNewRoleDisplayName("");
      setNewRoleDescription("");
      setNewRoleColor("#6b7280");
      setCreateRoleDialogOpen(false);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to create role",
        variant: "destructive"
      });
    }
  };

  // Update role
  const handleUpdateRole = async () => {
    if (!editingRole) return;

    try {
      await updateRole.mutateAsync({
        id: editingRole.id,
        displayName: editingRole.display_name,
        description: editingRole.description || undefined,
        color: editingRole.color,
      });

      toast({
        title: "Success",
        description: "Role updated successfully"
      });

      setEditRoleDialogOpen(false);
      setEditingRole(null);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update role",
        variant: "destructive"
      });
    }
  };

  // Delete role
  const handleDeleteRole = async () => {
    if (!roleToDelete) return;

    try {
      await deleteRole.mutateAsync(roleToDelete.id);

      toast({
        title: "Success",
        description: `Role "${roleToDelete.display_name}" deleted successfully`
      });

      setDeleteRoleDialogOpen(false);
      setRoleToDelete(null);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete role",
        variant: "destructive"
      });
    }
  };

  // Filter users based on search
  const filteredUsers = useMemo(() => {
    if (!users) return [];
    if (!searchQuery) return users;
    
    const query = searchQuery.toLowerCase();
    return users.filter(user => 
      user.email?.toLowerCase().includes(query) ||
      user.role?.toLowerCase().includes(query)
    );
  }, [users, searchQuery]);

  // Get permissions for a role (both system and custom)
  const getPermissionsForRole = (roleId: string) => {
    if (!allCustomRolePermissions) return [];
    return allCustomRolePermissions
      .filter(rp => rp.role_id === roleId)
      .map(rp => rp.permission);
  };

  // Handle role assignment
  const handleAssignRole = async (userId: string, roleId: string) => {
    try {
      if (roleId === 'none') {
        await removeRole.mutateAsync(userId);
        toast({ title: "Success", description: "Role removed successfully" });
      } else {
        // Find the role to check if it's a system role
        const role = customRoles?.find(r => r.id === roleId);
        if (role && ['admin', 'moderator', 'user'].includes(role.name)) {
          await assignRole.mutateAsync({ userId, role: role.name as 'admin' | 'moderator' | 'user' });
          toast({ title: "Success", description: `Role assigned: ${role.display_name}` });
        }
      }
    } catch (error: any) {
      toast({ 
        title: "Error", 
        description: error.message || "Failed to update role",
        variant: "destructive"
      });
    }
  };

  // Open role permissions editor
  const handleEditRolePermissions = (role: CustomRole) => {
    setSelectedRoleForEdit(role);
    setEditedRolePermissions(getPermissionsForRole(role.id));
    setRolePermissionsDialogOpen(true);
  };

  // Save role permissions
  const handleSaveRolePermissions = async () => {
    if (!selectedRoleForEdit) return;
    
    try {
      await updateCustomRolePermissions.mutateAsync({
        roleId: selectedRoleForEdit.id,
        permissions: editedRolePermissions
      });
      
      // Also update the old role_permissions table for system roles
      if (['admin', 'moderator', 'user'].includes(selectedRoleForEdit.name)) {
        await updateRolePermissions.mutateAsync({
          role: selectedRoleForEdit.name as 'admin' | 'moderator' | 'user',
          permissions: editedRolePermissions
        });
      }
      
      toast({ title: "Success", description: `${selectedRoleForEdit.display_name} permissions updated` });
      setRolePermissionsDialogOpen(false);
    } catch (error: any) {
      toast({ 
        title: "Error", 
        description: error.message || "Failed to update permissions",
        variant: "destructive"
      });
    }
  };

  // Open user permissions editor
  const handleEditUserPermissions = (user: UserWithRole) => {
    setSelectedUser(user);
    setEditedUserPermissions([]);
    setUserPermissionsDialogOpen(true);
  };

  // Initialize edited user permissions when data loads
  const initUserPermissions = () => {
    if (userPermissions) {
      setEditedUserPermissions(
        userPermissions.map(up => ({ permission: up.permission, granted: up.granted }))
      );
    }
  };

  // Save user permissions
  const handleSaveUserPermissions = async () => {
    if (!selectedUser) return;
    
    try {
      await updateUserPermissions.mutateAsync({
        userId: selectedUser.id,
        permissions: editedUserPermissions
      });
      toast({ title: "Success", description: "User permissions updated" });
      setUserPermissionsDialogOpen(false);
    } catch (error: any) {
      toast({ 
        title: "Error", 
        description: error.message || "Failed to update permissions",
        variant: "destructive"
      });
    }
  };

  // Toggle permission for role
  const toggleRolePermission = (permission: string) => {
    setEditedRolePermissions(prev => 
      prev.includes(permission)
        ? prev.filter(p => p !== permission)
        : [...prev, permission]
    );
  };

  // Toggle permission for user
  const toggleUserPermission = (permission: string, granted: boolean) => {
    setEditedUserPermissions(prev => {
      const existing = prev.find(p => p.permission === permission);
      if (existing) {
        if (existing.granted === granted) {
          return prev.filter(p => p.permission !== permission);
        }
        return prev.map(p => 
          p.permission === permission ? { ...p, granted } : p
        );
      }
      return [...prev, { permission, granted }];
    });
  };

  // Get user permission status
  const getUserPermissionStatus = (permission: string): 'granted' | 'denied' | 'inherit' => {
    const userPerm = editedUserPermissions.find(p => p.permission === permission);
    if (userPerm) {
      return userPerm.granted ? 'granted' : 'denied';
    }
    return 'inherit';
  };

  // Get role by name (for user display)
  const getRoleByName = (roleName: string | null) => {
    if (!roleName || !customRoles) return null;
    return customRoles.find(r => r.name === roleName);
  };

  if (usersLoading || rolePermissionsLoading || customRolesLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Admin Slug Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Admin Panel URL
          </CardTitle>
          <CardDescription>
            Change the admin panel URL slug for security
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-4">
            <div className="flex-1 space-y-2">
              <Label htmlFor="admin-slug">Admin URL Slug</Label>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">/</span>
                <Input
                  id="admin-slug"
                  value={adminSlug}
                  onChange={(e) => onAdminSlugChange(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                  placeholder="admin"
                  className="max-w-xs"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Only lowercase letters, numbers, and hyphens allowed
              </p>
            </div>
            <Button onClick={onSaveAdminSlug} disabled={isSaving || !adminSlug}>
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
              Save
            </Button>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="users">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="users" className="flex items-center gap-2">
            <Users className="w-4 h-4" />
            Users
          </TabsTrigger>
          <TabsTrigger value="roles" className="flex items-center gap-2">
            <Shield className="w-4 h-4" />
            Roles
          </TabsTrigger>
          <TabsTrigger value="permissions" className="flex items-center gap-2">
            <UserCog className="w-4 h-4" />
            Permissions
          </TabsTrigger>
        </TabsList>

        {/* Users Tab */}
        <TabsContent value="users" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>User Management</CardTitle>
                <CardDescription>
                  Assign roles and permissions to users
                </CardDescription>
              </div>
              <Button onClick={() => setCreateUserDialogOpen(true)}>
                <UserPlus className="w-4 h-4 mr-2" />
                New User
              </Button>
            </CardHeader>
            <CardContent>
              {/* Search */}
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search by email..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>

              {/* Desktop Users Table */}
              <div className="hidden md:block">
                <ScrollArea className="h-[400px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Email</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Joined Date</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredUsers.map((user) => {
                        const userRole = getRoleByName(user.role);
                        const isFounder = user.id === FOUNDER_ADMIN_ID;
                        const isCurrentUser = user.id === currentUserId;
                        return (
                          <TableRow key={user.id}>
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-2">
                                {user.email || 'N/A'}
                                {isFounder && (
                                  <Badge variant="outline" className="text-xs border-primary text-primary">
                                    Founder
                                  </Badge>
                                )}
                                {isCurrentUser && (
                                  <Badge variant="outline" className="text-xs">
                                    You
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge 
                                style={{ 
                                  backgroundColor: userRole?.color || '#6b7280',
                                  color: 'white'
                                }}
                              >
                                {userRole?.display_name || user.role || 'No Role'}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                              {new Date(user.created_at).toLocaleDateString('en-US')}
                            </TableCell>
                            <TableCell className="text-right space-x-2">
                              <Select
                                value={customRoles?.find(r => r.name === user.role)?.id || 'none'}
                                onValueChange={(value) => handleAssignRole(user.id, value)}
                              >
                                <SelectTrigger className="w-32 h-8">
                                  <SelectValue placeholder="Select Role" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">No Role</SelectItem>
                                  {customRoles?.map((role) => (
                                    <SelectItem key={role.id} value={role.id}>
                                      <div className="flex items-center gap-2">
                                        <div 
                                          className="w-3 h-3 rounded-full" 
                                          style={{ backgroundColor: role.color }}
                                        />
                                        {role.display_name}
                                      </div>
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleEditUserPermissions(user)}
                              >
                                <UserCog className="w-4 h-4" />
                              </Button>
                              {/* Delete button - hidden for founder admin and current user */}
                              {user.id !== FOUNDER_ADMIN_ID && user.id !== currentUserId && (
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  onClick={() => {
                                    setUserToDelete(user);
                                    setDeleteUserDialogOpen(true);
                                  }}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </div>

              {/* Mobile Users Cards */}
              <div className="md:hidden space-y-3 max-h-[60vh] overflow-y-auto">
                {filteredUsers.map((user) => {
                  const userRole = getRoleByName(user.role);
                  const isFounder = user.id === FOUNDER_ADMIN_ID;
                  const isCurrentUser = user.id === currentUserId;
                  return (
                    <div key={user.id} className="bg-muted/50 rounded-lg p-4 space-y-3">
                      {/* Email and badges */}
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-sm break-all">{user.email || 'N/A'}</span>
                        {isFounder && (
                          <Badge variant="outline" className="text-xs border-primary text-primary">
                            Founder
                          </Badge>
                        )}
                        {isCurrentUser && (
                          <Badge variant="outline" className="text-xs">
                            You
                          </Badge>
                        )}
                      </div>

                      {/* Role and date */}
                      <div className="flex items-center justify-between">
                        <Badge 
                          style={{ 
                            backgroundColor: userRole?.color || '#6b7280',
                            color: 'white'
                          }}
                        >
                          {userRole?.display_name || user.role || 'No Role'}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {new Date(user.created_at).toLocaleDateString('en-US')}
                        </span>
                      </div>

                      {/* Actions */}
                      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border/50">
                        <Select
                          value={customRoles?.find(r => r.name === user.role)?.id || 'none'}
                          onValueChange={(value) => handleAssignRole(user.id, value)}
                        >
                          <SelectTrigger className="h-8 flex-1 min-w-[120px]">
                            <SelectValue placeholder="Select Role" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">No Role</SelectItem>
                            {customRoles?.map((role) => (
                              <SelectItem key={role.id} value={role.id}>
                                <div className="flex items-center gap-2">
                                  <div 
                                    className="w-3 h-3 rounded-full" 
                                    style={{ backgroundColor: role.color }}
                                  />
                                  {role.display_name}
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEditUserPermissions(user)}
                        >
                          <UserCog className="w-4 h-4 mr-1" />
                          Permissions
                        </Button>
                        {/* Delete button - hidden for founder admin and current user */}
                        {user.id !== FOUNDER_ADMIN_ID && user.id !== currentUserId && (
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => {
                              setUserToDelete(user);
                              setDeleteUserDialogOpen(true);
                            }}
                          >
                            <Trash2 className="w-4 h-4 mr-1" />
                            Delete
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Roles Tab */}
        <TabsContent value="roles" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Role Management</CardTitle>
                <CardDescription>
                  Create and manage custom roles
                </CardDescription>
              </div>
              <Button onClick={() => setCreateRoleDialogOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                New Role
              </Button>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {customRoles?.map((role) => (
                  <Card key={role.id} className="relative">
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <Badge 
                          style={{ backgroundColor: role.color, color: 'white' }}
                          className="text-sm"
                        >
                          {role.display_name}
                        </Badge>
                        {role.is_system && (
                          <Badge variant="outline" className="text-xs">System</Badge>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <p className="text-sm text-muted-foreground">
                        {role.description || 'No description'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {getPermissionsForRole(role.id).length} permissions
                      </p>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          onClick={() => handleEditRolePermissions(role)}
                        >
                          <Shield className="w-4 h-4 mr-1" />
                          Permissions
                        </Button>
                        {!role.is_system && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setEditingRole(role);
                                setEditRoleDialogOpen(true);
                              }}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => {
                                setRoleToDelete(role);
                                setDeleteRoleDialogOpen(true);
                              }}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Permissions Overview Tab */}
        <TabsContent value="permissions" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Permissions Overview</CardTitle>
              <CardDescription>
                All permissions and which roles have them
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {PERMISSION_CATEGORIES.map((category) => (
                  <div key={category.key}>
                    <h3 className="font-semibold text-lg mb-3">{category.label}</h3>
                    <div className="grid gap-2">
                      {getPermissionsByCategory(category.key).map((perm) => (
                        <div key={perm.key} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                          <div>
                            <p className="font-medium">{perm.label}</p>
                            <p className="text-sm text-muted-foreground">{perm.description}</p>
                          </div>
                          <div className="flex gap-1">
                            {customRoles?.map((role) => {
                              const hasPermission = getPermissionsForRole(role.id).includes(perm.key);
                              return hasPermission ? (
                                <Badge 
                                  key={role.id}
                                  style={{ backgroundColor: role.color, color: 'white' }}
                                  className="text-xs"
                                >
                                  {role.display_name}
                                </Badge>
                              ) : null;
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                    <Separator className="mt-4" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Role Permissions Dialog */}
      <Dialog open={rolePermissionsDialogOpen} onOpenChange={setRolePermissionsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5" />
              Edit {selectedRoleForEdit?.display_name} Permissions
            </DialogTitle>
            <DialogDescription>
              Select permissions for this role
            </DialogDescription>
          </DialogHeader>
          
          <ScrollArea className="max-h-[50vh] pr-4">
            <div className="space-y-6">
              {PERMISSION_CATEGORIES.map((category) => (
                <div key={category.key}>
                  <h4 className="font-semibold mb-3">{category.label}</h4>
                  <div className="space-y-2">
                    {getPermissionsByCategory(category.key).map((perm) => (
                      <div key={perm.key} className="flex items-start space-x-3 p-2 rounded hover:bg-muted/50">
                        <Checkbox
                          id={`role-perm-${perm.key}`}
                          checked={editedRolePermissions.includes(perm.key)}
                          onCheckedChange={() => toggleRolePermission(perm.key)}
                        />
                        <div className="space-y-1">
                          <Label htmlFor={`role-perm-${perm.key}`} className="font-medium cursor-pointer">
                            {perm.label}
                          </Label>
                          <p className="text-xs text-muted-foreground">{perm.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <Separator className="mt-3" />
                </div>
              ))}
            </div>
          </ScrollArea>

          <DialogFooter>
            <Button variant="outline" onClick={() => setRolePermissionsDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveRolePermissions} disabled={updateCustomRolePermissions.isPending}>
              {updateCustomRolePermissions.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* User Permissions Dialog */}
      <Dialog 
        open={userPermissionsDialogOpen} 
        onOpenChange={(open) => {
          setUserPermissionsDialogOpen(open);
          if (open) initUserPermissions();
        }}
      >
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserCog className="w-5 h-5" />
              Custom Permissions
            </DialogTitle>
            <DialogDescription>
              Permission overrides for {selectedUser?.email}
            </DialogDescription>
          </DialogHeader>
          
          <ScrollArea className="max-h-[50vh] pr-4">
            <div className="space-y-4">
              <div className="bg-muted p-3 rounded-lg text-sm">
                <p><strong>Inherit</strong> = Use role's default</p>
                <p><strong>Grant</strong> = Always allow</p>
                <p><strong>Deny</strong> = Always block</p>
              </div>
              <Separator />
              {PERMISSION_CATEGORIES.map((category) => (
                <div key={category.key}>
                  <h4 className="font-semibold mb-3">{category.label}</h4>
                  {getPermissionsByCategory(category.key).map((perm) => {
                    const status = getUserPermissionStatus(perm.key);
                    return (
                      <div key={perm.key} className="space-y-2 mb-3">
                        <Label className="font-medium">{perm.label}</Label>
                        <div className="flex gap-2">
                          <Button
                            variant={status === 'inherit' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => {
                              setEditedUserPermissions(prev => 
                                prev.filter(p => p.permission !== perm.key)
                              );
                            }}
                          >
                            Inherit
                          </Button>
                          <Button
                            variant={status === 'granted' ? 'default' : 'outline'}
                            size="sm"
                            className={status === 'granted' ? 'bg-green-600 hover:bg-green-700' : ''}
                            onClick={() => toggleUserPermission(perm.key, true)}
                          >
                            Grant
                          </Button>
                          <Button
                            variant={status === 'denied' ? 'destructive' : 'outline'}
                            size="sm"
                            onClick={() => toggleUserPermission(perm.key, false)}
                          >
                            Deny
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                  <Separator className="mt-3" />
                </div>
              ))}
            </div>
          </ScrollArea>

          <DialogFooter>
            <Button variant="outline" onClick={() => setUserPermissionsDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveUserPermissions} disabled={updateUserPermissions.isPending}>
              {updateUserPermissions.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create User Dialog */}
      <Dialog open={createUserDialogOpen} onOpenChange={setCreateUserDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="w-5 h-5" />
              Create New User
            </DialogTitle>
            <DialogDescription>
              Add a new user to the system
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-user-email">Email</Label>
              <Input
                id="new-user-email"
                type="email"
                placeholder="user@example.com"
                value={newUserEmail}
                onChange={(e) => setNewUserEmail(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-user-password">Password</Label>
              <Input
                id="new-user-password"
                type="password"
                placeholder="Minimum 6 characters"
                value={newUserPassword}
                onChange={(e) => setNewUserPassword(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-user-role">Role (Optional)</Label>
              <Select
                value={newUserRole}
                onValueChange={(value) => setNewUserRole(value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select Role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No Role</SelectItem>
                  {customRoles?.filter(r => r.is_system).map((role) => (
                    <SelectItem key={role.id} value={role.id}>
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-3 h-3 rounded-full" 
                          style={{ backgroundColor: role.color }}
                        />
                        {role.display_name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setCreateUserDialogOpen(false);
                setNewUserEmail("");
                setNewUserPassword("");
                setNewUserRole('none');
              }}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleCreateUser} 
              disabled={isCreatingUser || !newUserEmail || !newUserPassword}
            >
              {isCreatingUser && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Create User
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Role Dialog */}
      <Dialog open={createRoleDialogOpen} onOpenChange={setCreateRoleDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="w-5 h-5" />
              Create New Role
            </DialogTitle>
            <DialogDescription>
              Create a custom role with specific permissions
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-role-name">Role ID (English)</Label>
              <Input
                id="new-role-name"
                placeholder="content_editor"
                value={newRoleName}
                onChange={(e) => setNewRoleName(e.target.value.toLowerCase().replace(/\s+/g, '_'))}
              />
              <p className="text-xs text-muted-foreground">Lowercase letters and underscores only</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-role-display">Display Name</Label>
              <Input
                id="new-role-display"
                placeholder="Content Editor"
                value={newRoleDisplayName}
                onChange={(e) => setNewRoleDisplayName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-role-desc">Description</Label>
              <Textarea
                id="new-role-desc"
                placeholder="Description of this role..."
                value={newRoleDescription}
                onChange={(e) => setNewRoleDescription(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Role Color</Label>
              <div className="flex flex-wrap gap-2">
                {ROLE_COLORS.map((color) => (
                  <button
                    key={color}
                    className={`w-8 h-8 rounded-full border-2 ${newRoleColor === color ? 'border-foreground' : 'border-transparent'}`}
                    style={{ backgroundColor: color }}
                    onClick={() => setNewRoleColor(color)}
                  />
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setCreateRoleDialogOpen(false);
                setNewRoleName("");
                setNewRoleDisplayName("");
                setNewRoleDescription("");
                setNewRoleColor("#6b7280");
              }}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleCreateRole} 
              disabled={createRole.isPending || !newRoleName || !newRoleDisplayName}
            >
              {createRole.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Create Role
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Role Dialog */}
      <Dialog open={editRoleDialogOpen} onOpenChange={setEditRoleDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit className="w-5 h-5" />
              Edit Role
            </DialogTitle>
          </DialogHeader>
          
          {editingRole && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Display Name</Label>
                <Input
                  value={editingRole.display_name}
                  onChange={(e) => setEditingRole({ ...editingRole, display_name: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  value={editingRole.description || ''}
                  onChange={(e) => setEditingRole({ ...editingRole, description: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label>Role Color</Label>
                <div className="flex flex-wrap gap-2">
                  {ROLE_COLORS.map((color) => (
                    <button
                      key={color}
                      className={`w-8 h-8 rounded-full border-2 ${editingRole.color === color ? 'border-foreground' : 'border-transparent'}`}
                      style={{ backgroundColor: color }}
                      onClick={() => setEditingRole({ ...editingRole, color })}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditRoleDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateRole} disabled={updateRole.isPending}>
              {updateRole.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Update
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Role Dialog */}
      <Dialog open={deleteRoleDialogOpen} onOpenChange={setDeleteRoleDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="w-5 h-5" />
              Delete Role
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this role? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          
          {roleToDelete && (
            <div className="bg-muted p-4 rounded-lg">
              <Badge style={{ backgroundColor: roleToDelete.color, color: 'white' }}>
                {roleToDelete.display_name}
              </Badge>
              <p className="text-sm text-muted-foreground mt-2">
                {roleToDelete.description || 'No description'}
              </p>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteRoleDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              variant="destructive"
              onClick={handleDeleteRole} 
              disabled={deleteRole.isPending}
            >
              {deleteRole.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete User Dialog */}
      <Dialog open={deleteUserDialogOpen} onOpenChange={setDeleteUserDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="w-5 h-5" />
              Delete User
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this user? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          
          {userToDelete && (
            <div className="bg-muted p-4 rounded-lg">
              <p className="font-medium">{userToDelete.email}</p>
              <p className="text-sm text-muted-foreground">
                Role: {userToDelete.role || 'No Role'}
              </p>
            </div>
          )}

          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setDeleteUserDialogOpen(false);
                setUserToDelete(null);
              }}
            >
              Cancel
            </Button>
            <Button 
              variant="destructive"
              onClick={handleDeleteUser} 
              disabled={isDeletingUser}
            >
              {isDeletingUser && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default UserRolesManager;
