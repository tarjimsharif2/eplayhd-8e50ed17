import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, ArrowRightLeft } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Team } from "@/hooks/useSportsData";

interface Substitution {
  id: string;
  match_id: string;
  team_id: string;
  player_out: string;
  player_in: string;
  minute: string;
}

interface FootballSubstitutionManagerProps {
  matchId: string;
  teamA: Team;
  teamB: Team;
}

// Hook for fetching substitutions
const useSubstitutions = (matchId: string) => {
  return useQuery({
    queryKey: ['substitutions', matchId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('match_substitutions')
        .select('*')
        .eq('match_id', matchId)
        .order('minute', { ascending: true });
      
      if (error) throw error;
      return data as Substitution[];
    },
    enabled: !!matchId,
  });
};

// Hook for creating substitution
const useCreateSubstitution = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (sub: Omit<Substitution, 'id'>) => {
      const { data, error } = await supabase
        .from('match_substitutions')
        .insert(sub)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['substitutions', variables.match_id] });
    },
  });
};

// Hook for deleting substitution
const useDeleteSubstitution = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, match_id }: { id: string; match_id: string }) => {
      const { error } = await supabase
        .from('match_substitutions')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
      return { match_id };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['substitutions', data.match_id] });
    },
  });
};

const FootballSubstitutionManager = ({ matchId, teamA, teamB }: FootballSubstitutionManagerProps) => {
  const { toast } = useToast();
  const { data: substitutions, isLoading } = useSubstitutions(matchId);
  const createSubstitution = useCreateSubstitution();
  const deleteSubstitution = useDeleteSubstitution();
  
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<string>(teamA.id);
  const [playerOut, setPlayerOut] = useState("");
  const [playerIn, setPlayerIn] = useState("");
  const [minute, setMinute] = useState("");

  const teamASubs = substitutions?.filter(s => s.team_id === teamA.id) || [];
  const teamBSubs = substitutions?.filter(s => s.team_id === teamB.id) || [];

  const handleAddSubstitution = async () => {
    if (!playerOut.trim() || !playerIn.trim() || !minute.trim()) {
      toast({ title: "Error", description: "All fields are required", variant: "destructive" });
      return;
    }

    try {
      await createSubstitution.mutateAsync({
        match_id: matchId,
        team_id: selectedTeam,
        player_out: playerOut.trim(),
        player_in: playerIn.trim(),
        minute: minute.trim(),
      });

      toast({ title: "Substitution added", description: `${playerOut} → ${playerIn} (${minute}')` });
      
      // Reset form
      setPlayerOut("");
      setPlayerIn("");
      setMinute("");
      setIsDialogOpen(false);
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleDeleteSubstitution = async (id: string) => {
    try {
      await deleteSubstitution.mutateAsync({ id, match_id: matchId });
      toast({ title: "Substitution removed" });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const renderSubstitutionList = (subs: Substitution[], teamName: string) => (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium">{teamName}</Label>
        <Badge variant="secondary" className="text-xs">{subs.length} subs</Badge>
      </div>
      {subs.length === 0 ? (
        <p className="text-xs text-muted-foreground py-2">No substitutions</p>
      ) : (
        <div className="space-y-1.5">
          {subs.map((sub) => (
            <div key={sub.id} className="flex items-center justify-between gap-2 bg-muted/30 rounded-md px-2 py-1.5">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <Badge className="text-[10px] px-1.5 py-0 bg-primary/20 text-primary">{sub.minute}'</Badge>
                <span className="text-xs text-red-400 truncate">↓ {sub.player_out}</span>
                <ArrowRightLeft className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                <span className="text-xs text-green-400 truncate">↑ {sub.player_in}</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                onClick={() => handleDeleteSubstitution(sub.id)}
              >
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  if (isLoading) {
    return null;
  }

  return (
    <Card className="border-orange-500/20 bg-orange-500/5">
      <CardHeader className="py-3 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <ArrowRightLeft className="w-4 h-4 text-orange-500" />
            Substitutions
          </CardTitle>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 text-xs">
                <Plus className="w-3 h-3 mr-1" />
                Add Sub
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <ArrowRightLeft className="w-5 h-5 text-orange-500" />
                  Add Substitution
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                {/* Team Selection */}
                <div className="space-y-2">
                  <Label className="text-sm">Team</Label>
                  <Select value={selectedTeam} onValueChange={setSelectedTeam}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={teamA.id}>
                        <div className="flex items-center gap-2">
                          {teamA.logo_url && <img src={teamA.logo_url} className="w-4 h-4 object-contain" />}
                          {teamA.name}
                        </div>
                      </SelectItem>
                      <SelectItem value={teamB.id}>
                        <div className="flex items-center gap-2">
                          {teamB.logo_url && <img src={teamB.logo_url} className="w-4 h-4 object-contain" />}
                          {teamB.name}
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Player Out */}
                <div className="space-y-2">
                  <Label className="text-sm flex items-center gap-2">
                    <span className="text-red-400">↓</span> Player Out *
                  </Label>
                  <Input
                    value={playerOut}
                    onChange={(e) => setPlayerOut(e.target.value)}
                    placeholder="e.g., Ronaldo"
                  />
                </div>

                {/* Player In */}
                <div className="space-y-2">
                  <Label className="text-sm flex items-center gap-2">
                    <span className="text-green-400">↑</span> Player In *
                  </Label>
                  <Input
                    value={playerIn}
                    onChange={(e) => setPlayerIn(e.target.value)}
                    placeholder="e.g., Mbappe"
                  />
                </div>

                {/* Minute */}
                <div className="space-y-2">
                  <Label className="text-sm">Minute *</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      value={minute}
                      onChange={(e) => setMinute(e.target.value)}
                      placeholder="65"
                      className="w-24"
                    />
                    <span className="text-muted-foreground">'</span>
                  </div>
                </div>

                <Button 
                  onClick={handleAddSubstitution} 
                  className="w-full"
                  disabled={createSubstitution.isPending}
                >
                  {createSubstitution.isPending ? (
                    <span className="animate-spin mr-2">⏳</span>
                  ) : (
                    <Plus className="w-4 h-4 mr-2" />
                  )}
                  Add Substitution
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent className="py-3 px-4 space-y-4">
        {/* Team A Subs */}
        {renderSubstitutionList(teamASubs, teamA.short_name || teamA.name)}
        
        {/* Divider */}
        <div className="border-t border-border/30" />
        
        {/* Team B Subs */}
        {renderSubstitutionList(teamBSubs, teamB.short_name || teamB.name)}
      </CardContent>
    </Card>
  );
};

export default FootballSubstitutionManager;