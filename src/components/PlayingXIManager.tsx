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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Plus, Edit2, Trash2, Loader2, Upload, CloudDownload, X, ChevronDown } from "lucide-react";
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

interface PlayingXIManagerProps {
  matchId: string;
  teamA: Team;
  teamB: Team;
  cricbuzzMatchId?: string | null;
}

// Hooks for Playing XI management
export const usePlayingXI = (matchId: string | undefined) => {
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

export const useCreatePlayer = () => {
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

export const useBulkCreatePlayers = () => {
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

export const useUpdatePlayer = () => {
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

export const useDeletePlayer = () => {
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

const PLAYER_ROLES = [
  'Batsman',
  'Bowler',
  'All-rounder',
  'Wicket-keeper',
  'Opening Batsman',
  'Middle-order Batsman',
  'Fast Bowler',
  'Spin Bowler',
];

const PlayingXIManager = ({ matchId, teamA, teamB, cricbuzzMatchId }: PlayingXIManagerProps) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: players, isLoading } = usePlayingXI(matchId);
  const createPlayer = useCreatePlayer();
  const bulkCreatePlayers = useBulkCreatePlayers();
  const updatePlayer = useUpdatePlayer();
  const deletePlayer = useDeletePlayer();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [activeTeam, setActiveTeam] = useState<string>(teamA.id);
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);
  const [fetchingSquad, setFetchingSquad] = useState(false);
  const [clearingSquad, setClearingSquad] = useState(false);
  const [form, setForm] = useState({
    player_name: '',
    player_role: '',
    is_captain: false,
    is_vice_captain: false,
    is_wicket_keeper: false,
    batting_order: null as number | null,
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
      is_wicket_keeper: false,
      batting_order: null,
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
        is_wicket_keeper: player.is_wicket_keeper,
        batting_order: player.batting_order,
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
          is_wicket_keeper: form.is_wicket_keeper,
          batting_order: form.batting_order,
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
          is_wicket_keeper: form.is_wicket_keeper,
          batting_order: form.batting_order,
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

    const playersToAdd: Omit<Player, 'id'>[] = lines.map((name, index) => {
      // Parse player name with optional markers: (C), (VC), (WK)
      let playerName = name;
      let isCaptain = false;
      let isViceCaptain = false;
      let isWicketKeeper = false;

      if (name.includes('(C)') || name.includes('(c)')) {
        isCaptain = true;
        playerName = playerName.replace(/\(C\)/gi, '').trim();
      }
      if (name.includes('(VC)') || name.includes('(vc)')) {
        isViceCaptain = true;
        playerName = playerName.replace(/\(VC\)/gi, '').trim();
      }
      if (name.includes('(WK)') || name.includes('(wk)')) {
        isWicketKeeper = true;
        playerName = playerName.replace(/\(WK\)/gi, '').trim();
      }

      return {
        match_id: matchId,
        team_id: activeTeam,
        player_name: playerName,
        player_role: null,
        is_captain: isCaptain,
        is_vice_captain: isViceCaptain,
        is_wicket_keeper: isWicketKeeper,
        batting_order: currentTeamPlayers.length + index + 1,
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

  // Fetch squad from RapidAPI (Cricbuzz)
  const handleFetchSquad = async (source: 'cricbuzz' | 'espn' | 'scrape', forceRefresh = false) => {
    setFetchingSquad(true);

    try {
      // If force refresh, clear existing players first
      if (forceRefresh && players && players.length > 0) {
        const { error: deleteError } = await supabase
          .from('match_playing_xi')
          .delete()
          .eq('match_id', matchId);
        
        if (deleteError) {
          throw new Error('Failed to clear existing players');
        }
      }

      let functionName = 'sync-playing-xi';
      if (source === 'espn') {
        functionName = 'sync-espn-playing-xi';
      } else if (source === 'scrape') {
        functionName = 'scrape-playing-xi';
      }
      
      const response = await supabase.functions.invoke(functionName, {
        body: {
          matchId,
          cricbuzzMatchId,
          teamAId: teamA.id,
          teamBId: teamB.id,
          teamAName: teamA.name,
          teamAShortName: teamA.short_name,
          teamBName: teamB.name,
          teamBShortName: teamB.short_name,
        },
      });

      if (response.error) {
        throw new Error(response.error.message || 'Failed to sync playing XI');
      }

      const result = response.data;

      if (!result.success) {
        toast({ 
          title: result.alreadyExists ? "Already synced" : "Error", 
          description: result.error || result.message,
          variant: result.alreadyExists ? "default" : "destructive"
        });
        queryClient.invalidateQueries({ queryKey: ['playing_xi', matchId] });
        return;
      }

      // Refresh the query
      queryClient.invalidateQueries({ queryKey: ['playing_xi', matchId] });

      toast({ 
        title: "Squad synced!", 
        description: `${result.playersAdded || 0} players added from ${source === 'espn' ? 'ESPN Cricinfo' : source === 'scrape' ? 'Cricbuzz (Scrape)' : 'Cricbuzz'}`
      });

    } catch (err: any) {
      console.error('Fetch squad error:', err);
      toast({ title: "Error", description: err.message || 'Failed to fetch squad', variant: "destructive" });
    } finally {
      setFetchingSquad(false);
    }
  };

  // Clear all players from the squad
  const handleClearSquad = async () => {
    if (!players || players.length === 0) {
      toast({ title: "No players to clear", variant: "destructive" });
      return;
    }

    setClearingSquad(true);

    try {
      const { error } = await supabase
        .from('match_playing_xi')
        .delete()
        .eq('match_id', matchId);

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ['playing_xi', matchId] });
      toast({ title: "Squad cleared successfully" });
    } catch (err: any) {
      console.error('Clear squad error:', err);
      toast({ title: "Error", description: err.message || 'Failed to clear squad', variant: "destructive" });
    } finally {
      setClearingSquad(false);
    }
  };

  const renderPlayerCard = (player: Player) => (
    <Card key={player.id} className="hover:border-primary/30 transition-colors">
      <CardContent className="p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 flex-wrap">
            {player.batting_order && (
              <span className="text-xs text-muted-foreground font-mono w-5">
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
            {player.is_wicket_keeper && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0">WK</Badge>
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
      {/* Squad Action Buttons */}
      <div className="flex items-center justify-end gap-4 flex-wrap">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              disabled={fetchingSquad}
              className="gap-2"
            >
              {fetchingSquad ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <CloudDownload className="w-4 h-4" />
              )}
              {players && players.length > 0 ? 'Refresh Squad' : 'Fetch Squad'}
              <ChevronDown className="w-3 h-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="bg-background border">
            <DropdownMenuItem 
              onClick={() => handleFetchSquad('cricbuzz', players && players.length > 0)}
              disabled={fetchingSquad}
            >
              <CloudDownload className="w-4 h-4 mr-2" />
              From Cricbuzz
            </DropdownMenuItem>
            <DropdownMenuItem 
              onClick={() => handleFetchSquad('espn', players && players.length > 0)}
              disabled={fetchingSquad}
            >
              <CloudDownload className="w-4 h-4 mr-2" />
              From ESPN Cricinfo
            </DropdownMenuItem>
            <DropdownMenuItem 
              onClick={() => handleFetchSquad('scrape', players && players.length > 0)}
              disabled={fetchingSquad}
            >
              <CloudDownload className="w-4 h-4 mr-2" />
              Scrape from Cricbuzz
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {players && players.length > 0 && (
          <Button
            variant="destructive"
            size="sm"
            onClick={handleClearSquad}
            disabled={clearingSquad}
            className="gap-2"
          >
            {clearingSquad ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <X className="w-4 h-4" />
            )}
            Clear All
          </Button>
        )}
        {players && players.length > 0 && (
          <Button
            variant="destructive"
            size="sm"
            onClick={handleClearSquad}
            disabled={clearingSquad}
            className="gap-2"
          >
            {clearingSquad ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <X className="w-4 h-4" />
            )}
            Clear All
          </Button>
        )}
      </div>

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
                placeholder="e.g., Virat Kohli"
                value={form.player_name}
                onChange={(e) => setForm({ ...form, player_name: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Role</Label>
                <Select
                  value={form.player_role}
                  onValueChange={(v) => setForm({ ...form, player_role: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    {PLAYER_ROLES.map((role) => (
                      <SelectItem key={role} value={role}>
                        {role}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Batting Order</Label>
                <Input
                  type="number"
                  min="1"
                  max="11"
                  placeholder="1-11"
                  value={form.batting_order || ''}
                  onChange={(e) => setForm({ 
                    ...form, 
                    batting_order: e.target.value ? parseInt(e.target.value) : null 
                  })}
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 pt-2">
              <div className="flex items-center space-x-2">
                <Switch
                  id="is_captain"
                  checked={form.is_captain}
                  onCheckedChange={(checked) => setForm({ 
                    ...form, 
                    is_captain: checked,
                    is_vice_captain: checked ? false : form.is_vice_captain
                  })}
                />
                <Label htmlFor="is_captain" className="text-sm">Captain</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  id="is_vice_captain"
                  checked={form.is_vice_captain}
                  onCheckedChange={(checked) => setForm({ 
                    ...form, 
                    is_vice_captain: checked,
                    is_captain: checked ? false : form.is_captain
                  })}
                />
                <Label htmlFor="is_vice_captain" className="text-sm">Vice Captain</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  id="is_wk"
                  checked={form.is_wicket_keeper}
                  onCheckedChange={(checked) => setForm({ ...form, is_wicket_keeper: checked })}
                />
                <Label htmlFor="is_wk" className="text-sm">WK</Label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleSave} 
              disabled={createPlayer.isPending || updatePlayer.isPending}
            >
              {(createPlayer.isPending || updatePlayer.isPending) && (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              )}
              {editingPlayer ? 'Update' : 'Add'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Add Dialog */}
      <Dialog open={bulkDialogOpen} onOpenChange={setBulkDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              Bulk Add Players - {activeTeam === teamA.id ? teamA.name : teamB.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Player Names (one per line)</Label>
              <Textarea
                placeholder={`Virat Kohli (C)\nRohit Sharma (VC)\nRishabh Pant (WK)\nJasprit Bumrah\n...`}
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                rows={11}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Add (C) for captain, (VC) for vice-captain, (WK) for wicket-keeper
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleBulkAdd} 
              disabled={bulkCreatePlayers.isPending}
            >
              {bulkCreatePlayers.isPending && (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              )}
              Add Players
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PlayingXIManager;
