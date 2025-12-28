import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { RefreshCw, Play, Pause, Clock, CheckCircle2, AlertCircle, Radio } from 'lucide-react';
import { format } from 'date-fns';

interface Match {
  id: string;
  team_a?: { name: string; short_name: string } | null;
  team_b?: { name: string; short_name: string } | null;
  status: string;
  auto_sync_enabled?: boolean;
  last_api_sync?: string;
  api_score_enabled?: boolean;
}

interface AutoScoreSyncManagerProps {
  matches: Match[];
  onSyncComplete?: () => void;
}

const AutoScoreSyncManager = ({ matches, onSyncComplete }: AutoScoreSyncManagerProps) => {
  const { toast } = useToast();
  const [isAutoSyncRunning, setIsAutoSyncRunning] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [syncResults, setSyncResults] = useState<{ matchId: string; success: boolean; message: string }[]>([]);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Get matches that are eligible for auto-sync (live + api_score_enabled + auto_sync_enabled)
  const eligibleMatches = matches.filter(
    m => m.status === 'live' && m.api_score_enabled && m.auto_sync_enabled
  );

  const syncMatch = async (match: Match) => {
    try {
      const { data, error } = await supabase.functions.invoke('api-cricket', {
        body: {
          action: 'syncMatch',
          matchId: match.id,
          teamAName: match.team_a?.name,
          teamBName: match.team_b?.name,
        },
      });

      if (error) throw error;

      // Update last_api_sync timestamp
      await supabase
        .from('matches')
        .update({ last_api_sync: new Date().toISOString() })
        .eq('id', match.id);

      return { matchId: match.id, success: true, message: data?.match ? 'Synced successfully' : 'No match found in API' };
    } catch (err) {
      console.error('Error syncing match:', match.id, err);
      return { matchId: match.id, success: false, message: err instanceof Error ? err.message : 'Sync failed' };
    }
  };

  const runSync = async () => {
    if (eligibleMatches.length === 0) {
      toast({
        title: 'No matches to sync',
        description: 'No live matches with auto-sync enabled.',
        variant: 'default',
      });
      return;
    }

    setIsSyncing(true);
    const results: { matchId: string; success: boolean; message: string }[] = [];

    for (const match of eligibleMatches) {
      const result = await syncMatch(match);
      results.push(result);
    }

    setSyncResults(results);
    setLastSyncTime(new Date());
    setIsSyncing(false);

    const successCount = results.filter(r => r.success).length;
    toast({
      title: 'Sync completed',
      description: `${successCount}/${results.length} matches synced successfully.`,
      variant: successCount === results.length ? 'default' : 'destructive',
    });

    onSyncComplete?.();
  };

  const startAutoSync = () => {
    if (intervalRef.current) return;

    setIsAutoSyncRunning(true);
    runSync(); // Run immediately

    // Then run every 2 minutes
    intervalRef.current = setInterval(() => {
      runSync();
    }, 2 * 60 * 1000);

    toast({
      title: 'Auto-sync started',
      description: 'Scores will be synced every 2 minutes.',
    });
  };

  const stopAutoSync = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsAutoSyncRunning(false);
    toast({
      title: 'Auto-sync stopped',
      description: 'Automatic score syncing has been stopped.',
    });
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  const toggleMatchAutoSync = async (matchId: string, enabled: boolean) => {
    try {
      await supabase
        .from('matches')
        .update({ auto_sync_enabled: enabled })
        .eq('id', matchId);

      toast({
        title: enabled ? 'Auto-sync enabled' : 'Auto-sync disabled',
        description: `Match will ${enabled ? '' : 'not '}be included in auto-sync.`,
      });

      onSyncComplete?.();
    } catch (err) {
      toast({
        title: 'Error',
        description: 'Failed to update auto-sync setting.',
        variant: 'destructive',
      });
    }
  };

  // Filter to only show matches with api_score_enabled
  const apiEnabledMatches = matches.filter(m => m.api_score_enabled && m.status !== 'completed');

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Radio className="w-5 h-5 text-primary" />
              Auto Score Sync
            </CardTitle>
            <CardDescription>
              Automatically sync live scores from API every 2 minutes
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {isAutoSyncRunning ? (
              <Button variant="destructive" onClick={stopAutoSync} disabled={isSyncing}>
                <Pause className="w-4 h-4 mr-2" />
                Stop Auto-Sync
              </Button>
            ) : (
              <Button variant="gradient" onClick={startAutoSync} disabled={isSyncing || eligibleMatches.length === 0}>
                <Play className="w-4 h-4 mr-2" />
                Start Auto-Sync
              </Button>
            )}
            <Button variant="outline" onClick={runSync} disabled={isSyncing}>
              <RefreshCw className={`w-4 h-4 mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
              Sync Now
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Status Section */}
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Badge variant={isAutoSyncRunning ? 'default' : 'secondary'}>
              {isAutoSyncRunning ? 'Running' : 'Stopped'}
            </Badge>
          </div>
          {lastSyncTime && (
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <Clock className="w-4 h-4" />
              Last sync: {format(lastSyncTime, 'HH:mm:ss')}
            </div>
          )}
          <div className="text-sm text-muted-foreground">
            {eligibleMatches.length} match(es) eligible for sync
          </div>
        </div>

        {/* Matches with API Score enabled */}
        {apiEnabledMatches.length > 0 ? (
          <div className="space-y-3">
            <Label className="text-sm font-medium">Matches with Live Score API</Label>
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {apiEnabledMatches.map((match) => {
                const syncResult = syncResults.find(r => r.matchId === match.id);
                return (
                  <div
                    key={match.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/50"
                  >
                    <div className="flex items-center gap-3">
                      <div>
                        <div className="font-medium text-sm">
                          {match.team_a?.short_name || match.team_a?.name} vs {match.team_b?.short_name || match.team_b?.name}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant={match.status === 'live' ? 'live' : 'secondary'} className="text-xs">
                            {match.status}
                          </Badge>
                          {(match as any).last_api_sync && (
                            <span className="text-xs text-muted-foreground">
                              Last sync: {format(new Date((match as any).last_api_sync), 'HH:mm')}
                            </span>
                          )}
                          {syncResult && (
                            <span className={`text-xs flex items-center gap-1 ${syncResult.success ? 'text-green-600' : 'text-red-500'}`}>
                              {syncResult.success ? <CheckCircle2 className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                              {syncResult.message}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Label htmlFor={`auto-sync-${match.id}`} className="text-xs text-muted-foreground">
                        Auto-sync
                      </Label>
                      <Switch
                        id={`auto-sync-${match.id}`}
                        checked={(match as any).auto_sync_enabled || false}
                        onCheckedChange={(checked) => toggleMatchAutoSync(match.id, checked)}
                        disabled={match.status === 'completed'}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="text-center py-6 text-muted-foreground">
            <Radio className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>No matches with Live Score API enabled.</p>
            <p className="text-sm">Enable "Show Live Score" on matches to use auto-sync.</p>
          </div>
        )}

        <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
          <p className="text-xs text-muted-foreground">
            <strong>How it works:</strong> When auto-sync is running, it fetches live scores from the API every 2 minutes 
            and saves them to the database. Users will see the synced scores without making API requests themselves. 
            Completed matches are automatically excluded from syncing.
          </p>
        </div>
      </CardContent>
    </Card>
  );
};

export default AutoScoreSyncManager;
