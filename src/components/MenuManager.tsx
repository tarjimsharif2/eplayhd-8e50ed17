import { useState } from 'react';
import { 
  useAllCustomMenus, 
  useCreateMenu, 
  useUpdateMenu, 
  useDeleteMenu,
  CustomMenu,
  buildMenuTree
} from '@/hooks/useCustomMenus';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Plus, Edit, Trash2, GripVertical, ChevronRight, ExternalLink, Loader2 } from 'lucide-react';
import * as LucideIcons from 'lucide-react';

// Popular icons list for selection
const POPULAR_ICONS = [
  'Home', 'Menu', 'Search', 'Settings', 'User', 'Users', 'Mail', 'Phone',
  'Globe', 'Link', 'ExternalLink', 'FileText', 'File', 'Folder', 'Image',
  'Video', 'Music', 'Calendar', 'Clock', 'Bell', 'Heart', 'Star', 'Bookmark',
  'Tag', 'Flag', 'MapPin', 'Navigation', 'Compass', 'Trophy', 'Award', 'Target',
  'Zap', 'Flame', 'Sun', 'Moon', 'Cloud', 'Umbrella', 'Droplet', 'Wind',
  'Activity', 'TrendingUp', 'BarChart', 'PieChart', 'DollarSign', 'CreditCard',
  'ShoppingCart', 'ShoppingBag', 'Gift', 'Package', 'Truck', 'Plane', 'Car',
  'Bike', 'Train', 'Ship', 'Rocket', 'Send', 'Share', 'Download', 'Upload',
  'Play', 'Pause', 'Square', 'Circle', 'Triangle', 'Hexagon', 'Octagon',
  'Info', 'HelpCircle', 'AlertCircle', 'CheckCircle', 'XCircle', 'AlertTriangle',
  'Shield', 'Lock', 'Unlock', 'Key', 'Eye', 'EyeOff', 'Tv', 'Radio', 'Gamepad2'
];

const IconPreview = ({ iconName }: { iconName: string | null }) => {
  if (!iconName) return null;
  const IconComponent = (LucideIcons as any)[iconName];
  if (!IconComponent) return null;
  return <IconComponent className="w-4 h-4" />;
};

interface MenuFormData {
  title: string;
  url: string;
  icon_name: string;
  parent_id: string;
  display_order: number;
  is_active: boolean;
  open_in_new_tab: boolean;
  menu_type: string;
}

const initialFormData: MenuFormData = {
  title: '',
  url: '',
  icon_name: '',
  parent_id: '',
  display_order: 0,
  is_active: true,
  open_in_new_tab: false,
  menu_type: 'link',
};

const MenuManager = () => {
  const { data: menus, isLoading } = useAllCustomMenus();
  const createMenu = useCreateMenu();
  const updateMenu = useUpdateMenu();
  const deleteMenu = useDeleteMenu();
  const { toast } = useToast();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingMenu, setEditingMenu] = useState<CustomMenu | null>(null);
  const [formData, setFormData] = useState<MenuFormData>(initialFormData);

  const menuTree = menus ? buildMenuTree(menus) : [];
  const parentMenuOptions = menus?.filter(m => !m.parent_id) || [];

  const handleOpenDialog = (menu?: CustomMenu) => {
    if (menu) {
      setEditingMenu(menu);
      setFormData({
        title: menu.title,
        url: menu.url || '',
        icon_name: menu.icon_name || '',
        parent_id: menu.parent_id || '',
        display_order: menu.display_order,
        is_active: menu.is_active,
        open_in_new_tab: menu.open_in_new_tab,
        menu_type: menu.menu_type,
      });
    } else {
      setEditingMenu(null);
      setFormData({
        ...initialFormData,
        display_order: (menus?.length || 0) + 1,
      });
    }
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!formData.title.trim()) {
      toast({ title: "Title is required", variant: "destructive" });
      return;
    }

    try {
      const menuData = {
        title: formData.title,
        url: formData.url || null,
        icon_name: formData.icon_name || null,
        parent_id: formData.parent_id || null,
        display_order: formData.display_order,
        is_active: formData.is_active,
        open_in_new_tab: formData.open_in_new_tab,
        menu_type: formData.menu_type,
      };

      if (editingMenu) {
        await updateMenu.mutateAsync({ id: editingMenu.id, ...menuData });
        toast({ title: "Menu updated successfully" });
      } else {
        await createMenu.mutateAsync(menuData);
        toast({ title: "Menu created successfully" });
      }
      setDialogOpen(false);
    } catch (error: any) {
      toast({ title: "Error saving menu", description: error.message, variant: "destructive" });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this menu?")) return;
    
    try {
      await deleteMenu.mutateAsync(id);
      toast({ title: "Menu deleted successfully" });
    } catch (error: any) {
      toast({ title: "Error deleting menu", description: error.message, variant: "destructive" });
    }
  };

  const renderMenuItem = (menu: CustomMenu, level = 0) => (
    <div key={menu.id} style={{ marginLeft: level * 24 }}>
      <div className="flex items-center gap-3 p-3 bg-card border border-border rounded-lg mb-2">
        <GripVertical className="w-4 h-4 text-muted-foreground cursor-grab" />
        
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {menu.icon_name && <IconPreview iconName={menu.icon_name} />}
          <span className="font-medium truncate">{menu.title}</span>
          {menu.children && menu.children.length > 0 && (
            <span className="text-xs text-muted-foreground">
              ({menu.children.length} sub-menu)
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {menu.url && (
            <span className="text-xs text-muted-foreground truncate max-w-[150px]">
              {menu.url}
            </span>
          )}
          {menu.open_in_new_tab && <ExternalLink className="w-3 h-3 text-muted-foreground" />}
          
          <div className={`w-2 h-2 rounded-full ${menu.is_active ? 'bg-green-500' : 'bg-red-500'}`} />
          
          <Button variant="ghost" size="sm" onClick={() => handleOpenDialog(menu)}>
            <Edit className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => handleDelete(menu.id)}>
            <Trash2 className="w-4 h-4 text-destructive" />
          </Button>
        </div>
      </div>
      
      {menu.children?.map(child => renderMenuItem(child, level + 1))}
    </div>
  );

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Menu Management</CardTitle>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => handleOpenDialog()}>
              <Plus className="w-4 h-4 mr-2" />
              Add Menu
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingMenu ? 'Edit Menu' : 'Add New Menu'}</DialogTitle>
            </DialogHeader>
            
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Title *</Label>
                <Input
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="Menu title"
                />
              </div>

              <div className="space-y-2">
                <Label>URL</Label>
                <Input
                  value={formData.url}
                  onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                  placeholder="/page-url or https://external-link.com"
                />
              </div>

              <div className="space-y-2">
                <Label>Icon</Label>
                <Select
                  value={formData.icon_name}
                  onValueChange={(value) => setFormData({ ...formData, icon_name: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select icon">
                      {formData.icon_name && (
                        <div className="flex items-center gap-2">
                          <IconPreview iconName={formData.icon_name} />
                          <span>{formData.icon_name}</span>
                        </div>
                      )}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent className="max-h-[300px]">
                    <SelectItem value="">No Icon</SelectItem>
                    {POPULAR_ICONS.map(icon => (
                      <SelectItem key={icon} value={icon}>
                        <div className="flex items-center gap-2">
                          <IconPreview iconName={icon} />
                          <span>{icon}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Parent Menu (for sub-menu)</Label>
                <Select
                  value={formData.parent_id}
                  onValueChange={(value) => setFormData({ ...formData, parent_id: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="None (Top Level)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">None (Top Level)</SelectItem>
                    {parentMenuOptions
                      .filter(m => m.id !== editingMenu?.id)
                      .map(menu => (
                        <SelectItem key={menu.id} value={menu.id}>
                          {menu.title}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Display Order</Label>
                <Input
                  type="number"
                  value={formData.display_order}
                  onChange={(e) => setFormData({ ...formData, display_order: parseInt(e.target.value) || 0 })}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label>Active</Label>
                <Switch
                  checked={formData.is_active}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label>Open in New Tab</Label>
                <Switch
                  checked={formData.open_in_new_tab}
                  onCheckedChange={(checked) => setFormData({ ...formData, open_in_new_tab: checked })}
                />
              </div>

              <Button 
                className="w-full" 
                onClick={handleSubmit}
                disabled={createMenu.isPending || updateMenu.isPending}
              >
                {(createMenu.isPending || updateMenu.isPending) && (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                )}
                {editingMenu ? 'Update Menu' : 'Create Menu'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardHeader>
      
      <CardContent>
        {menuTree.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>No menus created yet. Click "Add Menu" to create your first menu item.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {menuTree.map(menu => renderMenuItem(menu))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default MenuManager;