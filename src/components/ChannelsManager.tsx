import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  useAllChannels,
  useCreateChannel,
  useUpdateChannel,
  useDeleteChannel,
  useAllChannelStreamingServers,
  useCreateChannelServer,
  useUpdateChannelServer,
  useDeleteChannelServer,
  Channel,
  ChannelStreamingServer
} from "@/hooks/useChannels";
import { Plus, Edit2, Trash2, Tv, Loader2, Radio, Server, ExternalLink, Play, Settings } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import HeaderEditor, { HeaderItem, headersToServerForm, serverFormToHeaders } from "@/components/HeaderEditor";

interface ChannelFormType {
  name: string;
  slug: string;
  logo_url: string;
  logo_background_color: string;
  description: string;
  seo_title: string;
  seo_description: string;
  seo_keywords: string;
  display_order: number;
  is_active: boolean;
}

const defaultChannelForm: ChannelFormType = {
  name: '',
  slug: '',
  logo_url: '',
  logo_background_color: '#1a1a2e',
  description: '',
  seo_title: '',
  seo_description: '',
  seo_keywords: '',
  display_order: 0,
  is_active: true,
};

interface ServerFormType {
  server_name: string;
  server_url: string;
  server_type: 'iframe' | 'm3u8' | 'embed' | 'iframe_to_m3u8';
  display_order: number;
  is_active: boolean;
  ad_block_enabled: boolean;
}

const defaultServerForm: ServerFormType = {
  server_name: '',
  server_url: '',
  server_type: 'iframe',
  display_order: 0,
  is_active: true,
  ad_block_enabled: false,
};

const ChannelsManager = () => {
  const { toast } = useToast();
  const { data: channels, isLoading } = useAllChannels();
  const createChannel = useCreateChannel();
  const updateChannel = useUpdateChannel();
  const deleteChannel = useDeleteChannel();

  const [channelDialogOpen, setChannelDialogOpen] = useState(false);
  const [editingChannel, setEditingChannel] = useState<Channel | null>(null);
  const [channelForm, setChannelForm] = useState<ChannelFormType>({ ...defaultChannelForm });
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);

  const resetChannelForm = () => {
    setEditingChannel(null);
    setChannelForm({ ...defaultChannelForm });
  };

  const handleEditChannel = (channel: Channel) => {
    setEditingChannel(channel);
    setChannelForm({
      name: channel.name,
      slug: channel.slug || '',
      logo_url: channel.logo_url || '',
      logo_background_color: channel.logo_background_color || '#1a1a2e',
      description: channel.description || '',
      seo_title: channel.seo_title || '',
      seo_description: channel.seo_description || '',
      seo_keywords: channel.seo_keywords || '',
      display_order: channel.display_order,
      is_active: channel.is_active,
    });
    setChannelDialogOpen(true);
  };

  const handleSaveChannel = async () => {
    if (!channelForm.name) {
      toast({ title: "Error", description: "Channel name is required", variant: "destructive" });
      return;
    }

    // Auto-generate slug if not provided
    const slug = channelForm.slug || channelForm.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

    try {
      if (editingChannel) {
        await updateChannel.mutateAsync({ id: editingChannel.id, ...channelForm, slug });
        toast({ title: "Channel updated successfully" });
      } else {
        await createChannel.mutateAsync({ ...channelForm, slug });
        toast({ title: "Channel created successfully" });
      }
      setChannelDialogOpen(false);
      resetChannelForm();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleDeleteChannel = async (id: string) => {
    if (!confirm('Are you sure you want to delete this channel?')) return;
    try {
      await deleteChannel.mutateAsync(id);
      toast({ title: "Channel deleted successfully" });
      if (selectedChannel?.id === id) setSelectedChannel(null);
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-display text-gradient flex items-center gap-2">
            <Radio className="w-6 h-6" />
            Sports Channels
          </h2>
          <p className="text-muted-foreground text-sm">Manage live sports channels</p>
        </div>
        <Button variant="gradient" onClick={() => setChannelDialogOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Add Channel
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : channels?.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Radio className="w-16 h-16 text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground text-lg">No channels yet</p>
            <p className="text-sm text-muted-foreground/70">Add your first sports channel</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Channels List */}
          <div className="space-y-3">
            <h3 className="font-semibold text-sm text-muted-foreground">All Channels ({channels?.length})</h3>
            {channels?.map((channel) => (
              <Card 
                key={channel.id} 
                className={`cursor-pointer transition-all ${selectedChannel?.id === channel.id ? 'ring-2 ring-primary' : ''} ${!channel.is_active ? 'opacity-60' : ''}`}
                onClick={() => setSelectedChannel(channel)}
              >
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    <div 
                      className="w-12 h-12 rounded-lg flex items-center justify-center border border-border/30 flex-shrink-0"
                      style={{ backgroundColor: channel.logo_background_color || '#1a1a2e' }}
                    >
                      {channel.logo_url ? (
                        <img src={channel.logo_url} alt={channel.name} className="w-8 h-8 object-contain" />
                      ) : (
                        <Tv className="w-6 h-6 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="font-semibold truncate">{channel.name}</h4>
                        {!channel.is_active && <Badge variant="secondary" className="text-xs">Inactive</Badge>}
                      </div>
                      <p className="text-sm text-muted-foreground truncate">/channel/{channel.slug}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); handleEditChannel(channel); }}>
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); handleDeleteChannel(channel.id); }}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Streaming Servers Panel */}
          <div>
            {selectedChannel ? (
              <ChannelServersPanel channel={selectedChannel} />
            ) : (
              <Card className="border-dashed h-full">
                <CardContent className="flex flex-col items-center justify-center py-12 text-center h-full">
                  <Server className="w-12 h-12 text-muted-foreground/50 mb-3" />
                  <p className="text-muted-foreground">Select a channel to manage servers</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}

      {/* Channel Dialog */}
      <Dialog open={channelDialogOpen} onOpenChange={setChannelDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingChannel ? 'Edit Channel' : 'Add Channel'}</DialogTitle>
            <DialogDescription>
              {editingChannel ? 'Update channel details' : 'Create a new sports channel'}
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="basic" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="basic">Basic Info</TabsTrigger>
              <TabsTrigger value="seo">SEO</TabsTrigger>
              <TabsTrigger value="description">Description</TabsTrigger>
            </TabsList>

            <TabsContent value="basic" className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Channel Name *</Label>
                  <Input
                    placeholder="e.g., Sky Sports"
                    value={channelForm.name}
                    onChange={(e) => setChannelForm({ ...channelForm, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Slug</Label>
                  <Input
                    placeholder="sky-sports (auto-generated)"
                    value={channelForm.slug}
                    onChange={(e) => setChannelForm({ ...channelForm, slug: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Logo URL</Label>
                  <Input
                    placeholder="https://example.com/logo.png"
                    value={channelForm.logo_url}
                    onChange={(e) => setChannelForm({ ...channelForm, logo_url: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Logo Background Color</Label>
                  <div className="flex gap-2">
                    <Input
                      type="color"
                      value={channelForm.logo_background_color}
                      onChange={(e) => setChannelForm({ ...channelForm, logo_background_color: e.target.value })}
                      className="w-12 h-10 p-1"
                    />
                    <Input
                      value={channelForm.logo_background_color}
                      onChange={(e) => setChannelForm({ ...channelForm, logo_background_color: e.target.value })}
                      className="flex-1"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Display Order</Label>
                  <Input
                    type="number"
                    value={channelForm.display_order}
                    onChange={(e) => setChannelForm({ ...channelForm, display_order: parseInt(e.target.value) || 0 })}
                  />
                </div>
                <div className="flex items-center gap-3 pt-6">
                  <Switch
                    checked={channelForm.is_active}
                    onCheckedChange={(checked) => setChannelForm({ ...channelForm, is_active: checked })}
                  />
                  <Label>Active</Label>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="seo" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label>SEO Title</Label>
                <Input
                  placeholder="Channel title for search engines"
                  value={channelForm.seo_title}
                  onChange={(e) => setChannelForm({ ...channelForm, seo_title: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>SEO Description</Label>
                <Textarea
                  placeholder="Channel description for search engines"
                  value={channelForm.seo_description}
                  onChange={(e) => setChannelForm({ ...channelForm, seo_description: e.target.value })}
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label>SEO Keywords</Label>
                <Input
                  placeholder="keyword1, keyword2, keyword3"
                  value={channelForm.seo_keywords}
                  onChange={(e) => setChannelForm({ ...channelForm, seo_keywords: e.target.value })}
                />
              </div>
            </TabsContent>

            <TabsContent value="description" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label>Description (HTML supported)</Label>
                <Textarea
                  placeholder="<p>About this channel...</p>"
                  value={channelForm.description}
                  onChange={(e) => setChannelForm({ ...channelForm, description: e.target.value })}
                  rows={10}
                  className="font-mono text-sm"
                />
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setChannelDialogOpen(false); resetChannelForm(); }}>
              Cancel
            </Button>
            <Button variant="gradient" onClick={handleSaveChannel}>
              {editingChannel ? 'Update' : 'Create'} Channel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// Servers Panel Component
const ChannelServersPanel = ({ channel }: { channel: Channel }) => {
  const { toast } = useToast();
  const { data: servers, isLoading } = useAllChannelStreamingServers(channel.id);
  const createServer = useCreateChannelServer();
  const updateServer = useUpdateChannelServer();
  const deleteServer = useDeleteChannelServer();

  const [serverDialogOpen, setServerDialogOpen] = useState(false);
  const [editingServer, setEditingServer] = useState<ChannelStreamingServer | null>(null);
  const [serverForm, setServerForm] = useState<ServerFormType>({ ...defaultServerForm });
  const [formHeaders, setFormHeaders] = useState<HeaderItem[]>([]);

  const resetServerForm = () => {
    setEditingServer(null);
    setServerForm({ ...defaultServerForm });
    setFormHeaders([]);
  };

  const handleEditServer = (server: ChannelStreamingServer) => {
    setEditingServer(server);
    setServerForm({
      server_name: server.server_name,
      server_url: server.server_url,
      server_type: server.server_type as any,
      display_order: server.display_order,
      is_active: server.is_active,
      ad_block_enabled: server.ad_block_enabled,
    });
    setFormHeaders(serverFormToHeaders({
      referer_value: server.referer_value || '',
      origin_value: server.origin_value || '',
      cookie_value: server.cookie_value || '',
      user_agent: server.user_agent || '',
    }));
    setServerDialogOpen(true);
  };

  const handleSaveServer = async () => {
    if (!serverForm.server_name || !serverForm.server_url) {
      toast({ title: "Error", description: "Server name and URL are required", variant: "destructive" });
      return;
    }

    const headerValues = headersToServerForm(formHeaders);

    const serverData = {
      channel_id: channel.id,
      server_name: serverForm.server_name,
      server_url: serverForm.server_url,
      server_type: serverForm.server_type,
      display_order: serverForm.display_order,
      is_active: serverForm.is_active,
      referer_value: headerValues.referer_value || null,
      origin_value: headerValues.origin_value || null,
      cookie_value: headerValues.cookie_value || null,
      user_agent: headerValues.user_agent || null,
      ad_block_enabled: serverForm.ad_block_enabled,
      drm_license_url: null,
      drm_scheme: null,
      player_type: null,
      clearkey_key_id: null,
      clearkey_key: null,
      is_working: true,
      original_display_order: null,
    };

    try {
      if (editingServer) {
        await updateServer.mutateAsync({ id: editingServer.id, ...serverData });
        toast({ title: "Server updated successfully" });
      } else {
        await createServer.mutateAsync(serverData);
        toast({ title: "Server added successfully" });
      }
      setServerDialogOpen(false);
      resetServerForm();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleDeleteServer = async (id: string) => {
    try {
      await deleteServer.mutateAsync(id);
      toast({ title: "Server deleted successfully" });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'm3u8': return 'bg-green-500/20 text-green-400 border-green-500/30';
      case 'iframe': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'embed': return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
      case 'iframe_to_m3u8': return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Server className="w-5 h-5 text-primary" />
            {channel.name} Servers
          </CardTitle>
          <Button variant="gradient" size="sm" onClick={() => setServerDialogOpen(true)}>
            <Plus className="w-4 h-4 mr-1" />
            Add Server
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : servers?.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <Tv className="w-10 h-10 mx-auto mb-2 opacity-50" />
            <p>No servers configured</p>
          </div>
        ) : (
          servers?.map((server) => (
            <div key={server.id} className={`p-3 rounded-lg border ${!server.is_active ? 'opacity-60' : ''} ${server.is_working === false ? 'border-destructive/50' : 'border-border'}`}>
              <div className="flex items-center gap-3">
                <Play className="w-4 h-4 text-primary flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium truncate">{server.server_name}</span>
                    <Badge variant="outline" className={`${getTypeColor(server.server_type)} text-xs`}>
                      {server.server_type.toUpperCase()}
                    </Badge>
                    {server.is_working === false && (
                      <Badge variant="destructive" className="text-xs">Not Working</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{server.server_url}</p>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEditServer(server)}>
                    <Edit2 className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDeleteServer(server.id)}>
                    <Trash2 className="w-3.5 h-3.5 text-destructive" />
                  </Button>
                </div>
              </div>
            </div>
          ))
        )}
      </CardContent>

      {/* Server Dialog */}
      <Dialog open={serverDialogOpen} onOpenChange={setServerDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingServer ? 'Edit Server' : 'Add Server'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Server Name *</Label>
              <Input
                placeholder="e.g., Server 1, HD Stream"
                value={serverForm.server_name}
                onChange={(e) => setServerForm({ ...serverForm, server_name: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label>Server Type *</Label>
              <Select 
                value={serverForm.server_type} 
                onValueChange={(v: any) => setServerForm({ ...serverForm, server_type: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="m3u8">M3U8 (HLS Stream)</SelectItem>
                  <SelectItem value="iframe">iFrame Embed</SelectItem>
                  <SelectItem value="embed">Custom Embed</SelectItem>
                  <SelectItem value="iframe_to_m3u8">iFrame → M3U8 (Extract Stream)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Server URL *</Label>
              <Input
                placeholder="https://example.com/stream.m3u8"
                value={serverForm.server_url}
                onChange={(e) => setServerForm({ ...serverForm, server_url: e.target.value })}
              />
            </div>

            <div className="space-y-3 pt-4 border-t">
              <Label className="text-sm font-medium flex items-center gap-2">
                Request Headers
                <Badge variant="outline" className="text-xs font-normal">Optional</Badge>
              </Label>
              <HeaderEditor
                headers={formHeaders}
                onChange={setFormHeaders}
                compact
              />
            </div>

            <div className="flex items-center gap-3 pt-2">
              <Switch
                checked={serverForm.is_active}
                onCheckedChange={(checked) => setServerForm({ ...serverForm, is_active: checked })}
              />
              <Label>Active</Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setServerDialogOpen(false); resetServerForm(); }}>
              Cancel
            </Button>
            <Button variant="gradient" onClick={handleSaveServer}>
              {editingServer ? 'Update' : 'Add'} Server
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default ChannelsManager;
