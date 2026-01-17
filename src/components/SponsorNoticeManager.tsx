import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Plus, Edit2, Trash2, Loader2, Megaphone, Eye, Type, Move } from 'lucide-react';
import { motion } from 'framer-motion';
import { useMatches } from '@/hooks/useSportsData';

interface SponsorNotice {
  id: string;
  title: string;
  content: string;
  position: string;
  display_type: string;
  text_color: string;
  background_color: string;
  is_active: boolean;
  display_order: number;
  match_id: string | null;
  is_global: boolean;
  created_at: string;
}

const SponsorNoticeManager = () => {
  const { toast } = useToast();
  const { data: matches } = useMatches();
  const [notices, setNotices] = useState<SponsorNotice[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingNotice, setEditingNotice] = useState<SponsorNotice | null>(null);
  
  const [form, setForm] = useState({
    title: '',
    content: '',
    position: 'before_stream' as string,
    display_type: 'static' as string,
    text_color: '#ffffff',
    background_color: '#1a1a2e',
    is_active: true,
    display_order: 0,
    match_id: null as string | null,
    is_global: true,
  });

  const positionOptions = [
    { value: 'before_stream', label: 'Before Stream Player' },
    { value: 'before_servers', label: 'Before Server Selection' },
    { value: 'before_scoreboard', label: 'Before Scoreboard' },
  ];

  const displayTypeOptions = [
    { value: 'static', label: 'Static Text' },
    { value: 'marquee', label: 'Scrolling Text (Marquee)' },
  ];

  useEffect(() => {
    fetchNotices();
  }, []);

  const fetchNotices = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('sponsor_notices')
      .select('*')
      .order('display_order', { ascending: true });
    
    if (error) {
      toast({ title: 'Error', description: 'Failed to fetch notices', variant: 'destructive' });
    } else {
      setNotices(data as SponsorNotice[]);
    }
    setLoading(false);
  };

  const resetForm = () => {
    setForm({
      title: '',
      content: '',
      position: 'before_stream',
      display_type: 'static',
      text_color: '#ffffff',
      background_color: '#1a1a2e',
      is_active: true,
      display_order: 0,
      match_id: null,
      is_global: true,
    });
    setEditingNotice(null);
  };

  const handleEdit = (notice: SponsorNotice) => {
    setEditingNotice(notice);
    setForm({
      title: notice.title,
      content: notice.content,
      position: notice.position,
      display_type: notice.display_type,
      text_color: notice.text_color || '#ffffff',
      background_color: notice.background_color || '#1a1a2e',
      is_active: notice.is_active,
      display_order: notice.display_order,
      match_id: notice.match_id,
      is_global: notice.is_global,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.title || !form.content) {
      toast({ title: 'Error', description: 'Title and content are required', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const data = {
        title: form.title,
        content: form.content,
        position: form.position,
        display_type: form.display_type,
        text_color: form.text_color,
        background_color: form.background_color,
        is_active: form.is_active,
        display_order: form.display_order,
        match_id: form.is_global ? null : form.match_id,
        is_global: form.is_global,
      };

      if (editingNotice) {
        const { error } = await supabase
          .from('sponsor_notices')
          .update(data)
          .eq('id', editingNotice.id);
        
        if (error) throw error;
        toast({ title: 'Success', description: 'Notice updated successfully' });
      } else {
        const { error } = await supabase
          .from('sponsor_notices')
          .insert(data);
        
        if (error) throw error;
        toast({ title: 'Success', description: 'Notice created successfully' });
      }

      setDialogOpen(false);
      resetForm();
      fetchNotices();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this notice?')) return;

    try {
      const { error } = await supabase
        .from('sponsor_notices')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
      toast({ title: 'Success', description: 'Notice deleted successfully' });
      fetchNotices();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  const getPositionLabel = (position: string) => {
    return positionOptions.find(p => p.value === position)?.label || position;
  };

  const getDisplayTypeLabel = (type: string) => {
    return displayTypeOptions.find(d => d.value === type)?.label || type;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Megaphone className="w-5 h-5 text-primary" />
                Sponsor Notice Manager
              </CardTitle>
              <CardDescription>Add and manage sponsor text/banners on stream pages</CardDescription>
            </div>
            <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
              <DialogTrigger asChild>
                <Button variant="gradient">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Notice
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{editingNotice ? 'Edit Notice' : 'Add New Notice'}</DialogTitle>
                  <DialogDescription>Fill in the notice details</DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Title</Label>
                    <Input
                      placeholder="Notice title"
                      value={form.title}
                      onChange={(e) => setForm({ ...form, title: e.target.value })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Content (HTML Supported)</Label>
                    <Textarea
                      placeholder="<span style='color: yellow;'>Sponsor:</span> ePlayHD.com"
                      value={form.content}
                      onChange={(e) => setForm({ ...form, content: e.target.value })}
                      rows={3}
                    />
                    <p className="text-xs text-muted-foreground">
                      You can use HTML tags like: &lt;b&gt;, &lt;span style="color: red;"&gt;, &lt;a href="..."&gt;
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="flex items-center gap-2">
                        <Move className="w-4 h-4" />
                        পজিশন
                      </Label>
                      <Select value={form.position} onValueChange={(v) => setForm({ ...form, position: v })}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {positionOptions.map(opt => (
                            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label className="flex items-center gap-2">
                        <Type className="w-4 h-4" />
                        ডিসপ্লে টাইপ
                      </Label>
                      <Select value={form.display_type} onValueChange={(v) => setForm({ ...form, display_type: v })}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {displayTypeOptions.map(opt => (
                            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Text Color</Label>
                      <div className="flex gap-2">
                        <Input
                          type="color"
                          value={form.text_color}
                          onChange={(e) => setForm({ ...form, text_color: e.target.value })}
                          className="w-14 h-10 p-1 cursor-pointer"
                        />
                        <Input
                          value={form.text_color}
                          onChange={(e) => setForm({ ...form, text_color: e.target.value })}
                          placeholder="#ffffff"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Background Color</Label>
                      <div className="flex gap-2">
                        <Input
                          type="color"
                          value={form.background_color}
                          onChange={(e) => setForm({ ...form, background_color: e.target.value })}
                          className="w-14 h-10 p-1 cursor-pointer"
                        />
                        <Input
                          value={form.background_color}
                          onChange={(e) => setForm({ ...form, background_color: e.target.value })}
                          placeholder="#1a1a2e"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Display Order</Label>
                    <Input
                      type="number"
                      value={form.display_order}
                      onChange={(e) => setForm({ ...form, display_order: parseInt(e.target.value) || 0 })}
                    />
                  </div>

                  <div className="flex items-center gap-4 p-4 border rounded-lg">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={form.is_global}
                        onCheckedChange={(checked) => setForm({ ...form, is_global: checked, match_id: checked ? null : form.match_id })}
                      />
                      <Label>Show on All Matches (Global)</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={form.is_active}
                        onCheckedChange={(checked) => setForm({ ...form, is_active: checked })}
                      />
                      <Label>Active</Label>
                    </div>
                  </div>

                  {!form.is_global && (
                    <div className="space-y-2">
                      <Label>Select Specific Match</Label>
                      <Select value={form.match_id || ''} onValueChange={(v) => setForm({ ...form, match_id: v || null })}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a match" />
                        </SelectTrigger>
                        <SelectContent>
                          {matches?.map(match => (
                            <SelectItem key={match.id} value={match.id}>
                              {match.team_a?.short_name} vs {match.team_b?.short_name} - {match.match_date}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* Preview */}
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Eye className="w-4 h-4" />
                      Preview
                    </Label>
                    <div
                      className="rounded-lg overflow-hidden"
                      style={{ backgroundColor: form.background_color }}
                    >
                      {form.display_type === 'marquee' ? (
                        <div className="overflow-hidden py-2 px-4">
                          <div
                            className="whitespace-nowrap animate-marquee"
                            style={{ color: form.text_color }}
                            dangerouslySetInnerHTML={{ __html: form.content || 'Preview text...' }}
                          />
                        </div>
                      ) : (
                        <div
                          className="py-2 px-4 text-center"
                          style={{ color: form.text_color }}
                          dangerouslySetInnerHTML={{ __html: form.content || 'Preview text...' }}
                        />
                      )}
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }}>
                    Cancel
                  </Button>
                  <Button variant="gradient" onClick={handleSave} disabled={saving}>
                    {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                    {editingNotice ? 'Update' : 'Add'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {notices.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No notices yet. Add a new notice!
            </p>
          ) : (
            <div className="space-y-3">
              {notices.map((notice, index) => (
                <motion.div
                  key={notice.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                >
                  <Card className="hover:border-primary/50 transition-colors">
                    <CardContent className="p-4">
                      <div className="flex flex-col md:flex-row md:items-center gap-4">
                        {/* Preview */}
                        <div
                          className="w-full md:w-64 rounded-lg overflow-hidden"
                          style={{ backgroundColor: notice.background_color }}
                        >
                          <div
                            className={`py-2 px-3 text-sm ${notice.display_type === 'marquee' ? 'truncate' : 'text-center'}`}
                            style={{ color: notice.text_color }}
                            dangerouslySetInnerHTML={{ __html: notice.content }}
                          />
                        </div>

                        <div className="flex-1 space-y-1">
                          <p className="font-semibold">{notice.title}</p>
                          <div className="flex flex-wrap gap-2">
                            <Badge variant="outline">{getPositionLabel(notice.position)}</Badge>
                            <Badge variant="secondary">{getDisplayTypeLabel(notice.display_type)}</Badge>
                            {notice.is_global ? (
                              <Badge variant="upcoming">Global</Badge>
                            ) : (
                              <Badge variant="outline">নির্দিষ্ট ম্যাচ</Badge>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <Badge variant={notice.is_active ? 'live' : 'completed'}>
                            {notice.is_active ? 'Active' : 'Inactive'}
                          </Badge>
                          <Button variant="ghost" size="icon" onClick={() => handleEdit(notice)}>
                            <Edit2 className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDelete(notice.id)}>
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default SponsorNoticeManager;
