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
  Calendar, 
  Save, 
  RefreshCw,
  Play
} from "lucide-react";

interface TestMatchManagerProps {
  match: Match;
}

const TestMatchManager = ({ match }: TestMatchManagerProps) => {
  const { toast } = useToast();
  const updateMatch = useUpdateMatch();
  
  const [dayStartTime, setDayStartTime] = useState<string>(match.day_start_time || "10:00");
  const [dailyStumpsTime, setDailyStumpsTime] = useState<string>("17:00");
  const [isSaving, setIsSaving] = useState(false);
  const [isCallingStumps, setIsCallingStumps] = useState(false);
  const [isResumingPlay, setIsResumingPlay] = useState(false);

  // Parse existing times
  useEffect(() => {
    setDayStartTime(match.day_start_time || "10:00");
    
    // Extract time from stumps_time if available
    if (match.stumps_time) {
      try {
        const dt = new Date(match.stumps_time);
        const hours = dt.getHours().toString().padStart(2, '0');
        const mins = dt.getMinutes().toString().padStart(2, '0');
        setDailyStumpsTime(`${hours}:${mins}`);
      } catch (e) {
        console.error("Error parsing stumps_time:", e);
      }
    }
  }, [match]);

  // Calculate today's stumps time based on daily time
  const calculateTodayStumpsTime = (time: string): string => {
    const [hours, minutes] = time.split(':').map(Number);
    const today = new Date();
    today.setHours(hours, minutes, 0, 0);
    return today.toISOString();
  };

  // Calculate next day start time based on daily start time
  const calculateNextDayStart = (time: string): string => {
    const [hours, minutes] = time.split(':').map(Number);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(hours, minutes, 0, 0);
    return tomorrow.toISOString();
  };

  // Validate STUMPS time is after match start time
  const validateStumpsTime = (): boolean => {
    if (!match.match_start_time) {
      return true; // No start time set, allow any STUMPS time
    }
    
    const stumpsTimestamp = new Date(calculateTodayStumpsTime(dailyStumpsTime));
    const matchStartTime = new Date(match.match_start_time);
    
    if (stumpsTimestamp <= matchStartTime) {
      toast({
        title: "Invalid STUMPS Time",
        description: `STUMPS time (${dailyStumpsTime}) must be after match start time (${matchStartTime.toLocaleTimeString()})`,
        variant: "destructive"
      });
      return false;
    }
    
    return true;
  };

  // Validate day start time is before STUMPS time
  const validateDayStartTime = (): boolean => {
    const [startHours, startMinutes] = dayStartTime.split(':').map(Number);
    const [stumpsHours, stumpsMinutes] = dailyStumpsTime.split(':').map(Number);
    
    const startTotalMinutes = startHours * 60 + startMinutes;
    const stumpsTotalMinutes = stumpsHours * 60 + stumpsMinutes;
    
    if (startTotalMinutes >= stumpsTotalMinutes) {
      toast({
        title: "Invalid Schedule",
        description: `Day start time (${dayStartTime}) must be before STUMPS time (${dailyStumpsTime})`,
        variant: "destructive"
      });
      return false;
    }
    
    return true;
  };

  const handleSave = async () => {
    // Validate times before saving
    if (!validateDayStartTime() || !validateStumpsTime()) {
      return;
    }
    
    setIsSaving(true);
    try {
      // Calculate the actual timestamps based on daily times
      const stumpsTimestamp = calculateTodayStumpsTime(dailyStumpsTime);
      const nextDayTimestamp = calculateNextDayStart(dayStartTime);

      await updateMatch.mutateAsync({
        id: match.id,
        day_start_time: dayStartTime,
        stumps_time: stumpsTimestamp,
        next_day_start: nextDayTimestamp,
      });
      toast({ 
        title: "Test match times saved", 
        description: `Play starts at ${dayStartTime}, STUMPS at ${dailyStumpsTime} daily` 
      });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  // Manual STUMPS call
  const handleCallStumps = async () => {
    setIsCallingStumps(true);
    try {
      const nextDayTimestamp = calculateNextDayStart(dayStartTime);
      
      await updateMatch.mutateAsync({
        id: match.id,
        is_stumps: true,
        next_day_start: nextDayTimestamp,
      });
      toast({ 
        title: "STUMPS Called", 
        description: `Day ${match.test_day || 1} play ended. Resumes tomorrow at ${dayStartTime}` 
      });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setIsCallingStumps(false);
    }
  };

  // Manual Resume Play (remove STUMPS and increment day)
  const handleResumePlay = async () => {
    setIsResumingPlay(true);
    try {
      await updateMatch.mutateAsync({
        id: match.id,
        is_stumps: false,
        test_day: (match.test_day || 1) + 1,
        next_day_start: null,
      });
      toast({ 
        title: "Play Resumed", 
        description: `Day ${(match.test_day || 1) + 1} started` 
      });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setIsResumingPlay(false);
    }
  };

  return (
    <Card className="border-amber-500/30 bg-gradient-to-br from-amber-500/5 to-orange-500/5">
      <CardHeader className="py-3 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Calendar className="w-4 h-4 text-amber-500" />
            Test Match Daily Schedule
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge className="bg-gradient-to-r from-amber-500 to-orange-600 text-white border-0 font-bold">
              Day {match.test_day || 1}
            </Badge>
            {match.is_stumps && (
              <Badge className="bg-slate-600 text-white animate-pulse">
                <Moon className="w-3 h-3 mr-1" />
                STUMPS
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="py-3 px-4 space-y-4">
        {/* Manual Controls */}
        <div className="flex gap-2">
          {!match.is_stumps ? (
            <Button
              onClick={handleCallStumps}
              disabled={isCallingStumps}
              variant="outline"
              className="flex-1 gap-2 border-slate-500/50 hover:bg-slate-500/20"
            >
              {isCallingStumps ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Moon className="w-4 h-4" />
              )}
              Call STUMPS Now
            </Button>
          ) : (
            <Button
              onClick={handleResumePlay}
              disabled={isResumingPlay}
              variant="outline"
              className="flex-1 gap-2 border-green-500/50 hover:bg-green-500/20 text-green-500"
            >
              {isResumingPlay ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4" />
              )}
              Resume Play (Start Day {(match.test_day || 1) + 1})
            </Button>
          )}
        </div>

        {/* Daily Start Time */}
        <div className="space-y-2">
          <Label className="text-xs flex items-center gap-1.5">
            <Sun className="w-3 h-3 text-yellow-500" />
            Daily Play Start Time (Auto-Resume)
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
          <p className="text-xs text-muted-foreground">
            At this time daily, Day auto-increments & STUMPS is removed
          </p>
        </div>

        {/* Daily Stumps Time */}
        <div className="space-y-2">
          <Label className="text-xs flex items-center gap-1.5">
            <Moon className="w-3 h-3 text-slate-400" />
            Daily STUMPS Time (Auto-Call)
          </Label>
          <div className="flex items-center gap-2">
            <Input
              type="time"
              value={dailyStumpsTime}
              onChange={(e) => setDailyStumpsTime(e.target.value)}
              className="flex-1"
            />
            <div className="flex gap-1">
              {["17:00", "17:30", "18:00", "18:30"].map((time) => (
                <Button
                  key={time}
                  variant={dailyStumpsTime === time ? "default" : "outline"}
                  size="sm"
                  className="h-8 px-2 text-xs"
                  onClick={() => setDailyStumpsTime(time)}
                >
                  {time}
                </Button>
              ))}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            At this time daily, STUMPS is called automatically
          </p>
        </div>

        {/* Save Button */}
        <Button
          onClick={handleSave}
          disabled={isSaving}
          variant="gradient"
          className="w-full gap-2"
        >
          {isSaving ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          Save Auto-Schedule
        </Button>

        {/* Status Info */}
        <div className="text-xs text-muted-foreground space-y-1 pt-2 border-t border-border/30">
          <p>• Current: Day {match.test_day || 1} {match.is_stumps ? "(STUMPS)" : "(Live)"}</p>
          <p>• Auto-STUMPS: {dailyStumpsTime} daily</p>
          <p>• Auto-Resume: {dayStartTime} daily (next day starts)</p>
        </div>
      </CardContent>
    </Card>
  );
};

export default TestMatchManager;