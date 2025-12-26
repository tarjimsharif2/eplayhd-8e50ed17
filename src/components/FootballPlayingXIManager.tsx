import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Edit2, Trash2, Loader2, Upload } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Team } from "@/hooks/useSportsData";
import { useToast } from "@/hooks/use-toast";

interface Player {
  id: string;
  match_id: string;
  team_id: string;
  player_name: string;
  player_role: string | null;
  is_captain: boolean;
  is_vice_captain: boolean;
  is_wicket_keeper: boolean;
  batting_order: number | null;
}

interface FootballPlayingXIManagerProps {
  matchId: string;
  teamA: Team;
  teamB: Team;
}

// Hooks for Playing XI management
const usePlayingXI = (matchId: string | undefined) => {
  return useQuery({
    queryKey: ['playing_xi', matchId],
    queryFn: async () => {
      if (!matchId) return [];
      
      const { data, error } = await supabase
        .from('match_playing_xi')
        .select('*')
        .eq('match_id', matchId)
        .order('batting_order', { ascending: true, nullsFirst: false });
      
      if (error) throw error;
      return data as Player[];
    },
    enabled: !!matchId,
  });
};

const useCreatePlayer = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (player: Omit<Player, 'id'>) => {
      const { data, error } = await supabase
        .from('match_playing_xi')
        .insert(player)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['playing_xi', variables.match_id] });
    },
  });
};

const useBulkCreatePlayers = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (players: Omit<Player, 'id'>[]) => {
      if (players.length === 0) return [];
      
      const { data, error } = await supabase
        .from('match_playing_xi')
        .insert(players)
        .select();
      
      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      if (variables.length > 0) {
        queryClient.invalidateQueries({ queryKey: ['playing_xi', variables[0].match_id] });
      }
    },
  });
};

const useUpdatePlayer = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, match_id, ...player }: Partial<Player> & { id: string; match_id: string }) => {
      const { data, error } = await supabase
        .from('match_playing_xi')
        .update(player)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return { ...data, match_id };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['playing_xi', data.match_id] });
    },
  });
};

const useDeletePlayer = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, match_id }: { id: string; match_id: string }) => {
      const { error } = await supabase
        .from('match_playing_xi')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
      return { match_id };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['playing_xi', data.match_id] });
    },
  });
};

// Football-specific positions
const FOOTBALL_POSITIONS = [
  'Goalkeeper',
  'Right Back',
  'Left Back',
  'Center Back',
  'Defensive Midfielder',
  'Central Midfielder',
  'Attacking Midfielder',
  'Right Winger',
  'Left Winger',
  'Striker',
  'Forward',
];

const FootballPlayingXIManager = ({ matchId, teamA, teamB }: FootballPlayingXIManagerProps) => {
  const { toast } = useToast();
  const { data: players, isLoading } = usePlayingXI(matchId);
  const createPlayer = useCreatePlayer();
  const bulkCreatePlayers = useBulkCreatePlayers();
  const updatePlayer = useUpdatePlayer();
  const deletePlayer = useDeletePlayer();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [activeTeam, setActiveTeam] = useState<string>(teamA.id);
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);
  const [form, setForm] = useState({
    player_name: '',
    player_role: '',
    is_captain: false,
    is_vice_captain: false,
    jersey_number: null as number | null,
  });
  const [bulkText, setBulkText] = useState('');

  const teamAPlayers = players?.filter(p => p.team_id === teamA.id) || [];
  const teamBPlayers = players?.filter(p => p.team_id === teamB.id) || [];

  const resetForm = () => {
    setEditingPlayer(null);
    setForm({
      player_name: '',
      player_role: '',
      is_captain: false,
      is_vice_captain: false,
      jersey_number: null,
    });
  };

  const handleOpenDialog = (player?: Player) => {
    if (player) {
      setEditingPlayer(player);
      setActiveTeam(player.team_id);
      setForm({
        player_name: player.player_name,
        player_role: player.player_role || '',
        is_captain: player.is_captain,
        is_vice_captain: player.is_vice_captain,
        jersey_number: player.batting_order,
      });
    } else {
      resetForm();
    }
    setDialogOpen(true);
  };

  const handleOpenBulkDialog = (teamId: string) => {
    setActiveTeam(teamId);
    setBulkText('');
    setBulkDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.player_name.trim()) {
      toast({ title: "Error", description: "Player name is required", variant: "destructive" });
      return;
    }

    try {
      if (editingPlayer) {
        await updatePlayer.mutateAsync({
          id: editingPlayer.id,
          match_id: matchId,
          player_name: form.player_name.trim(),
          player_role: form.player_role || null,
          is_captain: form.is_captain,
          is_vice_captain: form.is_vice_captain,
          is_wicket_keeper: false,
          batting_order: form.jersey_number,
        });
        toast({ title: "Player updated successfully" });
      } else {
        await createPlayer.mutateAsync({
          match_id: matchId,
          team_id: activeTeam,
          player_name: form.player_name.trim(),
          player_role: form.player_role || null,
          is_captain: form.is_captain,
          is_vice_captain: form.is_vice_captain,
          is_wicket_keeper: false,
          batting_order: form.jersey_number,
        });
        toast({ title: "Player added successfully" });
      }
      setDialogOpen(false);
      resetForm();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleBulkAdd = async () => {
    const lines = bulkText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    
    if (lines.length === 0) {
      toast({ title: "Error", description: "Please enter at least one player name", variant: "destructive" });
      return;
    }

    const currentTeamPlayers = activeTeam === teamA.id ? teamAPlayers : teamBPlayers;
    const availableSlots = 11 - currentTeamPlayers.length;

    if (lines.length > availableSlots) {
      toast({ 
        title: "Error", 
        description: `Only ${availableSlots} slots available. You entered ${lines.length} players.`, 
        variant: "destructive" 
      });
      return;
    }

    const playersToAdd: Omit<Player, 'id'>[] = lines.map((name) => {
      // Parse player name with optional markers: (C), (VC), and jersey number
      let playerName = name;
      let isCaptain = false;
      let isViceCaptain = false;
      let jerseyNumber: number | null = null;

      // Check for captain
      if (name.includes('(C)') || name.includes('(c)')) {
        isCaptain = true;
        playerName = playerName.replace(/\(C\)/gi, '').trim();
      }
      // Check for vice captain
      if (name.includes('(VC)') || name.includes('(vc)')) {
        isViceCaptain = true;
        playerName = playerName.replace(/\(VC\)/gi, '').trim();
      }
      
      // Extract jersey number if present (e.g., "10 - Messi" or "Messi #10")
      const jerseyMatch = playerName.match(/^(\d+)\s*[-–]\s*(.+)$/) || playerName.match(/(.+)\s*#(\d+)$/);
      if (jerseyMatch) {
        if (jerseyMatch[1].match(/^\d+$/)) {
          jerseyNumber = parseInt(jerseyMatch[1]);
          playerName = jerseyMatch[2].trim();
        } else {
          jerseyNumber = parseInt(jerseyMatch[2]);
          playerName = jerseyMatch[1].trim();
        }
      }

      return {
        match_id: matchId,
        team_id: activeTeam,
        player_name: playerName,
        player_role: null,
        is_captain: isCaptain,
        is_vice_captain: isViceCaptain,
        is_wicket_keeper: false,
        batting_order: jerseyNumber,
      };
    });

    try {
      await bulkCreatePlayers.mutateAsync(playersToAdd);
      toast({ title: `${playersToAdd.length} players added successfully` });
      setBulkDialogOpen(false);
      setBulkText('');
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleDelete = async (player: Player) => {
    try {
      await deletePlayer.mutateAsync({ id: player.id, match_id: matchId });
      toast({ title: "Player removed successfully" });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const renderPlayerCard = (player: Player) => (
    <Card key={player.id} className="hover:border-primary/30 transition-colors">
      <CardContent className="p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 flex-wrap">
            {player.batting_order && (
              <span className="text-xs font-bold bg-primary/20 text-primary px-2 py-0.5 rounded">
                #{player.batting_order}
              </span>
            )}
            <span className="font-medium text-sm">{player.player_name}</span>
            {player.is_captain && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-primary/10">C</Badge>
            )}
            {player.is_vice_captain && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0">VC</Badge>
            )}
            {player.player_role && (
              <span className="text-xs text-muted-foreground">• {player.player_role}</span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={() => handleOpenDialog(player)}
            >
              <Edit2 className="w-3 h-3" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-destructive hover:text-destructive"
              onClick={() => handleDelete(player)}
            >
              <Trash2 className="w-3 h-3" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  const renderTeamSection = (team: Team, teamPlayers: Player[]) => (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          {team.logo_url && (
            <img src={team.logo_url} alt={team.name} className="w-6 h-6 object-contain" />
          )}
          <h4 className="font-medium text-sm">{team.name}</h4>
          <Badge variant="secondary" className="text-[10px]">
            {teamPlayers.length}/11
          </Badge>
        </div>
        {teamPlayers.length < 11 && (
          <div className="flex gap-2">
            <Button 
              size="sm" 
              variant="outline" 
              onClick={() => {
                setActiveTeam(team.id);
                handleOpenDialog();
              }}
            >
              <Plus className="w-3 h-3 mr-1" />
              Add
            </Button>
            <Button 
              size="sm" 
              variant="secondary" 
              onClick={() => handleOpenBulkDialog(team.id)}
            >
              <Upload className="w-3 h-3 mr-1" />
              Bulk Add
            </Button>
          </div>
        )}
      </div>
      {teamPlayers.length > 0 ? (
        <div className="space-y-2">
          {teamPlayers.map(renderPlayerCard)}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground text-center py-4 border border-dashed rounded-lg">
          No players added yet
        </p>
      )}
    </div>
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Tabs defaultValue={teamA.id} className="w-full">
        <TabsList className="w-full">
          <TabsTrigger value={teamA.id} className="flex-1 gap-2">
            {teamA.logo_url && <img src={teamA.logo_url} alt="" className="w-4 h-4 object-contain" />}
            {teamA.short_name || teamA.name}
            <Badge variant="secondary" className="text-[10px]">{teamAPlayers.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value={teamB.id} className="flex-1 gap-2">
            {teamB.logo_url && <img src={teamB.logo_url} alt="" className="w-4 h-4 object-contain" />}
            {teamB.short_name || teamB.name}
            <Badge variant="secondary" className="text-[10px]">{teamBPlayers.length}</Badge>
          </TabsTrigger>
        </TabsList>
        <TabsContent value={teamA.id} className="mt-4">
          {renderTeamSection(teamA, teamAPlayers)}
        </TabsContent>
        <TabsContent value={teamB.id} className="mt-4">
          {renderTeamSection(teamB, teamBPlayers)}
        </TabsContent>
      </Tabs>

      {/* Add/Edit Player Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingPlayer ? 'Edit Player' : 'Add Player'} - {activeTeam === teamA.id ? teamA.name : teamB.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Player Name *</Label>
              <Input
                placeholder="e.g., Lionel Messi"
                value={form.player_name}
                onChange={(e) => setForm({ ...form, player_name: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Position</Label>
                <Select
                  value={form.player_role}
                  onValueChange={(v) => setForm({ ...form, player_role: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select position" />
                  </SelectTrigger>
                  <SelectContent>
                    {FOOTBALL_POSITIONS.map((pos) => (
                      <SelectItem key={pos} value={pos}>
                        {pos}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Jersey Number</Label>
                <Input
                  type="number"
                  min="1"
                  max="99"
                  placeholder="1-99"
                  value={form.jersey_number || ''}
                  onChange={(e) => setForm({ 
                    ...form, 
                    jersey_number: e.target.value ? parseInt(e.target.value) : null 
                  })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-2">
              <div className="flex items-center justify-between rounded-lg border p-3">
                <Label className="text-sm">Captain</Label>
                <Switch
                  checked={form.is_captain}
                  onCheckedChange={(checked) => setForm({ ...form, is_captain: checked })}
                />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <Label className="text-sm">Vice Captain</Label>
                <Switch
                  checked={form.is_vice_captain}
                  onCheckedChange={(checked) => setForm({ ...form, is_vice_captain: checked })}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button 
              variant="gradient" 
              onClick={handleSave}
              disabled={createPlayer.isPending || updatePlayer.isPending}
            >
              {(createPlayer.isPending || updatePlayer.isPending) && (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              )}
              {editingPlayer ? 'Update' : 'Add Player'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Add Dialog */}
      <Dialog open={bulkDialogOpen} onOpenChange={setBulkDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Bulk Add Players - {activeTeam === teamA.id ? teamA.name : teamB.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Player Names (one per line)</Label>
              <Textarea
                placeholder={`e.g.,
1 - Alisson
2 - Van Dijk (C)
10 - Salah
11 - Firmino`}
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                rows={10}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Format: "Jersey# - Name" or "Name #Jersey". Use (C) for Captain, (VC) for Vice Captain
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkDialogOpen(false)}>Cancel</Button>
            <Button 
              variant="gradient" 
              onClick={handleBulkAdd}
              disabled={bulkCreatePlayers.isPending}
            >
              {bulkCreatePlayers.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Add Players
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default FootballPlayingXIManager;
