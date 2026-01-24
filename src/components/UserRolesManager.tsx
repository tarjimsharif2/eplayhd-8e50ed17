import { useState, useMemo } from "react";
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
import { useToast } from "@/hooks/use-toast";
import { 
  useUsersWithRoles, 
  useRolePermissions, 
  useUserPermissions,
  useAssignRole, 
  useRemoveRole,
  useUpdateRolePermissions,
  useUpdateUserPermissions,
  AVAILABLE_PERMISSIONS,
  UserWithRole 
} from "@/hooks/useUserRoles";
import { Users, Shield, Settings, Search, Loader2, UserCog, Save, X } from "lucide-react";

interface UserRolesManagerProps {
  adminSlug: string;
  onAdminSlugChange: (slug: string) => void;
  onSaveAdminSlug: () => void;
  isSaving: boolean;
}

const UserRolesManager = ({ adminSlug, onAdminSlugChange, onSaveAdminSlug, isSaving }: UserRolesManagerProps) => {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUser, setSelectedUser] = useState<UserWithRole | null>(null);
  const [userPermissionsDialogOpen, setUserPermissionsDialogOpen] = useState(false);
  const [rolePermissionsDialogOpen, setRolePermissionsDialogOpen] = useState(false);
  const [selectedRoleForEdit, setSelectedRoleForEdit] = useState<'admin' | 'moderator' | 'user'>('moderator');
  const [editedRolePermissions, setEditedRolePermissions] = useState<string[]>([]);
  const [editedUserPermissions, setEditedUserPermissions] = useState<{ permission: string; granted: boolean }[]>([]);

  const { data: users, isLoading: usersLoading } = useUsersWithRoles();
  const { data: rolePermissions, isLoading: rolePermissionsLoading } = useRolePermissions();
  const { data: userPermissions } = useUserPermissions(selectedUser?.id);

  const assignRole = useAssignRole();
  const removeRole = useRemoveRole();
  const updateRolePermissions = useUpdateRolePermissions();
  const updateUserPermissions = useUpdateUserPermissions();

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

  // Get permissions for a specific role
  const getPermissionsForRole = (role: 'admin' | 'moderator' | 'user') => {
    if (!rolePermissions) return [];
    return rolePermissions.filter(rp => rp.role === role).map(rp => rp.permission);
  };

  // Handle role assignment
  const handleAssignRole = async (userId: string, role: 'admin' | 'moderator' | 'user' | 'none') => {
    try {
      if (role === 'none') {
        await removeRole.mutateAsync(userId);
        toast({ title: "Success", description: "Role removed successfully" });
      } else {
        await assignRole.mutateAsync({ userId, role });
        toast({ title: "Success", description: `Role assigned: ${role}` });
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
  const handleEditRolePermissions = (role: 'admin' | 'moderator' | 'user') => {
    setSelectedRoleForEdit(role);
    setEditedRolePermissions(getPermissionsForRole(role));
    setRolePermissionsDialogOpen(true);
  };

  // Save role permissions
  const handleSaveRolePermissions = async () => {
    try {
      await updateRolePermissions.mutateAsync({
        role: selectedRoleForEdit,
        permissions: editedRolePermissions
      });
      toast({ title: "Success", description: `${selectedRoleForEdit} permissions updated` });
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
        // Toggle or remove
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

  const getRoleBadgeVariant = (role: string | null) => {
    switch (role) {
      case 'admin': return 'destructive';
      case 'moderator': return 'default';
      case 'user': return 'secondary';
      default: return 'outline';
    }
  };

  if (usersLoading || rolePermissionsLoading) {
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
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="users" className="flex items-center gap-2">
            <Users className="w-4 h-4" />
            Users & Roles
          </TabsTrigger>
          <TabsTrigger value="permissions" className="flex items-center gap-2">
            <Shield className="w-4 h-4" />
            Role Permissions
          </TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>User Management</CardTitle>
              <CardDescription>
                Assign roles and custom permissions to users
              </CardDescription>
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

              {/* Users table */}
              <ScrollArea className="h-[400px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Email</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Joined</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredUsers.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell className="font-medium">{user.email || 'N/A'}</TableCell>
                        <TableCell>
                          <Badge variant={getRoleBadgeVariant(user.role)}>
                            {user.role || 'No Role'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {new Date(user.created_at).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="text-right space-x-2">
                          <Select
                            value={user.role || 'none'}
                            onValueChange={(value) => handleAssignRole(user.id, value as any)}
                          >
                            <SelectTrigger className="w-32 h-8">
                              <SelectValue placeholder="Select role" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">No Role</SelectItem>
                              <SelectItem value="admin">Admin</SelectItem>
                              <SelectItem value="moderator">Moderator</SelectItem>
                              <SelectItem value="user">User</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEditUserPermissions(user)}
                          >
                            <UserCog className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="permissions" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            {(['admin', 'moderator', 'user'] as const).map((role) => (
              <Card key={role}>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant={getRoleBadgeVariant(role)} className="capitalize">
                        {role}
                      </Badge>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEditRolePermissions(role)}
                    >
                      Edit
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {getPermissionsForRole(role).length === 0 ? (
                      <p className="text-sm text-muted-foreground">No permissions assigned</p>
                    ) : (
                      getPermissionsForRole(role).map((perm) => {
                        const permInfo = AVAILABLE_PERMISSIONS.find(p => p.key === perm);
                        return (
                          <div key={perm} className="text-sm">
                            <span className="font-medium">{permInfo?.label || perm}</span>
                          </div>
                        );
                      })
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      {/* Role Permissions Dialog */}
      <Dialog open={rolePermissionsDialogOpen} onOpenChange={setRolePermissionsDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5" />
              Edit {selectedRoleForEdit} Permissions
            </DialogTitle>
            <DialogDescription>
              Select which permissions this role should have
            </DialogDescription>
          </DialogHeader>
          
          <ScrollArea className="max-h-[400px] pr-4">
            <div className="space-y-4">
              {AVAILABLE_PERMISSIONS.map((perm) => (
                <div key={perm.key} className="flex items-start space-x-3">
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
          </ScrollArea>

          <DialogFooter>
            <Button variant="outline" onClick={() => setRolePermissionsDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveRolePermissions} disabled={updateRolePermissions.isPending}>
              {updateRolePermissions.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Save Changes
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
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserCog className="w-5 h-5" />
              Custom Permissions
            </DialogTitle>
            <DialogDescription>
              Override role permissions for {selectedUser?.email}
            </DialogDescription>
          </DialogHeader>
          
          <ScrollArea className="max-h-[400px] pr-4">
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                <strong>Inherit</strong> = Use role's default<br />
                <strong>Grant</strong> = Always allow<br />
                <strong>Deny</strong> = Always block
              </p>
              <Separator />
              {AVAILABLE_PERMISSIONS.map((perm) => {
                const status = getUserPermissionStatus(perm.key);
                return (
                  <div key={perm.key} className="space-y-2">
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
            </div>
          </ScrollArea>

          <DialogFooter>
            <Button variant="outline" onClick={() => setUserPermissionsDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveUserPermissions} disabled={updateUserPermissions.isPending}>
              {updateUserPermissions.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default UserRolesManager;
