import { useMatchInnings } from '@/hooks/useSportsData';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Trophy, Moon, Sun, Clock } from 'lucide-react';
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
  // Test match specific props
  matchFormat?: string | null;
  testDay?: number | null;
  isStumps?: boolean | null;
  stumpsTime?: string | null;
  nextDayStart?: string | null;
  dayStartTime?: string | null;
}

const ManualScoreCard = ({ 
  matchId, 
  teamAId, 
  teamBId, 
  matchStatus, 
  isPrimary = false, 
  matchResult, 
  teamAName, 
  teamBName,
  matchFormat,
  testDay,
  isStumps,
  stumpsTime,
  nextDayStart,
  dayStartTime
}: ManualScoreCardProps) => {
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
  const isTestMatch = matchFormat?.toLowerCase() === 'test';

  // Format time for display
  const formatTime = (dateString: string | null | undefined) => {
    if (!dateString) return null;
    try {
      const date = new Date(dateString);
      return date.toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit',
        hour12: true 
      });
    } catch {
      return null;
    }
  };

  const formattedStumpsTime = formatTime(stumpsTime);
  const formattedNextDayStart = formatTime(nextDayStart);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15 }}
      className="mb-6"
    >
      <Card className={`border-border/50 backdrop-blur overflow-hidden ${isPrimary ? 'bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20' : 'bg-card/80'}`}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Trophy className="w-5 h-5 text-primary" />
              <CardTitle className="text-lg">
                {isPrimary ? 'Live Score' : 'Match Score'}
              </CardTitle>
              {/* Test Match Day Badge */}
              {isTestMatch && testDay && (
                <Badge variant="secondary" className="ml-2">
                  Day {testDay}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {/* STUMPS Badge for Test matches */}
              {isTestMatch && isStumps && matchStatus === 'live' && (
                <Badge className="bg-amber-500/20 text-amber-600 border-amber-500/30">
                  <Moon className="w-3 h-3 mr-1" />
                  STUMPS
                </Badge>
              )}
              {isLive && !isStumps && (
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
          
          {/* Test Match Time Info */}
          {isTestMatch && matchStatus === 'live' && (
            <div className="flex flex-wrap items-center gap-4 mt-3 text-sm text-muted-foreground">
              {isStumps && formattedNextDayStart && (
                <div className="flex items-center gap-1.5">
                  <Sun className="w-4 h-4 text-amber-500" />
                  <span>Next Day Starts: <span className="font-medium text-foreground">{formattedNextDayStart}</span></span>
                </div>
              )}
              {!isStumps && formattedStumpsTime && (
                <div className="flex items-center gap-1.5">
                  <Moon className="w-4 h-4 text-amber-500" />
                  <span>Stumps at: <span className="font-medium text-foreground">{formattedStumpsTime}</span></span>
                </div>
              )}
              {dayStartTime && (
                <div className="flex items-center gap-1.5">
                  <Clock className="w-4 h-4" />
                  <span>Day Start: <span className="font-medium text-foreground">{dayStartTime}</span></span>
                </div>
              )}
            </div>
          )}
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
              <div className="flex items-center gap-3">
                {inningsData.extras !== null && inningsData.extras !== undefined && inningsData.extras > 0 && (
                  <span className="text-xs text-muted-foreground bg-muted/50 px-2 py-0.5 rounded">
                    Extras: {inningsData.extras}
                  </span>
                )}
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
