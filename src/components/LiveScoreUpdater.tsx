import { useState, useEffect, useRef, useCallback } from "react";
import { Match, useUpdateMatch, Team } from "@/hooks/useSportsData";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Save, Play, Clock, RefreshCw, Pause, RotateCcw, Coffee } from "lucide-react";
import TestMatchManager from "@/components/TestMatchManager";
import InningsManager from "@/components/InningsManager";

interface LiveScoreUpdaterProps {
  match: Match;
}

const LiveScoreUpdater = ({ match }: LiveScoreUpdaterProps) => {
  const { toast } = useToast();
  const updateMatch = useUpdateMatch();
  
  const [scoreA, setScoreA] = useState(match.score_a || "");
  const [scoreB, setScoreB] = useState(match.score_b || "");
  const [matchMinute, setMatchMinute] = useState<number>(match.match_minute || 0);
  const [isSaving, setIsSaving] = useState(false);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [isHalftime, setIsHalftime] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const lastSyncRef = useRef<number>(Date.now());

  const sportName = match.sport?.name?.toLowerCase() || "";
  const isFootball = sportName.includes("football") || sportName.includes("soccer");
  const isCricket = sportName.includes("cricket");
  const isTestMatch = isCricket && match.match_format?.toLowerCase() === "test";

  // Sync match minute from props when match data changes
  useEffect(() => {
    if (match.match_minute !== null && match.match_minute !== undefined) {
      setMatchMinute(match.match_minute);
    }
  }, [match.match_minute]);

  // Auto-save match minute to database every 30 seconds when timer is running
  const syncToDatabase = useCallback(async (minute: number) => {
    try {
      await updateMatch.mutateAsync({
        id: match.id,
        match_minute: minute,
      });
      lastSyncRef.current = Date.now();
    } catch (error) {
      console.error("Failed to sync match minute:", error);
    }
  }, [match.id, updateMatch]);

  // Timer effect - increment every 60 seconds
  useEffect(() => {
    if (isTimerRunning && isFootball && !isHalftime) {
      timerRef.current = setInterval(() => {
        setMatchMinute((prev) => {
          const newMinute = prev + 1;
          
          // Auto-pause at halftime (45') and full time (90')
          if (newMinute === 45 || newMinute === 90) {
            setIsTimerRunning(false);
            setIsHalftime(newMinute === 45);
            toast({ 
              title: newMinute === 45 ? "⏸️ Halftime" : "⏸️ Full Time", 
              description: `Match paused at ${newMinute}'` 
            });
            syncToDatabase(newMinute);
          }
          
          // Sync to database every 5 minutes
          if (newMinute % 5 === 0) {
            syncToDatabase(newMinute);
          }
          
          return newMinute;
        });
      }, 60000); // 1 minute interval

      return () => {
        if (timerRef.current) {
          clearInterval(timerRef.current);
        }
      };
    }
  }, [isTimerRunning, isFootball, isHalftime, syncToDatabase, toast]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updateMatch.mutateAsync({
        id: match.id,
        score_a: scoreA || null,
        score_b: scoreB || null,
        match_minute: matchMinute,
      });
      toast({ title: "Score updated successfully" });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleStartTimer = () => {
    setIsTimerRunning(true);
    setIsHalftime(false);
    toast({ title: "⏱️ Timer started", description: `Starting from ${matchMinute}'` });
  };

  const handlePauseTimer = async () => {
    setIsTimerRunning(false);
    await syncToDatabase(matchMinute);
    toast({ title: "⏸️ Timer paused", description: `Paused at ${matchMinute}'` });
  };

  const handleStartSecondHalf = () => {
    setMatchMinute(45);
    setIsHalftime(false);
    setIsTimerRunning(true);
    syncToDatabase(45);
    toast({ title: "⏱️ Second half started", description: "Timer resumed from 45'" });
  };

  const handleQuickMinuteUpdate = async (minutes: number) => {
    setMatchMinute(minutes);
    setIsTimerRunning(false);
    setIsHalftime(minutes === 45);
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

  const handleResetTimer = async () => {
    setMatchMinute(0);
    setIsTimerRunning(false);
    setIsHalftime(false);
    try {
      await updateMatch.mutateAsync({
        id: match.id,
        match_minute: 0,
      });
      toast({ title: "Timer reset to 0'" });
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
            {isTimerRunning ? (
              <span className="relative flex h-4 w-4">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-4 w-4 bg-red-500 items-center justify-center">
                  <Play className="w-2 h-2 text-white" />
                </span>
              </span>
            ) : (
              <Play className="w-4 h-4 text-red-500" />
            )}
            Live Score
          </CardTitle>
          <div className="flex items-center gap-2">
            {isHalftime && (
              <Badge variant="outline" className="text-xs bg-yellow-500/10 text-yellow-600 border-yellow-500/30">
                <Coffee className="w-3 h-3 mr-1" />
                Halftime
              </Badge>
            )}
            <Badge variant="live" className="text-xs">
              <span className="w-1.5 h-1.5 bg-current rounded-full mr-1 animate-pulse" />
              LIVE
            </Badge>
          </div>
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
          <div className="space-y-3">
            <Label className="text-xs flex items-center gap-1.5">
              <Clock className="w-3 h-3" />
              Match Timer
            </Label>
            
            {/* Current Minute Display */}
            <div className="flex items-center justify-center gap-3 py-2">
              <div className={`text-4xl font-bold font-mono tabular-nums ${isTimerRunning ? 'text-red-500' : 'text-foreground'}`}>
                {matchMinute}'
              </div>
              {isTimerRunning && (
                <span className="text-xs text-muted-foreground animate-pulse">Running...</span>
              )}
            </div>

            {/* Timer Controls */}
            <div className="flex items-center gap-2">
              {isHalftime ? (
                <Button
                  variant="default"
                  size="sm"
                  className="flex-1 bg-green-600 hover:bg-green-700"
                  onClick={handleStartSecondHalf}
                >
                  <Play className="w-4 h-4 mr-1" />
                  Start 2nd Half
                </Button>
              ) : isTimerRunning ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={handlePauseTimer}
                >
                  <Pause className="w-4 h-4 mr-1" />
                  Pause
                </Button>
              ) : (
                <Button
                  variant="default"
                  size="sm"
                  className="flex-1 bg-green-600 hover:bg-green-700"
                  onClick={handleStartTimer}
                >
                  <Play className="w-4 h-4 mr-1" />
                  {matchMinute === 0 ? 'Start Match' : 'Resume'}
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={handleResetTimer}
                disabled={isTimerRunning}
              >
                <RotateCcw className="w-4 h-4" />
              </Button>
            </div>

            {/* Manual Minute Input */}
            <div className="flex items-center gap-2">
              <Input
                type="number"
                value={matchMinute}
                onChange={(e) => setMatchMinute(e.target.value === "" ? 0 : parseInt(e.target.value))}
                placeholder="0"
                className="w-20 text-center"
                min={0}
                max={120}
                disabled={isTimerRunning}
              />
              <span className="text-muted-foreground text-sm">'</span>
              <div className="flex gap-1 ml-auto">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 px-2 text-xs"
                  onClick={() => handleQuickMinuteUpdate(0)}
                  disabled={isTimerRunning}
                >
                  0'
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 px-2 text-xs"
                  onClick={() => handleQuickMinuteUpdate(45)}
                  disabled={isTimerRunning}
                >
                  45'
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 px-2 text-xs"
                  onClick={() => handleQuickMinuteUpdate(90)}
                  disabled={isTimerRunning}
                >
                  90'
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Cricket specific - Over display helper */}
        {isCricket && !isTestMatch && (
          <p className="text-xs text-muted-foreground">
            Format: runs/wickets (e.g., 180/5, 45/2 in 8 overs)
          </p>
        )}

        {/* Test Match Controls */}
        {isTestMatch && (
          <TestMatchManager match={match} />
        )}

        {/* Innings Manager for Cricket */}
        {isCricket && teamA && teamB && (
          <div className="pt-4 border-t border-border/30">
            <InningsManager 
              matchId={match.id}
              teamA={teamA as Team}
              teamB={teamB as Team}
              matchFormat={match.match_format}
            />
          </div>
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
