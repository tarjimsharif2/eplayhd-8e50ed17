import { useState, useEffect } from "react";
import { Match, useUpdateMatch } from "@/hooks/useSportsData";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { 
  Sun, 
  Moon, 
  Clock, 
  Calendar, 
  Save, 
  Play, 
  Pause, 
  ChevronUp, 
  ChevronDown,
  RefreshCw
} from "lucide-react";
import { format, parseISO, addDays, setHours, setMinutes } from "date-fns";

interface TestMatchManagerProps {
  match: Match;
}

const TestMatchManager = ({ match }: TestMatchManagerProps) => {
  const { toast } = useToast();
  const updateMatch = useUpdateMatch();
  
  const [testDay, setTestDay] = useState<number>(match.test_day || 1);
  const [isStumps, setIsStumps] = useState<boolean>(match.is_stumps || false);
  const [dayStartTime, setDayStartTime] = useState<string>(match.day_start_time || "10:00");
  const [stumpsTime, setStumpsTime] = useState<string>("");
  const [nextDayStart, setNextDayStart] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);

  // Parse existing timestamps
  useEffect(() => {
    if (match.stumps_time) {
      try {
        const dt = parseISO(match.stumps_time);
        setStumpsTime(format(dt, "yyyy-MM-dd'T'HH:mm"));
      } catch (e) {
        console.error("Error parsing stumps_time:", e);
      }
    }
    if (match.next_day_start) {
      try {
        const dt = parseISO(match.next_day_start);
        setNextDayStart(format(dt, "yyyy-MM-dd'T'HH:mm"));
      } catch (e) {
        console.error("Error parsing next_day_start:", e);
      }
    }
    setTestDay(match.test_day || 1);
    setIsStumps(match.is_stumps || false);
    setDayStartTime(match.day_start_time || "10:00");
  }, [match]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updateMatch.mutateAsync({
        id: match.id,
        test_day: testDay,
        is_stumps: isStumps,
        day_start_time: dayStartTime,
        stumps_time: stumpsTime ? new Date(stumpsTime).toISOString() : null,
        next_day_start: nextDayStart ? new Date(nextDayStart).toISOString() : null,
      });
      toast({ title: "Test match settings saved" });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleCallStumps = async () => {
    setIsSaving(true);
    try {
      // Calculate next day start time based on day_start_time
      const tomorrow = addDays(new Date(), 1);
      const [hours, minutes] = dayStartTime.split(':').map(Number);
      const nextStart = setMinutes(setHours(tomorrow, hours), minutes);

      await updateMatch.mutateAsync({
        id: match.id,
        is_stumps: true,
        next_day_start: nextStart.toISOString(),
      });
      setIsStumps(true);
      setNextDayStart(format(nextStart, "yyyy-MM-dd'T'HH:mm"));
      toast({ title: `Day ${testDay} - STUMPS called`, description: `Play resumes tomorrow at ${dayStartTime}` });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleResumePlay = async () => {
    setIsSaving(true);
    try {
      const newDay = testDay + 1;
      await updateMatch.mutateAsync({
        id: match.id,
        test_day: newDay,
        is_stumps: false,
        stumps_time: null,
        next_day_start: null,
      });
      setTestDay(newDay);
      setIsStumps(false);
      setStumpsTime("");
      setNextDayStart("");
      toast({ title: `Day ${newDay} started`, description: "Play has resumed" });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDayIncrement = async (increment: number) => {
    const newDay = Math.max(1, Math.min(5, testDay + increment));
    setTestDay(newDay);
    try {
      await updateMatch.mutateAsync({
        id: match.id,
        test_day: newDay,
      });
      toast({ title: `Day ${newDay}` });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  // Generate quick stumps time options based on current date
  const getQuickStumpsOptions = () => {
    const today = new Date();
    return [
      { label: "5:00 PM", hours: 17, minutes: 0 },
      { label: "5:30 PM", hours: 17, minutes: 30 },
      { label: "6:00 PM", hours: 18, minutes: 0 },
      { label: "6:30 PM", hours: 18, minutes: 30 },
    ].map(opt => ({
      label: opt.label,
      value: format(setMinutes(setHours(today, opt.hours), opt.minutes), "yyyy-MM-dd'T'HH:mm"),
    }));
  };

  return (
    <Card className="border-amber-500/30 bg-gradient-to-br from-amber-500/5 to-orange-500/5">
      <CardHeader className="py-3 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Calendar className="w-4 h-4 text-amber-500" />
            Test Match Controls
          </CardTitle>
          <Badge className="bg-gradient-to-r from-red-600 to-red-700 text-white border-0">
            TEST
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="py-3 px-4 space-y-4">
        {/* Current Day Display */}
        <div className="flex items-center justify-center gap-4">
          <Button
            variant="outline"
            size="icon"
            onClick={() => handleDayIncrement(-1)}
            disabled={testDay <= 1 || isSaving}
            className="h-10 w-10"
          >
            <ChevronDown className="w-5 h-5" />
          </Button>
          <div className="flex flex-col items-center">
            <span className="text-xs text-muted-foreground uppercase tracking-wider">Current Day</span>
            <span className="text-4xl font-bold text-amber-500">Day {testDay}</span>
            {isStumps && (
              <Badge className="mt-1 bg-slate-600 text-white animate-pulse">
                <Moon className="w-3 h-3 mr-1" />
                STUMPS
              </Badge>
            )}
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={() => handleDayIncrement(1)}
            disabled={testDay >= 5 || isSaving}
            className="h-10 w-10"
          >
            <ChevronUp className="w-5 h-5" />
          </Button>
        </div>

        {/* Day Start Time */}
        <div className="space-y-2">
          <Label className="text-xs flex items-center gap-1.5">
            <Sun className="w-3 h-3 text-yellow-500" />
            Daily Start Time (local)
          </Label>
          <div className="flex items-center gap-2">
            <Input
              type="time"
              value={dayStartTime}
              onChange={(e) => setDayStartTime(e.target.value)}
              className="flex-1"
            />
            <div className="flex gap-1">
              {["09:30", "10:00", "10:30", "11:00"].map((time) => (
                <Button
                  key={time}
                  variant={dayStartTime === time ? "default" : "outline"}
                  size="sm"
                  className="h-8 px-2 text-xs"
                  onClick={() => setDayStartTime(time)}
                >
                  {time}
                </Button>
              ))}
            </div>
          </div>
        </div>

        {/* Stumps Time */}
        <div className="space-y-2">
          <Label className="text-xs flex items-center gap-1.5">
            <Moon className="w-3 h-3 text-slate-400" />
            Today's Stumps Time
          </Label>
          <div className="flex flex-col gap-2">
            <Input
              type="datetime-local"
              value={stumpsTime}
              onChange={(e) => setStumpsTime(e.target.value)}
            />
            <div className="flex gap-1 flex-wrap">
              {getQuickStumpsOptions().map((opt) => (
                <Button
                  key={opt.label}
                  variant={stumpsTime === opt.value ? "default" : "outline"}
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => setStumpsTime(opt.value)}
                >
                  {opt.label}
                </Button>
              ))}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            When this time is reached, STUMPS will be called automatically
          </p>
        </div>

        {/* Next Day Start (shown when stumps is set) */}
        {isStumps && (
          <div className="space-y-2 p-3 rounded-lg bg-slate-800/50 border border-slate-700">
            <Label className="text-xs flex items-center gap-1.5">
              <Clock className="w-3 h-3" />
              Next Day Resumes At
            </Label>
            <Input
              type="datetime-local"
              value={nextDayStart}
              onChange={(e) => setNextDayStart(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Play will automatically resume and day will increment at this time
            </p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-2 pt-2">
          {!isStumps ? (
            <Button
              variant="outline"
              onClick={handleCallStumps}
              disabled={isSaving}
              className="gap-2 border-slate-500 hover:bg-slate-800"
            >
              {isSaving ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Pause className="w-4 h-4" />
              )}
              Call Stumps
            </Button>
          ) : (
            <Button
              variant="outline"
              onClick={handleResumePlay}
              disabled={isSaving}
              className="gap-2 border-green-500 text-green-500 hover:bg-green-500/10"
            >
              {isSaving ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4" />
              )}
              Start Day {testDay + 1}
            </Button>
          )}
          <Button
            onClick={handleSave}
            disabled={isSaving}
            variant="gradient"
            className="gap-2"
          >
            {isSaving ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Save Settings
          </Button>
        </div>

        {/* Status Info */}
        <div className="text-xs text-muted-foreground space-y-1 pt-2 border-t border-border/30">
          <p>• Day {testDay} of 5 maximum</p>
          <p>• Daily play starts at {dayStartTime}</p>
          {stumpsTime && (
            <p>• Stumps scheduled for {format(new Date(stumpsTime), "MMM d, h:mm a")}</p>
          )}
          {isStumps && nextDayStart && (
            <p>• Day {testDay + 1} resumes {format(new Date(nextDayStart), "MMM d, h:mm a")}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default TestMatchManager;
