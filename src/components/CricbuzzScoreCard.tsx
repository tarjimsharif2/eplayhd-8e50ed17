import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RefreshCw, Loader2, AlertCircle, ArrowDown } from 'lucide-react';
import { useCricbuzzScore } from '@/hooks/useCricbuzzScore';
import { motion } from 'framer-motion';

interface CricbuzzScoreCardProps {
  cricbuzzMatchId: string | null;
  enabled?: boolean;
  onFallbackToManual?: () => void;
}

export const CricbuzzScoreCard = ({ cricbuzzMatchId, enabled = true, onFallbackToManual }: CricbuzzScoreCardProps) => {
  const { scoreData, isLoading, error, refetch, isEnabled } = useCricbuzzScore({
    cricbuzzMatchId,
    enabled,
  });

  if (!isEnabled) {
    return null;
  }

  if (error) {
    return (
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-4"
      >
        <Card className="bg-amber-500/10 border-amber-500/30">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-amber-600 dark:text-amber-400">
                  Live score temporarily unavailable
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Using manual scores below. Auto-retry in 30s.
                </p>
              </div>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={refetch} 
                disabled={isLoading}
                className="flex-shrink-0"
              >
                <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
            {onFallbackToManual && (
              <div className="mt-3 flex items-center justify-center text-xs text-muted-foreground">
                <ArrowDown className="h-3 w-3 mr-1 animate-bounce" />
                <span>See manual scores below</span>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    );
  }

  if (isLoading && !scoreData) {
    return (
      <Card className="bg-card/50 border-border/50">
        <CardContent className="p-4 flex items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          <span className="ml-2 text-sm text-muted-foreground">Loading live score...</span>
        </CardContent>
      </Card>
    );
  }

  if (!scoreData) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card className="bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <Badge variant="destructive" className="animate-pulse">
              LIVE
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              onClick={refetch}
              disabled={isLoading}
              className="h-8 w-8 p-0"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>

          <div className="space-y-3">
            {scoreData.team1 && (
              <div className="flex items-center justify-between">
                <span className="font-medium text-foreground">{scoreData.team1.name}</span>
                <div className="text-right">
                  <span className="font-bold text-lg text-foreground">
                    {scoreData.team1.score || '-'}
                  </span>
                  {scoreData.team1.overs && (
                    <span className="text-sm text-muted-foreground ml-2">
                      ({scoreData.team1.overs} ov)
                    </span>
                  )}
                </div>
              </div>
            )}

            {scoreData.team2 && (
              <div className="flex items-center justify-between">
                <span className="font-medium text-foreground">{scoreData.team2.name}</span>
                <div className="text-right">
                  <span className="font-bold text-lg text-foreground">
                    {scoreData.team2.score || '-'}
                  </span>
                  {scoreData.team2.overs && (
                    <span className="text-sm text-muted-foreground ml-2">
                      ({scoreData.team2.overs} ov)
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          {scoreData.status && (
            <p className="text-sm text-muted-foreground mt-3 pt-3 border-t border-border/50">
              {scoreData.status}
            </p>
          )}

          <p className="text-xs text-muted-foreground/70 mt-2">
            Source: Cricbuzz • Updated: {new Date(scoreData.lastUpdated).toLocaleTimeString()}
          </p>
        </CardContent>
      </Card>
    </motion.div>
  );
};
