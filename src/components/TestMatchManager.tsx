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
  RefreshCw
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

  const handleSave = async () => {
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
        {/* Daily Start Time */}
        <div className="space-y-2">
          <Label className="text-xs flex items-center gap-1.5">
            <Sun className="w-3 h-3 text-yellow-500" />
            Daily Play Start Time
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
            Every day at this time, Day will auto-increment and STUMPS will be removed
          </p>
        </div>

        {/* Daily Stumps Time */}
        <div className="space-y-2">
          <Label className="text-xs flex items-center gap-1.5">
            <Moon className="w-3 h-3 text-slate-400" />
            Daily STUMPS Time
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
            Every day at this time, STUMPS will be called automatically
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
          Save Daily Schedule
        </Button>

        {/* Status Info */}
        <div className="text-xs text-muted-foreground space-y-1 pt-2 border-t border-border/30">
          <p>• Current: Day {match.test_day || 1}</p>
          <p>• Play starts daily at {dayStartTime}</p>
          <p>• STUMPS called daily at {dailyStumpsTime}</p>
          <p className="text-primary">• Day count and STUMPS status change automatically</p>
        </div>
      </CardContent>
    </Card>
  );
};

export default TestMatchManager;