import { useMatchInnings } from '@/hooks/useSportsData';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Trophy } from 'lucide-react';
import { motion } from 'framer-motion';

interface ManualScoreCardProps {
  matchId: string;
  teamAId: string;
  teamBId: string;
  matchStatus: string;
  isPrimary?: boolean;
  matchResult?: string | null;
  teamAName?: string;
  teamBName?: string;
}

const ManualScoreCard = ({ matchId, teamAId, teamBId, matchStatus, isPrimary = false, matchResult, teamAName, teamBName }: ManualScoreCardProps) => {
  const { data: innings, isLoading } = useMatchInnings(matchId);

  // Show loading state
  if (isLoading) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="mb-6"
      >
        <Card className="border-border/50 bg-card/80 backdrop-blur overflow-hidden">
          <CardContent className="p-6 flex items-center justify-center">
            <div className="flex items-center gap-2 text-muted-foreground">
              <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              <span className="text-sm">Loading scores...</span>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    );
  }

  // If no innings but match is completed with result, show result card
  if (!innings || innings.length === 0) {
    if (matchStatus === 'completed' && matchResult) {
      const getResultText = () => {
        switch (matchResult) {
          case 'team_a_won': return `${teamAName || 'Team A'} won`;
          case 'team_b_won': return `${teamBName || 'Team B'} won`;
          case 'tied': return 'Match Tied';
          case 'draw': return 'Match Drawn';
          case 'no_result': return 'No Result';
          default: return 'Completed';
        }
      };

      return (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="mb-6"
        >
          <Card className={`border-border/50 backdrop-blur overflow-hidden ${isPrimary ? 'bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20' : 'bg-card/80'}`}>
            <CardContent className="p-6">
              <div className="flex items-center justify-center gap-3">
                <Trophy className="w-6 h-6 text-primary" />
                <span className="font-semibold text-lg">{getResultText()}</span>
                <Badge variant="completed">Completed</Badge>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      );
    }
    return null;
  }

  const getOrdinal = (n: number) => {
    const suffixes = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0]);
  };

  const formatScore = (inningsData: typeof innings[0]) => {
    const wicketDisplay = inningsData.wickets === 10 ? '' : `/${inningsData.wickets}`;
    const declaredTag = inningsData.declared ? 'd' : '';
    return `${inningsData.runs}${wicketDisplay}${declaredTag}`;
  };

  // Check if there's a current innings (match in progress)
  const currentInnings = innings.find(i => i.is_current);
  const isLive = matchStatus === 'live' || currentInnings;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15 }}
      className="mb-6"
    >
      <Card className={`border-border/50 backdrop-blur overflow-hidden ${isPrimary ? 'bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20' : 'bg-card/80'}`}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Trophy className="w-5 h-5 text-primary" />
              <CardTitle className="text-lg">
                {isPrimary ? 'Live Score' : 'Match Score'}
              </CardTitle>
            </div>
            <div className="flex items-center gap-2">
              {isLive && (
                <Badge variant="live" className="animate-pulse">
                  <span className="w-2 h-2 bg-current rounded-full mr-1.5" />
                  LIVE
                </Badge>
              )}
              {matchStatus === 'completed' && !currentInnings && (
                <Badge variant="completed">Completed</Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {innings.map((inningsData) => (
            <div 
              key={inningsData.id} 
              className={`flex items-center justify-between rounded-lg p-3 ${
                inningsData.is_current 
                  ? 'bg-primary/10 border border-primary/30' 
                  : 'bg-muted/30'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground min-w-[40px]">
                  {getOrdinal(inningsData.innings_number)}
                </span>
                {inningsData.batting_team?.logo_url && (
                  <img
                    src={inningsData.batting_team.logo_url}
                    alt={inningsData.batting_team.name}
                    className="w-6 h-6 object-contain"
                  />
                )}
                <span className="font-medium text-sm">
                  {inningsData.batting_team?.short_name || inningsData.batting_team?.name}
                </span>
                {inningsData.is_current && (
                  <Badge className="bg-green-500/20 text-green-600 border-green-500/30 text-[10px]">
                    BATTING
                  </Badge>
                )}
                {inningsData.declared && (
                  <Badge variant="secondary" className="text-[10px]">DEC</Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className={`font-bold text-lg ${inningsData.is_current ? 'text-primary' : ''}`}>
                  {formatScore(inningsData)}
                </span>
                <span className="text-muted-foreground text-sm">
                  ({inningsData.overs} ov)
                </span>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </motion.div>
  );
};

export default ManualScoreCard;
