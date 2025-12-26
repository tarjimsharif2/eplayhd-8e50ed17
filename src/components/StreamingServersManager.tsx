import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { 
  useAllStreamingServers, 
  useCreateStreamingServer, 
  useUpdateStreamingServer, 
  useDeleteStreamingServer,
  StreamingServer 
} from "@/hooks/useStreamingServers";
import { Match } from "@/hooks/useSportsData";
import { Plus, Edit2, Trash2, Tv, Loader2, ExternalLink, Play } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface StreamingServersManagerProps {
  match: Match;
  onClose: () => void;
}

const StreamingServersManager = ({ match, onClose }: StreamingServersManagerProps) => {
  const { toast } = useToast();
  const { data: servers, isLoading } = useAllStreamingServers(match.id);
  const createServer = useCreateStreamingServer();
  const updateServer = useUpdateStreamingServer();
  const deleteServer = useDeleteStreamingServer();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingServer, setEditingServer] = useState<StreamingServer | null>(null);
  const [serverForm, setServerForm] = useState({
    server_name: '',
    server_url: '',
    server_type: 'iframe' as 'iframe' | 'm3u8' | 'embed',
    display_order: 0,
    is_active: true,
    referer_value: '',
    origin_value: '',
    cookie_value: '',
    user_agent: '',
    drm_license_url: '',
    drm_scheme: 'none' as 'none' | 'widevine' | 'playready' | 'clearkey',
    player_type: 'hls' as 'hls' | 'clappr',
    ad_block_enabled: false,
  });

  const resetForm = () => {
    setEditingServer(null);
    setServerForm({
      server_name: '',
      server_url: '',
      server_type: 'iframe',
      display_order: 0,
      is_active: true,
      referer_value: '',
      origin_value: '',
      cookie_value: '',
      user_agent: '',
      drm_license_url: '',
      drm_scheme: 'none',
      player_type: 'hls',
      ad_block_enabled: false,
    });
  };

  const handleEdit = (server: StreamingServer) => {
    setEditingServer(server);
    setServerForm({
      server_name: server.server_name,
      server_url: server.server_url,
      server_type: server.server_type,
      display_order: server.display_order,
      is_active: server.is_active,
      referer_value: server.referer_value || '',
      origin_value: server.origin_value || '',
      cookie_value: server.cookie_value || '',
      user_agent: server.user_agent || '',
      drm_license_url: server.drm_license_url || '',
      drm_scheme: server.drm_scheme || 'none',
      player_type: server.player_type || 'hls',
      ad_block_enabled: server.ad_block_enabled || false,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!serverForm.server_name || !serverForm.server_url) {
      toast({ title: "Error", description: "Server name and URL are required", variant: "destructive" });
      return;
    }

    // Validate URL protocol
    if (!serverForm.server_url.startsWith('http://') && !serverForm.server_url.startsWith('https://')) {
      toast({ title: "Error", description: "URL must start with http:// or https://", variant: "destructive" });
      return;
    }

    // Prepare data with null for empty strings
    const serverData = {
      server_name: serverForm.server_name,
      server_url: serverForm.server_url,
      server_type: serverForm.server_type,
      display_order: serverForm.display_order,
      is_active: serverForm.is_active,
      referer_value: serverForm.referer_value || null,
      origin_value: serverForm.origin_value || null,
      cookie_value: serverForm.cookie_value || null,
      user_agent: serverForm.user_agent || null,
      drm_license_url: serverForm.drm_license_url || null,
      drm_scheme: serverForm.drm_scheme === 'none' ? null : serverForm.drm_scheme,
      player_type: serverForm.server_type === 'm3u8' ? serverForm.player_type : null,
      ad_block_enabled: serverForm.ad_block_enabled,
    };

    try {
      if (editingServer) {
        await updateServer.mutateAsync({ id: editingServer.id, ...serverData });
        toast({ title: "Server updated successfully" });
      } else {
        await createServer.mutateAsync({ 
          match_id: match.id, 
          ...serverData 
        });
        toast({ title: "Server added successfully" });
      }
      setDialogOpen(false);
      resetForm();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleDelete = async (id: string) => {
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
      default: return 'bg-muted text-muted-foreground';
    }
  };

  // Get team names from match
  const matchTitle = `${match.team_a?.name || 'Team A'} vs ${match.team_b?.name || 'Team B'}`;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Tv className="w-5 h-5 text-primary" />
            Streaming Servers
          </h3>
          <p className="text-sm text-muted-foreground">{matchTitle}</p>
        </div>
        <Button variant="gradient" size="sm" onClick={() => setDialogOpen(true)}>
          <Plus className="w-4 h-4 mr-1" />
          Add Server
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : servers?.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-8 text-center">
            <Tv className="w-12 h-12 text-muted-foreground/50 mb-3" />
            <p className="text-muted-foreground">No streaming servers configured</p>
            <p className="text-sm text-muted-foreground/70">Add M3U8 or iframe links for this match</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {servers?.map((server) => (
            <Card key={server.id} className={`${!server.is_active ? 'opacity-60' : ''}`}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Play className="w-4 h-4 text-primary" />
                      <span className="font-medium">{server.server_name}</span>
                      <Badge variant="outline" className={getTypeColor(server.server_type)}>
                        {server.server_type.toUpperCase()}
                      </Badge>
                      {!server.is_active && (
                        <Badge variant="secondary">Inactive</Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground truncate">{server.server_url}</p>
                    <p className="text-xs text-muted-foreground">Order: {server.display_order}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => window.open(server.server_url, '_blank')}
                      title="Preview URL"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleEdit(server)}
                    >
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(server.id)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add/Edit Server Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => {
        setDialogOpen(open);
        if (!open) resetForm();
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingServer ? 'Edit Server' : 'Add Streaming Server'}</DialogTitle>
            <DialogDescription>
              Add an M3U8 stream URL or iframe embed link
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Server Name *</Label>
              <Input
                placeholder="e.g., Server 1, HD Stream, Backup"
                value={serverForm.server_name}
                onChange={(e) => setServerForm({ ...serverForm, server_name: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label>Server Type *</Label>
              <Select 
                value={serverForm.server_type} 
                onValueChange={(v: 'iframe' | 'm3u8' | 'embed') => setServerForm({ ...serverForm, server_type: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="m3u8">M3U8 (HLS Stream)</SelectItem>
                  <SelectItem value="iframe">iFrame Embed</SelectItem>
                  <SelectItem value="embed">Custom Embed</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {serverForm.server_type === 'm3u8' 
                  ? 'Direct .m3u8 stream URL for HLS player' 
                  : serverForm.server_type === 'iframe'
                  ? 'Full iframe URL to embed'
                  : 'Custom embed code URL'}
              </p>
            </div>

            <div className="space-y-2">
              <Label>Server URL *</Label>
              <Input
                placeholder={serverForm.server_type === 'm3u8' 
                  ? 'https://example.com/stream.m3u8' 
                  : 'https://example.com/embed/player'}
                value={serverForm.server_url}
                onChange={(e) => setServerForm({ ...serverForm, server_url: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label>Display Order</Label>
              <Input
                type="number"
                placeholder="0"
                value={serverForm.display_order}
                onChange={(e) => setServerForm({ ...serverForm, display_order: parseInt(e.target.value) || 0 })}
              />
              <p className="text-xs text-muted-foreground">Lower numbers appear first</p>
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3 shadow-sm">
              <div className="space-y-0.5">
                <Label>Active</Label>
                <p className="text-xs text-muted-foreground">Show this server to users</p>
              </div>
              <Switch
                checked={serverForm.is_active}
                onCheckedChange={(checked) => setServerForm({ ...serverForm, is_active: checked })}
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3 shadow-sm">
              <div className="space-y-0.5">
                <Label>Ad Blocker</Label>
                <p className="text-xs text-muted-foreground">Block pop-up ads and overlays in this player</p>
              </div>
              <Switch
                checked={serverForm.ad_block_enabled}
                onCheckedChange={(checked) => setServerForm({ ...serverForm, ad_block_enabled: checked })}
              />
            </div>

            {/* M3U8 Stream Settings - Only show for m3u8 type */}
            {serverForm.server_type === 'm3u8' && (
              <div className="space-y-4 pt-4 border-t">
                <div className="space-y-2">
                  <Label>Player Type</Label>
                  <Select 
                    value={serverForm.player_type} 
                    onValueChange={(v: 'hls' | 'clappr') => setServerForm({ ...serverForm, player_type: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hls">HLS.js (Default)</SelectItem>
                      <SelectItem value="clappr">Clappr Player</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Choose the player for M3U8 playback
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <Label className="text-sm font-medium">Stream Headers (Optional)</Label>
                </div>

                <div className="space-y-2">
                  <Label>Referer Value</Label>
                  <Input
                    placeholder="https://example.com"
                    value={serverForm.referer_value}
                    onChange={(e) => setServerForm({ ...serverForm, referer_value: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Origin Value</Label>
                  <Input
                    placeholder="https://example.com"
                    value={serverForm.origin_value}
                    onChange={(e) => setServerForm({ ...serverForm, origin_value: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Cookie Value</Label>
                  <Input
                    placeholder="session=abc123; token=xyz"
                    value={serverForm.cookie_value}
                    onChange={(e) => setServerForm({ ...serverForm, cookie_value: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label>User Agent</Label>
                  <Input
                    placeholder="Mozilla/5.0..."
                    value={serverForm.user_agent}
                    onChange={(e) => setServerForm({ ...serverForm, user_agent: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">Leave empty to use default browser agent</p>
                </div>

                {/* DRM Settings */}
                <div className="space-y-4 pt-4 border-t">
                  <div className="flex items-center gap-2">
                    <Label className="text-sm font-medium">DRM Protection (Optional)</Label>
                  </div>

                  <div className="space-y-2">
                    <Label>DRM Scheme</Label>
                    <Select 
                      value={serverForm.drm_scheme} 
                      onValueChange={(v: 'none' | 'widevine' | 'playready' | 'clearkey') => setServerForm({ ...serverForm, drm_scheme: v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="No DRM" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No DRM</SelectItem>
                        <SelectItem value="widevine">Widevine (Chrome, Firefox, Android)</SelectItem>
                        <SelectItem value="playready">PlayReady (Edge, IE, Xbox)</SelectItem>
                        <SelectItem value="clearkey">ClearKey (Basic)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {serverForm.drm_scheme && serverForm.drm_scheme !== 'none' && (
                    <div className="space-y-2">
                      <Label>DRM License URL *</Label>
                      <Input
                        placeholder="https://license.example.com/widevine"
                        value={serverForm.drm_license_url}
                        onChange={(e) => setServerForm({ ...serverForm, drm_license_url: e.target.value })}
                      />
                      <p className="text-xs text-muted-foreground">
                        License server URL for {serverForm.drm_scheme.charAt(0).toUpperCase() + serverForm.drm_scheme.slice(1)} DRM
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Iframe Referrer - Only show for iframe type */}
            {serverForm.server_type === 'iframe' && (
              <div className="space-y-4 pt-4 border-t">
                <div className="flex items-center gap-2">
                  <Label className="text-sm font-medium">Iframe Settings (Optional)</Label>
                </div>

                <div className="space-y-2">
                  <Label>Referrer Policy URL</Label>
                  <Input
                    placeholder="https://example.com"
                    value={serverForm.referer_value}
                    onChange={(e) => setServerForm({ ...serverForm, referer_value: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">
                    Set the referrer for the iframe (uses referrerpolicy attribute)
                  </p>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setDialogOpen(false);
              resetForm();
            }}>
              Cancel
            </Button>
            <Button 
              variant="gradient" 
              onClick={handleSave}
              disabled={createServer.isPending || updateServer.isPending}
            >
              {(createServer.isPending || updateServer.isPending) && (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              )}
              {editingServer ? 'Update' : 'Add Server'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default StreamingServersManager;
