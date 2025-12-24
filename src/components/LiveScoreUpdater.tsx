import { useState } from "react";
import { Match, useUpdateMatch } from "@/hooks/useSportsData";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Save, Play, Clock, RefreshCw } from "lucide-react";

interface LiveScoreUpdaterProps {
  match: Match;
}

const LiveScoreUpdater = ({ match }: LiveScoreUpdaterProps) => {
  const { toast } = useToast();
  const updateMatch = useUpdateMatch();
  
  const [scoreA, setScoreA] = useState(match.score_a || "");
  const [scoreB, setScoreB] = useState(match.score_b || "");
  const [matchMinute, setMatchMinute] = useState<number | "">(match.match_minute || "");
  const [isSaving, setIsSaving] = useState(false);

  const sportName = match.sport?.name?.toLowerCase() || "";
  const isFootball = sportName === "football" || sportName === "soccer";
  const isCricket = sportName === "cricket";

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updateMatch.mutateAsync({
        id: match.id,
        score_a: scoreA || null,
        score_b: scoreB || null,
        match_minute: matchMinute === "" ? null : matchMinute,
      });
      toast({ title: "Score updated successfully" });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleQuickMinuteUpdate = async (minutes: number) => {
    setMatchMinute(minutes);
    try {
      await updateMatch.mutateAsync({
        id: match.id,
        match_minute: minutes,
      });
      toast({ title: `Match minute set to ${minutes}'` });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const teamA = match.team_a;
  const teamB = match.team_b;

  if (!teamA || !teamB) return null;

  return (
    <Card className="border-primary/20">
      <CardHeader className="py-3 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Play className="w-4 h-4 text-red-500" />
            Live Score
          </CardTitle>
          <Badge variant="live" className="text-xs">
            <span className="w-1.5 h-1.5 bg-current rounded-full mr-1 animate-pulse" />
            LIVE
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="py-3 px-4 space-y-4">
        {/* Team Scores */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-xs flex items-center gap-2">
              {teamA.logo_url && (
                <img src={teamA.logo_url} alt={teamA.name} className="w-4 h-4 object-contain" />
              )}
              {teamA.short_name || teamA.name}
            </Label>
            <Input
              value={scoreA}
              onChange={(e) => setScoreA(e.target.value)}
              placeholder={isCricket ? "180/5" : "0"}
              className="text-center font-bold text-lg"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs flex items-center gap-2">
              {teamB.logo_url && (
                <img src={teamB.logo_url} alt={teamB.name} className="w-4 h-4 object-contain" />
              )}
              {teamB.short_name || teamB.name}
            </Label>
            <Input
              value={scoreB}
              onChange={(e) => setScoreB(e.target.value)}
              placeholder={isCricket ? "150/3" : "0"}
              className="text-center font-bold text-lg"
            />
          </div>
        </div>

        {/* Match Minute (for Football) */}
        {isFootball && (
          <div className="space-y-2">
            <Label className="text-xs flex items-center gap-1.5">
              <Clock className="w-3 h-3" />
              Match Minute
            </Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                value={matchMinute}
                onChange={(e) => setMatchMinute(e.target.value === "" ? "" : parseInt(e.target.value))}
                placeholder="45"
                className="w-20 text-center"
                min={0}
                max={120}
              />
              <span className="text-muted-foreground text-sm">'</span>
              <div className="flex gap-1 ml-auto">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 px-2 text-xs"
                  onClick={() => handleQuickMinuteUpdate(45)}
                >
                  45'
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 px-2 text-xs"
                  onClick={() => handleQuickMinuteUpdate(90)}
                >
                  90'
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 px-2 text-xs"
                  onClick={() => handleQuickMinuteUpdate(90 + 5)}
                >
                  90+5'
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Cricket specific - Over display helper */}
        {isCricket && (
          <p className="text-xs text-muted-foreground">
            Format: runs/wickets (e.g., 180/5, 45/2 in 8 overs)
          </p>
        )}

        {/* Save Button */}
        <Button
          onClick={handleSave}
          disabled={isSaving}
          className="w-full"
          variant="gradient"
        >
          {isSaving ? (
            <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Save className="w-4 h-4 mr-2" />
          )}
          Update Score
        </Button>
      </CardContent>
    </Card>
  );
};

export default LiveScoreUpdater;
