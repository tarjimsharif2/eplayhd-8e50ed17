import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useApiCricketScore, BatsmanData, BowlerData } from '@/hooks/useApiCricketScore';
import { RefreshCw, Radio, Clock, AlertCircle, ChevronRight, Trophy, User, Target } from 'lucide-react';
import { motion } from 'framer-motion';

interface ApiCricketLiveScoreProps {
  teamAName: string;
  teamBName: string;
  teamALogo?: string | null;
  teamBLogo?: string | null;
  enabled?: boolean;
  matchId?: string;
  matchStatus?: string;
}

const ApiCricketLiveScore = ({
  teamAName,
  teamBName,
  teamALogo,
  teamBLogo,
  enabled = true,
  matchId,
  matchStatus,
}: ApiCricketLiveScoreProps) => {
  const { scoreData, isLoading, error, refetch, isEnabled } = useApiCricketScore({
    teamAName,
    teamBName,
    enabled,
    matchId,
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

  // Parse score to extract overs - format is typically "180/4" or "180/4 (20 ov)"
  const parseScoreOvers = (score: string) => {
    const oversMatch = score.match(/\((\d+\.?\d*)\s*ov\)/);
    return oversMatch ? oversMatch[1] : null;
  };

  const homeOvers = scoreData?.homeScore ? parseScoreOvers(scoreData.homeScore) : null;
  const awayOvers = scoreData?.awayScore ? parseScoreOvers(scoreData.awayScore) : null;

  // Clean score to just show runs/wickets
  const cleanScore = (score: string) => {
    return score.replace(/\s*\(\d+\.?\d*\s*ov\)/, '').trim();
  };

  const renderFullScoreboard = () => {
    if (!scoreData) {
      return (
        <div className="text-center py-8 text-muted-foreground">
          No score data available
        </div>
      );
    }

    const hasBattingData = scoreData.batsmen && scoreData.batsmen.length > 0;
    const hasBowlingData = scoreData.bowlers && scoreData.bowlers.length > 0;
    const hasDetailedData = hasBattingData || hasBowlingData;

    return (
      <ScrollArea className="max-h-[70vh]">
        <div className="space-y-6 pr-4">
          {/* Teams Header */}
          <div className="grid grid-cols-2 gap-4">
            {/* Home Team */}
            <div className="flex flex-col items-center gap-3 p-4 rounded-lg bg-muted/30">
              {(teamALogo || scoreData.homeTeamLogo) && (
                <img 
                  src={teamALogo || scoreData.homeTeamLogo} 
                  alt={scoreData.homeTeam} 
                  className="w-16 h-16 object-contain" 
                />
              )}
              <span className="text-base font-semibold text-center">
                {scoreData.homeTeam}
              </span>
              <div className="text-center">
                <span className="text-3xl font-bold text-primary">
                  {cleanScore(scoreData.homeScore || '-')}
                </span>
                {(homeOvers || scoreData.homeRunRate) && (
                  <div className="flex flex-col gap-1 mt-1">
                    {homeOvers && (
                      <span className="text-sm text-muted-foreground">({homeOvers} ov)</span>
                    )}
                    {scoreData.homeRunRate && (
                      <span className="text-xs text-muted-foreground">RR: {scoreData.homeRunRate}</span>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Away Team */}
            <div className="flex flex-col items-center gap-3 p-4 rounded-lg bg-muted/30">
              {(teamBLogo || scoreData.awayTeamLogo) && (
                <img 
                  src={teamBLogo || scoreData.awayTeamLogo} 
                  alt={scoreData.awayTeam} 
                  className="w-16 h-16 object-contain" 
                />
              )}
              <span className="text-base font-semibold text-center">
                {scoreData.awayTeam}
              </span>
              <div className="text-center">
                <span className="text-3xl font-bold text-primary">
                  {cleanScore(scoreData.awayScore || '-')}
                </span>
                {(awayOvers || scoreData.awayRunRate) && (
                  <div className="flex flex-col gap-1 mt-1">
                    {awayOvers && (
                      <span className="text-sm text-muted-foreground">({awayOvers} ov)</span>
                    )}
                    {scoreData.awayRunRate && (
                      <span className="text-xs text-muted-foreground">RR: {scoreData.awayRunRate}</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Match Info */}
          <div className="space-y-3">
            {scoreData.statusInfo && (
              <div className="text-center p-3 bg-primary/10 rounded-lg">
                <p className="text-sm font-medium">{scoreData.statusInfo}</p>
              </div>
            )}
            
            <div className="flex flex-wrap items-center justify-center gap-2">
              {scoreData.status && (
                <Badge variant="outline">{scoreData.status}</Badge>
              )}
              {scoreData.eventType && (
                <Badge variant="secondary">{scoreData.eventType}</Badge>
              )}
              {scoreData.eventLive && (
                <Badge variant="destructive" className="animate-pulse">LIVE</Badge>
              )}
            </div>

            {scoreData.venue && (
              <p className="text-center text-sm text-muted-foreground">
                Venue: {scoreData.venue}
              </p>
            )}

            {scoreData.toss && (
              <p className="text-center text-xs text-muted-foreground">
                {scoreData.toss}
              </p>
            )}
          </div>

          {/* Batting & Bowling Details */}
          {hasDetailedData && (
            <Tabs defaultValue="batting" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="batting" className="flex items-center gap-2">
                  <User className="w-4 h-4" />
                  Batting
                </TabsTrigger>
                <TabsTrigger value="bowling" className="flex items-center gap-2">
                  <Target className="w-4 h-4" />
                  Bowling
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="batting" className="mt-4">
                {hasBattingData ? (
                  <div className="rounded-lg border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead className="font-semibold">Batter</TableHead>
                          <TableHead className="text-right font-semibold">R</TableHead>
                          <TableHead className="text-right font-semibold">B</TableHead>
                          <TableHead className="text-right font-semibold">4s</TableHead>
                          <TableHead className="text-right font-semibold">6s</TableHead>
                          <TableHead className="text-right font-semibold">SR</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {scoreData.batsmen?.map((batsman: BatsmanData, index: number) => (
                          <TableRow key={index}>
                            <TableCell className="font-medium">
                              <div className="flex flex-col">
                                <span className="text-sm">{batsman.player}</span>
                                {batsman.how_out && batsman.how_out !== 'not out' && (
                                  <span className="text-xs text-muted-foreground truncate max-w-[120px]">
                                    {batsman.how_out}
                                  </span>
                                )}
                                {batsman.how_out === 'not out' && (
                                  <Badge variant="outline" className="w-fit text-xs mt-0.5">not out</Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-right font-semibold">{batsman.runs}</TableCell>
                            <TableCell className="text-right text-muted-foreground">{batsman.balls}</TableCell>
                            <TableCell className="text-right text-muted-foreground">{batsman.fours}</TableCell>
                            <TableCell className="text-right text-muted-foreground">{batsman.sixes}</TableCell>
                            <TableCell className="text-right text-muted-foreground">{batsman.sr}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="text-center py-6 text-muted-foreground text-sm">
                    Batting data not available yet
                  </div>
                )}
              </TabsContent>
              
              <TabsContent value="bowling" className="mt-4">
                {hasBowlingData ? (
                  <div className="rounded-lg border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead className="font-semibold">Bowler</TableHead>
                          <TableHead className="text-right font-semibold">O</TableHead>
                          <TableHead className="text-right font-semibold">M</TableHead>
                          <TableHead className="text-right font-semibold">R</TableHead>
                          <TableHead className="text-right font-semibold">W</TableHead>
                          <TableHead className="text-right font-semibold">Econ</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {scoreData.bowlers?.map((bowler: BowlerData, index: number) => (
                          <TableRow key={index}>
                            <TableCell className="font-medium text-sm">{bowler.player}</TableCell>
                            <TableCell className="text-right text-muted-foreground">{bowler.overs}</TableCell>
                            <TableCell className="text-right text-muted-foreground">{bowler.maidens}</TableCell>
                            <TableCell className="text-right text-muted-foreground">{bowler.runs}</TableCell>
                            <TableCell className="text-right font-semibold">{bowler.wickets}</TableCell>
                            <TableCell className="text-right text-muted-foreground">{bowler.econ}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="text-center py-6 text-muted-foreground text-sm">
                    Bowling data not available yet
                  </div>
                )}
              </TabsContent>
            </Tabs>
          )}

          {!hasDetailedData && scoreData.fromDatabase && (
            <div className="text-center py-4 text-muted-foreground text-sm border rounded-lg bg-muted/20">
              {scoreData.status === 'Finished' 
                ? 'Detailed scorecard is not available for this match'
                : 'Detailed scorecard will be available during the match'}
            </div>
          )}

          {/* Last Updated */}
          {scoreData.lastUpdated && (
            <div className="text-center text-xs text-muted-foreground flex items-center justify-center gap-1">
              <Clock className="w-3 h-3" />
              Last updated: {scoreData.lastUpdated.toLocaleTimeString()}
            </div>
          )}
        </div>
      </ScrollArea>
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-6"
    >
      <Card className="border-border/50 bg-gradient-to-br from-primary/5 to-transparent backdrop-blur overflow-hidden">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Trophy className="w-4 h-4 text-primary" />
              <CardTitle className="text-base font-medium">Live Score</CardTitle>
              {scoreData?.eventLive && (
                <Badge variant="destructive" className="text-xs animate-pulse">LIVE</Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              {matchStatus === 'completed' && (
                <Badge variant="completed" className="text-xs">Completed</Badge>
              )}
              {scoreData?.lastUpdated && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {scoreData.lastUpdated.toLocaleTimeString()}
                </span>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => refetch()}
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
                {/* Home Team */}
                <div className="flex flex-col items-center gap-2 p-3 rounded-lg bg-muted/30 border border-border/30">
                  {(teamALogo || scoreData.homeTeamLogo) && (
                    <img 
                      src={teamALogo || scoreData.homeTeamLogo} 
                      alt={scoreData.homeTeam} 
                      className="w-10 h-10 object-contain" 
                    />
                  )}
                  <span className="text-sm font-medium text-center truncate w-full">
                    {scoreData.homeTeam}
                  </span>
                  <div className="text-center">
                    <span className="text-2xl font-bold text-primary">
                      {cleanScore(scoreData.homeScore)}
                    </span>
                    {(homeOvers || scoreData.homeRunRate) && (
                      <div className="flex flex-col items-center gap-0.5 mt-1">
                        {homeOvers && (
                          <span className="text-xs text-muted-foreground">({homeOvers} ov)</span>
                        )}
                        {scoreData.homeRunRate && (
                          <span className="text-xs text-muted-foreground">(RR: {scoreData.homeRunRate})</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Away Team */}
                <div className="flex flex-col items-center gap-2 p-3 rounded-lg bg-muted/30 border border-border/30">
                  {(teamBLogo || scoreData.awayTeamLogo) && (
                    <img 
                      src={teamBLogo || scoreData.awayTeamLogo} 
                      alt={scoreData.awayTeam} 
                      className="w-10 h-10 object-contain" 
                    />
                  )}
                  <span className="text-sm font-medium text-center truncate w-full">
                    {scoreData.awayTeam}
                  </span>
                  <div className="text-center">
                    <span className="text-2xl font-bold text-primary">
                      {cleanScore(scoreData.awayScore)}
                    </span>
                    {(awayOvers || scoreData.awayRunRate) && (
                      <div className="flex flex-col items-center gap-0.5 mt-1">
                        {awayOvers && (
                          <span className="text-xs text-muted-foreground">({awayOvers} ov)</span>
                        )}
                        {scoreData.awayRunRate && (
                          <span className="text-xs text-muted-foreground">(RR: {scoreData.awayRunRate})</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Match Status */}
              <div className="text-center space-y-2">
                {scoreData.statusInfo && (
                  <p className="text-sm text-muted-foreground">{scoreData.statusInfo}</p>
                )}
                <div className="flex items-center justify-center gap-2 flex-wrap">
                  {scoreData.status && (
                    <Badge variant="outline" className="text-xs">
                      {scoreData.status}
                    </Badge>
                  )}
                  {scoreData.eventType && (
                    <Badge variant="secondary" className="text-xs">
                      {scoreData.eventType}
                    </Badge>
                  )}
                </div>
              </div>

              {/* View Full Scoreboard Button */}
              <Dialog>
                <DialogTrigger asChild>
                  <Button 
                    variant="outline" 
                    className="w-full text-sm"
                    size="sm"
                  >
                    View Full Scoreboard
                    <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <Trophy className="w-5 h-5 text-primary" />
                      Full Scoreboard
                    </DialogTitle>
                  </DialogHeader>
                  {renderFullScoreboard()}
                </DialogContent>
              </Dialog>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </motion.div>
  );
};

export default ApiCricketLiveScore;
