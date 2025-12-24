import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Edit2, Trash2, Loader2 } from "lucide-react";
import { useMatchInnings, useCreateInnings, useUpdateInnings, useDeleteInnings, Innings, Team } from "@/hooks/useSportsData";
import { useToast } from "@/hooks/use-toast";

interface InningsManagerProps {
  matchId: string;
  teamA: Team;
  teamB: Team;
  matchFormat?: string | null;
}

const InningsManager = ({ matchId, teamA, teamB, matchFormat }: InningsManagerProps) => {
  const { toast } = useToast();
  const { data: innings, isLoading } = useMatchInnings(matchId);
  const createInnings = useCreateInnings();
  const updateInnings = useUpdateInnings();
  const deleteInnings = useDeleteInnings();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingInnings, setEditingInnings] = useState<Innings | null>(null);
  const [form, setForm] = useState({
    innings_number: 1,
    batting_team_id: '',
    runs: 0,
    wickets: 0,
    overs: 0,
    declared: false,
    is_current: false,
    extras: 0,
  });

  // Determine max innings based on format
  const getMaxInnings = () => {
    if (!matchFormat) return 4;
    const format = matchFormat.toLowerCase();
    if (format === 'test') return 4;
    return 2; // ODI, T20, T10, The Hundred
  };

  const maxInnings = getMaxInnings();
  const usedInningsNumbers = innings?.map(i => i.innings_number) || [];
  const availableInningsNumbers = Array.from({ length: maxInnings }, (_, i) => i + 1)
    .filter(n => !usedInningsNumbers.includes(n) || editingInnings?.innings_number === n);

  const resetForm = () => {
    setEditingInnings(null);
    setForm({
      innings_number: availableInningsNumbers[0] || 1,
      batting_team_id: teamA.id,
      runs: 0,
      wickets: 0,
      overs: 0,
      declared: false,
      is_current: false,
      extras: 0,
    });
  };

  const handleOpenDialog = (inningsData?: Innings) => {
    if (inningsData) {
      setEditingInnings(inningsData);
      setForm({
        innings_number: inningsData.innings_number,
        batting_team_id: inningsData.batting_team_id,
        runs: inningsData.runs,
        wickets: inningsData.wickets,
        overs: inningsData.overs,
        declared: inningsData.declared,
        is_current: inningsData.is_current,
        extras: inningsData.extras,
      });
    } else {
      resetForm();
    }
    setDialogOpen(true);
  };

  const handleSave = async () => {
    try {
      if (editingInnings) {
        await updateInnings.mutateAsync({
          id: editingInnings.id,
          match_id: matchId,
          ...form,
        });
        toast({ title: "Innings updated successfully" });
      } else {
        await createInnings.mutateAsync({
          match_id: matchId,
          ...form,
        });
        toast({ title: "Innings added successfully" });
      }
      setDialogOpen(false);
      resetForm();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteInnings.mutateAsync({ id, match_id: matchId });
      toast({ title: "Innings deleted successfully" });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const getOrdinal = (n: number) => {
    const suffixes = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0]);
  };

  const formatScore = (inningsData: Innings) => {
    const wicketDisplay = inningsData.wickets === 10 ? '' : `/${inningsData.wickets}`;
    const declaredTag = inningsData.declared ? 'd' : '';
    return `${inningsData.runs}${wicketDisplay}${declaredTag}`;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-4">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="font-medium text-sm">Innings Scorecard</h4>
        {(innings?.length || 0) < maxInnings && (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" onClick={() => handleOpenDialog()}>
                <Plus className="w-4 h-4 mr-1" />
                Add Innings
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingInnings ? 'Edit' : 'Add'} Innings</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Innings Number</Label>
                    <Select
                      value={form.innings_number.toString()}
                      onValueChange={(v) => setForm({ ...form, innings_number: parseInt(v) })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {availableInningsNumbers.map((n) => (
                          <SelectItem key={n} value={n.toString()}>
                            {getOrdinal(n)} Innings
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Batting Team</Label>
                    <Select
                      value={form.batting_team_id}
                      onValueChange={(v) => setForm({ ...form, batting_team_id: v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select team" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={teamA.id}>{teamA.name}</SelectItem>
                        <SelectItem value={teamB.id}>{teamB.name}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Runs</Label>
                    <Input
                      type="number"
                      min="0"
                      value={form.runs}
                      onChange={(e) => setForm({ ...form, runs: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Wickets</Label>
                    <Input
                      type="number"
                      min="0"
                      max="10"
                      value={form.wickets}
                      onChange={(e) => setForm({ ...form, wickets: Math.min(10, parseInt(e.target.value) || 0) })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Overs</Label>
                    <Input
                      type="number"
                      step="0.1"
                      min="0"
                      value={form.overs}
                      onChange={(e) => setForm({ ...form, overs: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Extras</Label>
                  <Input
                    type="number"
                    min="0"
                    value={form.extras}
                    onChange={(e) => setForm({ ...form, extras: parseInt(e.target.value) || 0 })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="declared"
                      checked={form.declared}
                      onCheckedChange={(checked) => setForm({ ...form, declared: checked })}
                    />
                    <Label htmlFor="declared">Declared</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="is_current"
                      checked={form.is_current}
                      onCheckedChange={(checked) => setForm({ ...form, is_current: checked })}
                    />
                    <Label htmlFor="is_current">Current Innings</Label>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSave} disabled={createInnings.isPending || updateInnings.isPending}>
                  {(createInnings.isPending || updateInnings.isPending) && (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  )}
                  {editingInnings ? 'Update' : 'Add'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {innings && innings.length > 0 ? (
        <div className="space-y-2">
          {innings.map((inningsData) => (
            <Card key={inningsData.id} className={`${inningsData.is_current ? 'border-primary/50 bg-primary/5' : ''}`}>
              <CardContent className="p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className="text-xs">
                      {getOrdinal(inningsData.innings_number)} Inn
                    </Badge>
                    <div className="flex items-center gap-2">
                      {inningsData.batting_team?.logo_url && (
                        <img
                          src={inningsData.batting_team.logo_url}
                          alt={inningsData.batting_team.name}
                          className="w-5 h-5 object-contain"
                        />
                      )}
                      <span className="font-medium text-sm">
                        {inningsData.batting_team?.short_name || inningsData.batting_team?.name}
                      </span>
                    </div>
                    <span className="font-bold text-lg text-primary">
                      {formatScore(inningsData)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      ({inningsData.overs} ov)
                    </span>
                    {inningsData.is_current && (
                      <Badge className="bg-green-500/20 text-green-600 border-green-500/30 text-[10px]">
                        BATTING
                      </Badge>
                    )}
                    {inningsData.declared && (
                      <Badge variant="secondary" className="text-[10px]">
                        DECLARED
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => handleOpenDialog(inningsData)}
                    >
                      <Edit2 className="w-3 h-3" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => handleDelete(inningsData.id)}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground text-center py-4">
          No innings data yet. Add innings to track the scorecard.
        </p>
      )}
    </div>
  );
};

export default InningsManager;