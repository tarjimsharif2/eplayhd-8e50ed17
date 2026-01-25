import { useState } from "react";
import { Match, GoalEvent, useUpdateMatch, Team } from "@/hooks/useSportsData";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Goal, Save } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface FootballGoalManagerProps {
  match: Match;
  teamA: Team;
  teamB: Team;
}

const FootballGoalManager = ({ match, teamA, teamB }: FootballGoalManagerProps) => {
  const { toast } = useToast();
  const updateMatch = useUpdateMatch();
  
  // Parse existing goals
  const parseGoals = (goals: unknown): GoalEvent[] => {
    if (Array.isArray(goals)) return goals as GoalEvent[];
    return [];
  };
  
  const [goalsA, setGoalsA] = useState<GoalEvent[]>(parseGoals(match.goals_team_a));
  const [goalsB, setGoalsB] = useState<GoalEvent[]>(parseGoals(match.goals_team_b));
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  // New goal form state
  const [selectedTeam, setSelectedTeam] = useState<'a' | 'b'>('a');
  const [playerName, setPlayerName] = useState("");
  const [minute, setMinute] = useState("");
  const [assist, setAssist] = useState("");
  const [goalType, setGoalType] = useState<'goal' | 'penalty' | 'own_goal'>('goal');

  const handleAddGoal = () => {
    if (!playerName.trim() || !minute.trim()) {
      toast({ title: "Error", description: "Player name and minute are required", variant: "destructive" });
      return;
    }

    const newGoal: GoalEvent = {
      player: playerName.trim(),
      minute: minute.trim() + "'",
      assist: assist.trim() || undefined,
      type: goalType,
    };

    if (selectedTeam === 'a') {
      setGoalsA([...goalsA, newGoal]);
    } else {
      setGoalsB([...goalsB, newGoal]);
    }

    // Reset form
    setPlayerName("");
    setMinute("");
    setAssist("");
    setGoalType('goal');
    setIsDialogOpen(false);
    
    toast({ title: "Goal added", description: `${newGoal.player} ${newGoal.minute}` });
  };

  const handleRemoveGoal = (team: 'a' | 'b', index: number) => {
    if (team === 'a') {
      setGoalsA(goalsA.filter((_, i) => i !== index));
    } else {
      setGoalsB(goalsB.filter((_, i) => i !== index));
    }
    toast({ title: "Goal removed" });
  };

  const handleSaveGoals = async () => {
    setIsSaving(true);
    try {
      // Calculate scores from goals
      const scoreA = goalsA.filter(g => g.type !== 'own_goal').length + goalsB.filter(g => g.type === 'own_goal').length;
      const scoreB = goalsB.filter(g => g.type !== 'own_goal').length + goalsA.filter(g => g.type === 'own_goal').length;
      
      await updateMatch.mutateAsync({
        id: match.id,
        goals_team_a: goalsA,
        goals_team_b: goalsB,
        score_a: scoreA.toString(),
        score_b: scoreB.toString(),
      });
      toast({ title: "Goals saved successfully" });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const renderGoalBadge = (goal: GoalEvent) => {
    if (goal.type === 'penalty') {
      return <Badge variant="outline" className="text-[10px] bg-yellow-500/10 text-yellow-600 border-yellow-500/30">P</Badge>;
    }
    if (goal.type === 'own_goal') {
      return <Badge variant="outline" className="text-[10px] bg-red-500/10 text-red-600 border-red-500/30">OG</Badge>;
    }
    return null;
  };

  const renderGoalList = (goals: GoalEvent[], team: 'a' | 'b', teamName: string) => (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium">{teamName}</Label>
        <Badge variant="secondary" className="text-xs">{goals.length} goals</Badge>
      </div>
      {goals.length === 0 ? (
        <p className="text-xs text-muted-foreground py-2">No goals</p>
      ) : (
        <div className="space-y-1.5">
          {goals.map((goal, index) => (
            <div key={index} className="flex items-center justify-between gap-2 bg-muted/30 rounded-md px-2 py-1.5">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <Goal className="w-3 h-3 text-green-500 flex-shrink-0" />
                <span className="text-xs font-medium truncate">{goal.player}</span>
                <span className="text-xs text-primary">{goal.minute}</span>
                {renderGoalBadge(goal)}
                {goal.assist && (
                  <span className="text-[10px] text-muted-foreground truncate">({goal.assist})</span>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                onClick={() => handleRemoveGoal(team, index)}
              >
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <Card className="border-green-500/20 bg-green-500/5">
      <CardHeader className="py-3 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Goal className="w-4 h-4 text-green-500" />
            Goal Scorers
          </CardTitle>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 text-xs">
                <Plus className="w-3 h-3 mr-1" />
                Add Goal
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Goal className="w-5 h-5 text-green-500" />
                  Add Goal
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                {/* Team Selection */}
                <div className="space-y-2">
                  <Label className="text-sm">Team</Label>
                  <Select value={selectedTeam} onValueChange={(v) => setSelectedTeam(v as 'a' | 'b')}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="a">
                        <div className="flex items-center gap-2">
                          {teamA.logo_url && <img src={teamA.logo_url} className="w-4 h-4 object-contain" />}
                          {teamA.name}
                        </div>
                      </SelectItem>
                      <SelectItem value="b">
                        <div className="flex items-center gap-2">
                          {teamB.logo_url && <img src={teamB.logo_url} className="w-4 h-4 object-contain" />}
                          {teamB.name}
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Player Name */}
                <div className="space-y-2">
                  <Label className="text-sm">Player Name *</Label>
                  <Input
                    value={playerName}
                    onChange={(e) => setPlayerName(e.target.value)}
                    placeholder="e.g., Lionel Messi"
                  />
                </div>

                {/* Minute */}
                <div className="space-y-2">
                  <Label className="text-sm">Minute *</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      value={minute}
                      onChange={(e) => setMinute(e.target.value)}
                      placeholder="45+2"
                      className="w-24"
                    />
                    <span className="text-muted-foreground">'</span>
                  </div>
                </div>

                {/* Assist */}
                <div className="space-y-2">
                  <Label className="text-sm">Assist (optional)</Label>
                  <Input
                    value={assist}
                    onChange={(e) => setAssist(e.target.value)}
                    placeholder="e.g., Neymar"
                  />
                </div>

                {/* Goal Type */}
                <div className="space-y-2">
                  <Label className="text-sm">Goal Type</Label>
                  <Select value={goalType} onValueChange={(v) => setGoalType(v as 'goal' | 'penalty' | 'own_goal')}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="goal">⚽ Regular Goal</SelectItem>
                      <SelectItem value="penalty">🎯 Penalty</SelectItem>
                      <SelectItem value="own_goal">🔴 Own Goal</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Button onClick={handleAddGoal} className="w-full">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Goal
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent className="py-3 px-4 space-y-4">
        {/* Team A Goals */}
        {renderGoalList(goalsA, 'a', teamA.short_name || teamA.name)}
        
        {/* Divider */}
        <div className="border-t border-border/30" />
        
        {/* Team B Goals */}
        {renderGoalList(goalsB, 'b', teamB.short_name || teamB.name)}

        {/* Save Button */}
        <Button
          onClick={handleSaveGoals}
          disabled={isSaving}
          className="w-full"
          variant="gradient"
        >
          {isSaving ? (
            <span className="animate-spin mr-2">⏳</span>
          ) : (
            <Save className="w-4 h-4 mr-2" />
          )}
          Save Goals & Update Score
        </Button>
        
        <p className="text-[10px] text-muted-foreground text-center">
          Score will be auto-calculated from goals (own goals count for opponent)
        </p>
      </CardContent>
    </Card>
  );
};

export default FootballGoalManager;
