import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, X, Coins } from "lucide-react";
import { supabase } from '@/integrations/supabase/client';
import { useToast } from "@/hooks/use-toast";
import { Team } from "@/hooks/useSportsData";
import TossCoin from "./TossCoin";

interface ManualTossManagerProps {
  matchId: string;
  teamA: Team;
  teamB: Team;
}

const ManualTossManager = ({ matchId, teamA, teamB }: ManualTossManagerProps) => {
  const { toast } = useToast();
  const [tossWinnerId, setTossWinnerId] = useState<string>('');
  const [tossDecision, setTossDecision] = useState<string>('');
  const [apiToss, setApiToss] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch current toss data
  useEffect(() => {
    const fetchToss = async () => {
      setIsLoading(true);
      try {
        const [matchResult, apiResult] = await Promise.all([
          supabase
            .from('matches')
            .select('toss_winner_id, toss_decision')
            .eq('id', matchId)
            .single(),
          supabase
            .from('match_api_scores')
            .select('toss')
            .eq('match_id', matchId)
            .maybeSingle()
        ]);

        if (!matchResult.error && matchResult.data) {
          setTossWinnerId(matchResult.data.toss_winner_id || '');
          setTossDecision(matchResult.data.toss_decision || '');
        }

        if (!apiResult.error && apiResult.data?.toss) {
          setApiToss(apiResult.data.toss);
        }
      } catch (err) {
        console.error('Error fetching toss:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchToss();
  }, [matchId]);

  const handleSave = async () => {
    if (!tossWinnerId || !tossDecision) {
      toast({ title: "Error", description: "Select both toss winner and decision", variant: "destructive" });
      return;
    }

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('matches')
        .update({
          toss_winner_id: tossWinnerId,
          toss_decision: tossDecision,
        })
        .eq('id', matchId);

      if (error) throw error;

      const winnerTeam = tossWinnerId === teamA.id ? teamA : teamB;
      toast({ 
        title: "Toss updated!", 
        description: `${winnerTeam.short_name || winnerTeam.name} won toss, elected to ${tossDecision}`
      });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleClear = async () => {
    setIsClearing(true);
    try {
      const { error } = await supabase
        .from('matches')
        .update({
          toss_winner_id: null,
          toss_decision: null,
        })
        .eq('id', matchId);

      if (error) throw error;

      setTossWinnerId('');
      setTossDecision('');
      toast({ title: "Manual toss cleared" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setIsClearing(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-6">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const hasManualToss = !!tossWinnerId && !!tossDecision;
  const winnerTeam = tossWinnerId === teamA.id ? teamA : (tossWinnerId === teamB.id ? teamB : null);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <TossCoin size={20} />
          Toss
          {hasManualToss && (
            <Badge variant="secondary" className="text-xs">Manual</Badge>
          )}
          {!hasManualToss && apiToss && (
            <Badge variant="outline" className="text-xs">API</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Show API toss if available */}
        {apiToss && (
          <div className="p-3 rounded-lg bg-muted/50 border border-border/50">
            <div className="flex items-center gap-2 text-sm">
              <Coins className="w-4 h-4 text-yellow-500" />
              <span className="text-muted-foreground">API Toss:</span>
              <span className="font-medium">{apiToss}</span>
            </div>
          </div>
        )}

        {/* Manual toss form */}
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-xs">Toss Winner</Label>
              <Select value={tossWinnerId} onValueChange={setTossWinnerId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select team" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={teamA.id}>
                    <div className="flex items-center gap-2">
                      {teamA.logo_url && <img src={teamA.logo_url} alt="" className="w-4 h-4 object-contain" />}
                      {teamA.short_name || teamA.name}
                    </div>
                  </SelectItem>
                  <SelectItem value={teamB.id}>
                    <div className="flex items-center gap-2">
                      {teamB.logo_url && <img src={teamB.logo_url} alt="" className="w-4 h-4 object-contain" />}
                      {teamB.short_name || teamB.name}
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Elected to</Label>
              <Select value={tossDecision} onValueChange={setTossDecision}>
                <SelectTrigger>
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bat">
                    <span className="text-green-500 font-medium">Bat First</span>
                  </SelectItem>
                  <SelectItem value="bowl">
                    <span className="text-blue-500 font-medium">Bowl First</span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Current manual toss display */}
          {hasManualToss && winnerTeam && (
            <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
              <div className="flex items-center gap-2 text-sm">
                <TossCoin size={16} />
                <span className="font-medium">{winnerTeam.short_name || winnerTeam.name}</span>
                <span className="text-muted-foreground">elected to</span>
                <span className={`font-semibold ${tossDecision === 'bat' ? 'text-green-500' : 'text-blue-500'}`}>
                  {tossDecision === 'bat' ? 'Bat' : 'Bowl'}
                </span>
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-2">
            <Button
              onClick={handleSave}
              disabled={isSaving || !tossWinnerId || !tossDecision}
              size="sm"
              className="flex-1"
            >
              {isSaving ? (
                <Loader2 className="w-4 h-4 animate-spin mr-1" />
              ) : null}
              {hasManualToss ? 'Update Toss' : 'Set Toss'}
            </Button>
            {hasManualToss && (
              <Button
                onClick={handleClear}
                disabled={isClearing}
                size="sm"
                variant="outline"
              >
                {isClearing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <X className="w-4 h-4" />
                )}
              </Button>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            Manual toss overrides API toss data. Clear to use API toss.
          </p>
        </div>
      </CardContent>
    </Card>
  );
};

export default ManualTossManager;
