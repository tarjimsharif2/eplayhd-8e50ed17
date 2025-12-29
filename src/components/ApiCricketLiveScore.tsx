import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

import { useApiCricketScore } from '@/hooks/useApiCricketScore';
import { Clock, AlertCircle, Trophy, User, Target, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

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
  const [isExpanded, setIsExpanded] = useState(false);
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

  // Get raw overs - first from API field, then try parsing from score
  const rawHomeOvers = scoreData?.homeOvers || (scoreData?.homeScore ? parseScoreOvers(scoreData.homeScore) : null);
  const rawAwayOvers = scoreData?.awayOvers || (scoreData?.awayScore ? parseScoreOvers(scoreData.awayScore) : null);

  // Clean score to just show runs/wickets
  const cleanScore = (score: string) => {
    return score.replace(/\s*\(\d+\.?\d*\s*ov\)/, '').trim();
  };

  // Helper function to determine if teamA matches the API's home team
  const getTeamAMatchesHome = () => {
    if (!scoreData) return true;
    const homeTeamNameLower = scoreData.homeTeam?.toLowerCase() || '';
    const teamANameLower = teamAName?.toLowerCase() || '';
    return homeTeamNameLower.includes(teamANameLower.split(' ')[0]) || 
           teamANameLower.includes(homeTeamNameLower.split(' ')[0]);
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
      <div className="space-y-4">
          {/* Venue & Toss Info */}
          <div className="space-y-2">
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

          {/* Team Selection Tabs with Batting & Bowling */}
          {hasDetailedData && (
            (() => {
              // Get unique innings/teams
              const inningsSet = new Set<string>();
              scoreData.batsmen?.forEach(b => b.innings && inningsSet.add(b.innings));
              scoreData.bowlers?.forEach(b => b.innings && inningsSet.add(b.innings));
              const innings = Array.from(inningsSet);

              // Build team data with scores
              const getTeamData = () => {
                if (innings.length > 0) {
                  return innings.map((inning, i) => {
                    const teamName = inning.replace(/ \d+ INN$/, '');
                    // Try to match team score and overs
                    const isHomeTeam = teamName.toLowerCase().includes(scoreData.homeTeam?.toLowerCase().split(' ')[0] || '');
                    const score = isHomeTeam ? scoreData.homeScore : scoreData.awayScore;
                    const overs = isHomeTeam ? rawHomeOvers : rawAwayOvers;
                    return {
                      name: teamName,
                      label: inning.match(/\d+ INN/)?.[0] || 'Innings',
                      score: score || '',
                      overs: overs || null,
                      batsmen: scoreData.batsmen?.filter(b => b.innings === inning) || [],
                      bowlers: scoreData.bowlers?.filter(b => b.innings === inning) || [],
                    };
                  });
                }
                // Fallback: use team names
                return [
                  {
                    name: scoreData.homeTeam || 'Team A',
                    label: '1st Innings',
                    score: scoreData.homeScore || '',
                    overs: rawHomeOvers || null,
                    batsmen: scoreData.batsmen?.filter(b => 
                      b.team?.toLowerCase().includes(scoreData.homeTeam?.toLowerCase() || '') || !b.team
                    ) || [],
                    bowlers: scoreData.bowlers?.filter(b => 
                      !b.team?.toLowerCase().includes(scoreData.homeTeam?.toLowerCase() || '')
                    ) || [],
                  },
                  {
                    name: scoreData.awayTeam || 'Team B',
                    label: '2nd Innings',
                    score: scoreData.awayScore || '',
                    overs: rawAwayOvers || null,
                    batsmen: scoreData.batsmen?.filter(b => 
                      b.team?.toLowerCase().includes(scoreData.awayTeam?.toLowerCase() || '')
                    ) || [],
                    bowlers: scoreData.bowlers?.filter(b => 
                      b.team?.toLowerCase().includes(scoreData.homeTeam?.toLowerCase() || '')
                    ) || [],
                  },
                ].filter(t => t.batsmen.length > 0 || t.bowlers.length > 0);
              };

              const teams = getTeamData();
              if (teams.length === 0) return null;

              return (
                <Tabs defaultValue="team-0" className="w-full">
                  <TabsList className="grid w-full h-10" style={{ gridTemplateColumns: `repeat(${teams.length}, 1fr)` }}>
                    {teams.map((team, idx) => (
                      <TabsTrigger key={idx} value={`team-${idx}`} className="text-xs px-2">
                        <span className="truncate">{team.name}</span>
                      </TabsTrigger>
                    ))}
                  </TabsList>

                  {teams.map((team, idx) => (
                    <TabsContent key={idx} value={`team-${idx}`} className="mt-3 space-y-4">
                      {/* Batting Section */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <User className="w-4 h-4 text-primary" />
                            <span className="font-semibold text-sm">Batting</span>
                            {team.label && (
                              <Badge variant="outline" className="text-[10px]">{team.label}</Badge>
                            )}
                          </div>
                          <span className="text-sm font-bold text-primary">
                            {cleanScore(team.score || '-')}
                            {team.overs && ` (${team.overs} ov)`}
                          </span>
                        </div>
                        {team.batsmen.length > 0 ? (
                          (() => {
                            // Calculate totals
                            const totalRuns = team.batsmen.reduce((sum, b) => sum + (parseInt(b.runs) || 0), 0);
                            const totalBalls = team.batsmen.reduce((sum, b) => sum + (parseInt(b.balls) || 0), 0);
                            const totalFours = team.batsmen.reduce((sum, b) => sum + (parseInt(b.fours) || 0), 0);
                            const totalSixes = team.batsmen.reduce((sum, b) => sum + (parseInt(b.sixes) || 0), 0);
                            const wickets = team.batsmen.filter(b => b.how_out && b.how_out !== 'not out').length;
                            const overs = (totalBalls / 6).toFixed(1);
                            
                            // Get extras data from scoreData if available for this team/innings
                            const extrasData = scoreData?.extras?.find(e => 
                              e.innings === team.label || 
                              (e.innings && team.name && e.innings.toLowerCase().includes(team.name.toLowerCase().split(' ')[0])) ||
                              e.team?.toLowerCase().includes(team.name.toLowerCase().split(' ')[0])
                            );
                            const extras = extrasData || { wides: 0, noballs: 0, byes: 0, legbyes: 0, total: 0 };
                            const extrasTotal = extras.total || (extras.wides + extras.noballs + extras.byes + extras.legbyes);

                            return (
                              <div className="rounded-lg border overflow-x-auto">
                                <Table>
                                  <TableHeader>
                                    <TableRow className="bg-muted/50">
                                      <TableHead className="font-semibold text-xs whitespace-nowrap min-w-[100px]">Batter</TableHead>
                                      <TableHead className="text-right font-semibold text-xs px-1 w-8">R</TableHead>
                                      <TableHead className="text-right font-semibold text-xs px-1 w-8">B</TableHead>
                                      <TableHead className="text-right font-semibold text-xs px-1 w-8">4s</TableHead>
                                      <TableHead className="text-right font-semibold text-xs px-1 w-8">6s</TableHead>
                                      <TableHead className="text-right font-semibold text-xs px-1 w-10">SR</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {team.batsmen.map((batsman, bIdx) => (
                                      <TableRow key={bIdx}>
                                        <TableCell className="py-2 px-2">
                                          <div className="flex flex-col">
                                            <span className="text-xs font-medium truncate max-w-[100px]">{batsman.player}</span>
                                            {batsman.how_out && batsman.how_out !== 'not out' && (
                                              <span className="text-[10px] text-muted-foreground truncate max-w-[100px]">{batsman.how_out}</span>
                                            )}
                                            {batsman.how_out === 'not out' && (
                                              <span className="text-[10px] text-green-500">not out</span>
                                            )}
                                          </div>
                                        </TableCell>
                                        <TableCell className="text-right font-semibold text-xs py-2 px-1">{batsman.runs}</TableCell>
                                        <TableCell className="text-right text-muted-foreground text-xs py-2 px-1">{batsman.balls}</TableCell>
                                        <TableCell className="text-right text-muted-foreground text-xs py-2 px-1">{batsman.fours}</TableCell>
                                        <TableCell className="text-right text-muted-foreground text-xs py-2 px-1">{batsman.sixes}</TableCell>
                                        <TableCell className="text-right text-muted-foreground text-xs py-2 px-1">{batsman.sr}</TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              </div>
                            );
                          })()
                        ) : (
                          <div className="text-center py-4 text-muted-foreground text-xs border rounded-lg">No batting data</div>
                        )}
                      </div>

                      {/* Bowling Section */}
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Target className="w-4 h-4 text-primary" />
                          <span className="font-semibold text-sm">Bowling</span>
                        </div>
                        {team.bowlers.length > 0 ? (
                          <div className="rounded-lg border overflow-x-auto">
                            <Table>
                              <TableHeader>
                                <TableRow className="bg-muted/50">
                                  <TableHead className="font-semibold text-xs whitespace-nowrap min-w-[100px]">Bowler</TableHead>
                                  <TableHead className="text-right font-semibold text-xs px-1 w-8">O</TableHead>
                                  <TableHead className="text-right font-semibold text-xs px-1 w-8">M</TableHead>
                                  <TableHead className="text-right font-semibold text-xs px-1 w-8">R</TableHead>
                                  <TableHead className="text-right font-semibold text-xs px-1 w-8">W</TableHead>
                                  <TableHead className="text-right font-semibold text-xs px-1 w-10">Econ</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {team.bowlers.map((bowler, bwIdx) => (
                                  <TableRow key={bwIdx}>
                                    <TableCell className="text-xs font-medium py-2 px-2 truncate max-w-[100px]">{bowler.player}</TableCell>
                                    <TableCell className="text-right text-muted-foreground text-xs py-2 px-1">{bowler.overs}</TableCell>
                                    <TableCell className="text-right text-muted-foreground text-xs py-2 px-1">{bowler.maidens}</TableCell>
                                    <TableCell className="text-right text-muted-foreground text-xs py-2 px-1">{bowler.runs}</TableCell>
                                    <TableCell className="text-right font-semibold text-xs py-2 px-1">{bowler.wickets}</TableCell>
                                    <TableCell className="text-right text-muted-foreground text-xs py-2 px-1">{bowler.econ}</TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        ) : (
                          <div className="text-center py-4 text-muted-foreground text-xs border rounded-lg">No bowling data</div>
                        )}
                      </div>
                    </TabsContent>
                  ))}
                </Tabs>
              );
            })()
          )}

          {!hasDetailedData && scoreData.fromDatabase && (
            <div className="text-center py-4 text-muted-foreground text-sm border rounded-lg bg-muted/20">
              {scoreData.status === 'Finished' 
                ? 'Detailed scorecard is not available for this match'
                : 'Detailed scorecard will be available during the match'}
            </div>
          )}
        </div>
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
              {/* Compact Score Summary - Show correct scores based on team name matching from batsmen/bowlers data */}
              {(() => {
                // Extract unique team names from batsmen/bowlers data for accurate matching
                const getTeamNamesFromScorecard = (): string[] => {
                  const teams = new Set<string>();
                  if (scoreData.batsmen) {
                    scoreData.batsmen.forEach(b => {
                      if (b.team) teams.add(b.team);
                    });
                  }
                  if (scoreData.bowlers) {
                    scoreData.bowlers.forEach(b => {
                      if (b.team) teams.add(b.team);
                    });
                  }
                  return Array.from(teams);
                };

                // Find best matching team name from scorecard
                const findBestMatch = (teamName: string, scorecardTeams: string[]): string | null => {
                  const teamLower = teamName?.toLowerCase().trim() || '';
                  const teamFirst = teamLower.split(' ')[0];
                  
                  for (const apiTeam of scorecardTeams) {
                    const apiLower = apiTeam.toLowerCase().trim();
                    const apiFirst = apiLower.split(' ')[0];
                    
                    // Match by first word
                    if (teamFirst === apiFirst) return apiTeam;
                    // Match if one contains the other
                    if (apiLower.includes(teamFirst) || teamLower.includes(apiFirst)) return apiTeam;
                  }
                  return null;
                };

                // Get score for a team from innings data
                const getScoreFromInnings = (teamName: string, scorecardTeams: string[]): { score: string; overs: string | null } => {
                  const matchedTeam = findBestMatch(teamName, scorecardTeams);
                  
                  if (matchedTeam && scoreData.batsmen && scoreData.batsmen.length > 0) {
                    // Find batsmen for this team and extract innings info
                    const teamBatsmen = scoreData.batsmen.filter(b => b.team === matchedTeam);
                    if (teamBatsmen.length > 0 && teamBatsmen[0].innings) {
                      const inningsName = teamBatsmen[0].innings;
                      // Check if this matches home or away from API
                      const homeTeamLower = scoreData.homeTeam?.toLowerCase() || '';
                      const awayTeamLower = scoreData.awayTeam?.toLowerCase() || '';
                      const matchedLower = matchedTeam.toLowerCase();
                      
                      if (matchedLower.includes(homeTeamLower.split(' ')[0]) || homeTeamLower.includes(matchedLower.split(' ')[0])) {
                        return { score: scoreData.homeScore || '', overs: rawHomeOvers };
                      }
                      if (matchedLower.includes(awayTeamLower.split(' ')[0]) || awayTeamLower.includes(matchedLower.split(' ')[0])) {
                        return { score: scoreData.awayScore || '', overs: rawAwayOvers };
                      }
                    }
                  }
                  
                  // Fallback: try matching with home/away team names directly
                  const teamLower = teamName?.toLowerCase().trim() || '';
                  const teamFirst = teamLower.split(' ')[0];
                  const homeFirst = (scoreData.homeTeam?.toLowerCase() || '').split(' ')[0];
                  const awayFirst = (scoreData.awayTeam?.toLowerCase() || '').split(' ')[0];
                  
                  if (teamFirst === homeFirst) {
                    return { score: scoreData.homeScore || '', overs: rawHomeOvers };
                  }
                  if (teamFirst === awayFirst) {
                    return { score: scoreData.awayScore || '', overs: rawAwayOvers };
                  }
                  
                  return { score: '', overs: null };
                };

                const scorecardTeams = getTeamNamesFromScorecard();
                const teamAScore = getScoreFromInnings(teamAName, scorecardTeams);
                const teamBScore = getScoreFromInnings(teamBName, scorecardTeams);

                return (
                  <div className="grid grid-cols-2 gap-3">
                    {/* Team A */}
                    <div className="flex flex-col items-center gap-2 p-3 rounded-lg bg-muted/30 border border-border/30">
                      {teamALogo && (
                        <img src={teamALogo} alt={teamAName} className="w-10 h-10 object-contain" />
                      )}
                      <span className="text-sm font-medium text-center truncate w-full">{teamAName}</span>
                      <div className="text-center">
                        <div className="flex items-baseline justify-center gap-1">
                          <span className="text-2xl font-bold text-primary">{cleanScore(teamAScore.score) || '-'}</span>
                          {teamAScore.overs && <span className="text-xs text-muted-foreground">({teamAScore.overs} ov)</span>}
                        </div>
                      </div>
                    </div>
                    {/* Team B */}
                    <div className="flex flex-col items-center gap-2 p-3 rounded-lg bg-muted/30 border border-border/30">
                      {teamBLogo && (
                        <img src={teamBLogo} alt={teamBName} className="w-10 h-10 object-contain" />
                      )}
                      <span className="text-sm font-medium text-center truncate w-full">{teamBName}</span>
                      <div className="text-center">
                        <div className="flex items-baseline justify-center gap-1">
                          <span className="text-2xl font-bold text-primary">{cleanScore(teamBScore.score) || '-'}</span>
                          {teamBScore.overs && <span className="text-xs text-muted-foreground">({teamBScore.overs} ov)</span>}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Match Status */}
              {scoreData.statusInfo && (
                <div className="text-center p-2 bg-primary/10 rounded-lg">
                  <p className="text-sm font-medium">{scoreData.statusInfo}</p>
                </div>
              )}
              
              <div className="flex items-center justify-center gap-2 flex-wrap">
                {scoreData.status && <Badge variant="outline" className="text-xs">{scoreData.status}</Badge>}
                {scoreData.eventType && <Badge variant="secondary" className="text-xs">{scoreData.eventType}</Badge>}
                {scoreData.eventLive && <Badge variant="destructive" className="text-xs animate-pulse">LIVE</Badge>}
              </div>

              {/* Collapsible Full Scoreboard */}
              <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
                <CollapsibleTrigger asChild>
                  <Button 
                    variant="outline" 
                    className="w-full text-sm justify-between"
                    size="sm"
                  >
                    <span className="flex items-center gap-2">
                      <Trophy className="w-4 h-4" />
                      {isExpanded ? 'Hide Full Scoreboard' : 'View Full Scoreboard'}
                    </span>
                    {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                        className="mt-4 border-t border-border/30 pt-4"
                      >
                        {renderFullScoreboard()}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </CollapsibleContent>
              </Collapsible>

              {/* Last Updated */}
              {scoreData.lastUpdated && (
                <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground pt-2 border-t border-border/30">
                  <Clock className="w-3 h-3" />
                  <span>Last updated: {new Date(scoreData.lastUpdated).toLocaleTimeString()}</span>
                </div>
              )}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </motion.div>
  );
};

export default ApiCricketLiveScore;
