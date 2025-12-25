import { useLiveCricketScore } from '@/hooks/useLiveCricketScore';
import { useSiteSettings } from '@/hooks/useSiteSettings';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, RefreshCw, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';

interface LiveScoreCardProps {
  teamAName: string;
  teamBName: string;
  apiScoreEnabled?: boolean;
}

interface ScoreItem {
  r: number;
  w: number;
  o: number;
  inning: string;
}

const ScoreDisplay = ({ scores }: { scores: ScoreItem[] }) => {
  if (!scores || scores.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">Score not available yet</p>
    );
  }

  return (
    <div className="space-y-3">
      {scores.map((score, index) => (
        <div key={index} className="flex items-center justify-between bg-muted/30 rounded-lg p-3">
          <span className="text-sm font-medium truncate flex-1">{score.inning}</span>
          <div className="flex items-center gap-2">
            <span className="font-bold text-primary text-lg">
              {score.r}/{score.w}
            </span>
            <span className="text-muted-foreground text-sm">
              ({score.o} ov)
            </span>
          </div>
        </div>
      ))}
    </div>
  );
};

const LiveScoreCard = ({ teamAName, teamBName, apiScoreEnabled = false }: LiveScoreCardProps) => {
  const { data: siteSettings } = useSiteSettings();
  
  const isEnabled = !!siteSettings?.cricket_api_key && siteSettings?.cricket_api_enabled && apiScoreEnabled;
  
  const { 
    data: match, 
    isLoading, 
    isError, 
    refetch, 
    isFetching 
  } = useLiveCricketScore(teamAName, teamBName, isEnabled);

  // Don't render if not enabled
  if (!isEnabled) {
    return null;
  }

  if (isLoading) {
    return (
      <Card className="border-border/50 bg-card/80 backdrop-blur">
        <CardContent className="py-8 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
          <span className="ml-2 text-muted-foreground">Fetching live score...</span>
        </CardContent>
      </Card>
    );
  }

  if (isError || !match) {
    return (
      <Card className="border-border/50 bg-card/80 backdrop-blur">
        <CardContent className="py-6 text-center">
          <p className="text-muted-foreground text-sm mb-3">
            Live score not available for this match
          </p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  const scores: ScoreItem[] = match.score || [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15 }}
    >
      <Card className="border-border/50 bg-card/80 backdrop-blur overflow-hidden">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Trophy className="w-5 h-5 text-primary" />
              <CardTitle className="text-lg">Live Score</CardTitle>
            </div>
            <div className="flex items-center gap-2">
              {match.matchStarted && !match.matchEnded && (
                <Badge variant="live" className="animate-pulse">
                  <span className="w-2 h-2 bg-current rounded-full mr-1.5" />
                  LIVE
                </Badge>
              )}
              {match.matchEnded && (
                <Badge variant="completed">Completed</Badge>
              )}
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => refetch()}
                disabled={isFetching}
                className="h-8 w-8"
              >
                <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <ScoreDisplay scores={scores} />
          
          {/* Match Status/Result */}
          {match.status && (
            <div className="pt-3 border-t border-border/30">
              <p className="text-sm font-medium text-center text-primary">
                {match.status}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
};

export default LiveScoreCard;
