import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useLiveCricketScore } from '@/hooks/useLiveCricketScore';
import { RefreshCw, Radio, Clock, AlertCircle } from 'lucide-react';
import { motion } from 'framer-motion';

interface LiveScoreCardProps {
  teamAName: string;
  teamBName: string;
  teamALogo?: string | null;
  teamBLogo?: string | null;
  enabled?: boolean;
}

const LiveScoreCard = ({
  teamAName,
  teamBName,
  teamALogo,
  teamBLogo,
  enabled = true,
}: LiveScoreCardProps) => {
  const { scoreData, isLoading, error, refetch, isEnabled } = useLiveCricketScore({
    teamAName,
    teamBName,
    enabled,
  });

  if (!isEnabled) {
    return null;
  }

  if (error) {
    return (
      <Card className="border-border/50 bg-card/80 backdrop-blur mb-6">
        <CardContent className="py-4">
          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <AlertCircle className="w-4 h-4" />
            <span className="text-sm">Live scores unavailable</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!scoreData && !isLoading) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-6"
    >
      <Card className="border-border/50 bg-gradient-to-br from-primary/5 to-accent/5 backdrop-blur overflow-hidden">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Radio className="w-4 h-4 text-live animate-pulse" />
              <CardTitle className="text-base font-medium">Live Score</CardTitle>
            </div>
            <div className="flex items-center gap-2">
              {scoreData?.lastUpdated && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {scoreData.lastUpdated.toLocaleTimeString()}
                </span>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={refetch}
                disabled={isLoading}
                className="h-7 w-7 p-0"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-2">
          {isLoading && !scoreData ? (
            <div className="flex items-center justify-center py-6">
              <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : scoreData ? (
            <div className="space-y-4">
              {/* Team Scores */}
              <div className="grid grid-cols-2 gap-4">
                {/* Team A */}
                <div className="flex flex-col items-center gap-2 p-3 rounded-lg bg-background/50">
                  {teamALogo && (
                    <img src={teamALogo} alt={teamAName} className="w-10 h-10 object-contain" />
                  )}
                  <span className="text-sm font-medium text-center truncate w-full">{scoreData.teamA.name}</span>
                  <div className="text-center">
                    <span className="text-2xl font-bold text-primary">{scoreData.teamA.score}</span>
                    {scoreData.teamA.overs !== '-' && (
                      <span className="text-sm text-muted-foreground ml-1">({scoreData.teamA.overs} ov)</span>
                    )}
                  </div>
                </div>

                {/* Team B */}
                <div className="flex flex-col items-center gap-2 p-3 rounded-lg bg-background/50">
                  {teamBLogo && (
                    <img src={teamBLogo} alt={teamBName} className="w-10 h-10 object-contain" />
                  )}
                  <span className="text-sm font-medium text-center truncate w-full">{scoreData.teamB.name}</span>
                  <div className="text-center">
                    <span className="text-2xl font-bold text-accent">{scoreData.teamB.score}</span>
                    {scoreData.teamB.overs !== '-' && (
                      <span className="text-sm text-muted-foreground ml-1">({scoreData.teamB.overs} ov)</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Match Status */}
              {scoreData.status && (
                <div className="text-center">
                  <Badge variant="outline" className="text-sm">
                    {scoreData.status}
                  </Badge>
                </div>
              )}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </motion.div>
  );
};

export default LiveScoreCard;
