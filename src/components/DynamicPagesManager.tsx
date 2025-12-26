import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Edit2, Trash2, FileText, Eye, EyeOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { 
  useDynamicPages, 
  useCreateDynamicPage, 
  useUpdateDynamicPage, 
  useDeleteDynamicPage,
  DynamicPage 
} from "@/hooks/useDynamicPages";

const DynamicPagesManager = () => {
  const { toast } = useToast();
  const { data: pages, isLoading } = useDynamicPages();
  const createPage = useCreateDynamicPage();
  const updatePage = useUpdateDynamicPage();
  const deletePage = useDeleteDynamicPage();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPage, setEditingPage] = useState<DynamicPage | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const [form, setForm] = useState({
    slug: '',
    title: '',
    content: '',
    content_type: 'html' as 'html' | 'text',
    is_active: true,
    show_in_header: false,
    show_in_footer: true,
    display_order: 0,
    seo_title: '',
    seo_description: '',
    seo_keywords: '',
    og_image_url: '',
  });

  useEffect(() => {
    if (editingPage) {
      setForm({
        slug: editingPage.slug,
        title: editingPage.title,
        content: editingPage.content || '',
        content_type: editingPage.content_type,
        is_active: editingPage.is_active,
        show_in_header: editingPage.show_in_header,
        show_in_footer: editingPage.show_in_footer,
        display_order: editingPage.display_order,
        seo_title: editingPage.seo_title || '',
        seo_description: editingPage.seo_description || '',
        seo_keywords: editingPage.seo_keywords || '',
        og_image_url: editingPage.og_image_url || '',
      });
    } else {
      setForm({
        slug: '',
        title: '',
        content: '',
        content_type: 'html',
        is_active: true,
        show_in_header: false,
        show_in_footer: true,
        display_order: 0,
        seo_title: '',
        seo_description: '',
        seo_keywords: '',
        og_image_url: '',
      });
    }
  }, [editingPage]);

  const handleSubmit = async () => {
    if (!form.slug || !form.title) {
      toast({
        title: "Error",
        description: "Slug and title are required",
        variant: "destructive",
      });
      return;
    }

    // Clean slug
    const cleanSlug = form.slug.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

    try {
      if (editingPage) {
        await updatePage.mutateAsync({
          id: editingPage.id,
          ...form,
          slug: cleanSlug,
        });
        toast({ title: "Success", description: "Page updated successfully" });
      } else {
        await createPage.mutateAsync({
          ...form,
          slug: cleanSlug,
        });
        toast({ title: "Success", description: "Page created successfully" });
      }
      setDialogOpen(false);
      setEditingPage(null);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to save page",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this page?")) return;
    
    try {
      await deletePage.mutateAsync(id);
      toast({ title: "Success", description: "Page deleted successfully" });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete page",
        variant: "destructive",
      });
    }
  };

  const filteredPages = pages?.filter(page => 
    page.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    page.slug.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <Input
          placeholder="Search pages..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="max-w-xs"
        />
        <Button onClick={() => { setEditingPage(null); setDialogOpen(true); }}>
          <Plus className="w-4 h-4 mr-2" />
          Add Page
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Loading pages...</div>
      ) : !filteredPages?.length ? (
        <div className="text-center py-8 text-muted-foreground">No pages found</div>
      ) : (
        <div className="grid gap-4">
          {filteredPages.map((page) => (
            <Card key={page.id} className="bg-card/50">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <FileText className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">{page.title}</CardTitle>
                      <p className="text-sm text-muted-foreground">/{page.slug}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {page.is_active ? (
                      <Eye className="w-4 h-4 text-green-500" />
                    ) : (
                      <EyeOff className="w-4 h-4 text-muted-foreground" />
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => { setEditingPage(page); setDialogOpen(true); }}
                    >
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(page.id)}
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2 text-xs">
                  {page.show_in_header && (
                    <span className="px-2 py-1 bg-primary/10 text-primary rounded">Header</span>
                  )}
                  {page.show_in_footer && (
                    <span className="px-2 py-1 bg-secondary/50 text-secondary-foreground rounded">Footer</span>
                  )}
                  <span className="px-2 py-1 bg-muted text-muted-foreground rounded">
                    {page.content_type.toUpperCase()}
                  </span>
                  <span className="px-2 py-1 bg-muted text-muted-foreground rounded">
                    Order: {page.display_order}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingPage ? 'Edit Page' : 'Create New Page'}</DialogTitle>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="title">Title *</Label>
                <Input
                  id="title"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="Page Title"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="slug">Slug *</Label>
                <Input
                  id="slug"
                  value={form.slug}
                  onChange={(e) => setForm({ ...form, slug: e.target.value })}
                  placeholder="page-slug"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="content_type">Content Type</Label>
                <Select
                  value={form.content_type}
                  onValueChange={(value: 'html' | 'text') => setForm({ ...form, content_type: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="html">HTML</SelectItem>
                    <SelectItem value="text">Plain Text</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="display_order">Display Order</Label>
                <Input
                  id="display_order"
                  type="number"
                  value={form.display_order}
                  onChange={(e) => setForm({ ...form, display_order: parseInt(e.target.value) || 0 })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="content">Content</Label>
              <Textarea
                id="content"
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                placeholder={form.content_type === 'html' ? '<h1>Page Title</h1><p>Content here...</p>' : 'Plain text content...'}
                rows={12}
                className="font-mono text-sm"
              />
            </div>

            <div className="flex flex-wrap gap-6">
              <div className="flex items-center gap-2">
                <Switch
                  id="is_active"
                  checked={form.is_active}
                  onCheckedChange={(checked) => setForm({ ...form, is_active: checked })}
                />
                <Label htmlFor="is_active">Active</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="show_in_header"
                  checked={form.show_in_header}
                  onCheckedChange={(checked) => setForm({ ...form, show_in_header: checked })}
                />
                <Label htmlFor="show_in_header">Show in Header</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="show_in_footer"
                  checked={form.show_in_footer}
                  onCheckedChange={(checked) => setForm({ ...form, show_in_footer: checked })}
                />
                <Label htmlFor="show_in_footer">Show in Footer</Label>
              </div>
            </div>

            <div className="border-t border-border pt-4 mt-2">
              <h4 className="font-medium mb-4">SEO Settings</h4>
              <div className="grid gap-4">
                <div className="space-y-2">
                  <Label htmlFor="seo_title">SEO Title</Label>
                  <Input
                    id="seo_title"
                    value={form.seo_title}
                    onChange={(e) => setForm({ ...form, seo_title: e.target.value })}
                    placeholder="SEO optimized title"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="seo_description">SEO Description</Label>
                  <Textarea
                    id="seo_description"
                    value={form.seo_description}
                    onChange={(e) => setForm({ ...form, seo_description: e.target.value })}
                    placeholder="Meta description for search engines"
                    rows={2}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="seo_keywords">SEO Keywords</Label>
                  <Input
                    id="seo_keywords"
                    value={form.seo_keywords}
                    onChange={(e) => setForm({ ...form, seo_keywords: e.target.value })}
                    placeholder="keyword1, keyword2, keyword3"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="og_image_url">OG Image URL</Label>
                  <Input
                    id="og_image_url"
                    value={form.og_image_url}
                    onChange={(e) => setForm({ ...form, og_image_url: e.target.value })}
                    placeholder="https://example.com/image.jpg"
                  />
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={createPage.isPending || updatePage.isPending}>
              {editingPage ? 'Update Page' : 'Create Page'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DynamicPagesManager;
