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
    const oversMatch = score?.match(/\((\d+\.?\d*)\s*ov\)/);
    return oversMatch ? oversMatch[1] : null;
  };

  // Normalize team name for matching
  const normalizeTeamName = (name: string): string => {
    return (name || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
  };

  // Check if two team names match - STRICT matching requiring BOTH first AND last words
  // e.g., "Melbourne Stars" should NOT match "Melbourne Renegades"
  // Also prevents short codes like "SYL", "CHA" from incorrectly matching
  const teamsMatch = (name1: string, name2: string): boolean => {
    const n1 = normalizeTeamName(name1);
    const n2 = normalizeTeamName(name2);
    
    if (!n1 || !n2) return false;
    
    // Exact match
    if (n1 === n2) return true;
    
    const words1 = n1.split(' ').filter(w => w.length > 0);
    const words2 = n2.split(' ').filter(w => w.length > 0);
    
    // If either is a short code (3 chars or less, single word), DON'T match
    // Short codes like "SYL", "CHA", "MI" are too ambiguous for reliable matching
    if ((words1.length === 1 && n1.length <= 3) || (words2.length === 1 && n2.length <= 3)) {
      return false;
    }
    
    // Get first and last words
    const firstWord1 = words1[0];
    const lastWord1 = words1[words1.length - 1];
    const firstWord2 = words2[0];
    const lastWord2 = words2[words2.length - 1];
    
    // If both have 2+ words, BOTH first AND last words must match
    if (words1.length >= 2 && words2.length >= 2) {
      return firstWord1 === firstWord2 && lastWord1 === lastWord2;
    }
    
    // If one is single word (4+ chars), check if it matches either first or last word of the other
    // The single word must be at least 4 characters to be reliable
    if (words1.length === 1 && n1.length >= 4) {
      return firstWord2 === words1[0] || lastWord2 === words1[0];
    }
    if (words2.length === 1 && n2.length >= 4) {
      return firstWord1 === words2[0] || lastWord1 === words2[0];
    }
    
    return false;
  };

  // Calculate innings stats: runs from batsmen, overs from bowlers
  // Team names come from the innings key (e.g., "Sydney Thunder 1 INN")
  interface InningsStats {
    inningsName: string;
    teamName: string;
    totalRuns: number;
    wickets: number;
    overs: string;
    score: string;
  }

  const calculateInningsStats = (): InningsStats[] => {
    if (!scoreData?.batsmen || scoreData.batsmen.length === 0) return [];
    
    const stats: InningsStats[] = [];
    const uniqueInnings = [...new Set(scoreData.batsmen.map(b => b.innings).filter(Boolean))];
    
    for (const inningsName of uniqueInnings) {
      const inningsBatsmen = scoreData.batsmen.filter(b => b.innings === inningsName);
      // Team name is extracted from the innings key (e.g., "Sydney Thunder 1 INN" -> "Sydney Thunder")
      const teamName = inningsName.replace(/ \d+ INN$/i, '').trim();
      
      // Find extras data for this innings - contains API total and extras breakdown
      const inningsExtras = scoreData?.extras?.find(e => 
        e.innings === inningsName || 
        (e.team && teamName.toLowerCase().includes((e.team as string).toLowerCase().split(' ')[0]))
      ) as any;
      
      // Calculate wickets from batsmen data
      let wickets = 0;
      inningsBatsmen.forEach(b => {
        if (b.how_out && b.how_out.toLowerCase() !== 'not out') {
          wickets++;
        }
      });
      
      // Use API's total_runs if available (most accurate), otherwise calculate from batsmen + extras
      let totalRuns: number;
      if (inningsExtras?.total_runs && inningsExtras.total_runs > 0) {
        // API provides the correct innings total
        totalRuns = inningsExtras.total_runs;
      } else {
        // Fallback: calculate from batsmen runs + extras
        let batsmenRuns = 0;
        inningsBatsmen.forEach(b => {
          batsmenRuns += parseInt(b.runs) || 0;
        });
        
        const extrasTotal = inningsExtras?.total || 
          ((inningsExtras?.wides || 0) + (inningsExtras?.noballs || 0) + 
           (inningsExtras?.byes || 0) + (inningsExtras?.legbyes || 0));
        
        totalRuns = batsmenRuns + extrasTotal;
      }
      
      // Calculate overs from BOWLERS data for this innings
      const inningsBowlers = scoreData?.bowlers?.filter(b => b.innings === inningsName) || [];
      let totalBalls = 0;
      
      inningsBowlers.forEach(b => {
        const overs = parseFloat(b.overs) || 0;
        const fullOvers = Math.floor(overs);
        const balls = Math.round((overs - fullOvers) * 10);
        totalBalls += (fullOvers * 6) + balls;
      });
      
      const fullOvers = Math.floor(totalBalls / 6);
      const remainingBalls = totalBalls % 6;
      const oversStr = totalBalls > 0 
        ? (remainingBalls > 0 ? `${fullOvers}.${remainingBalls}` : `${fullOvers}`)
        : null;
      
      // Format score as "runs/wickets"
      const scoreStr = `${totalRuns}/${wickets}`;
      
      stats.push({
        inningsName,
        teamName,
        totalRuns,
        wickets,
        overs: oversStr || '0',
        score: scoreStr,
      });
    }
    
    return stats;
  };

  // Get calculated innings stats
  const inningsStats = calculateInningsStats();

  // Get score for a team by matching team name with innings team name from scorecard
  // NOT using home/away at all - direct match with player data
  const getTeamScoreFromInnings = (teamName: string): { score: string | null; overs: string | null; allScores: string[] } => {
    const allScores: string[] = [];
    let latestScore: string | null = null;
    let latestOvers: string | null = null;
    
    for (const stats of inningsStats) {
      // Match using team name from innings (e.g., "Sydney Thunder" from "Sydney Thunder 1 INN")
      if (teamsMatch(stats.teamName, teamName)) {
        allScores.push(stats.score + (stats.overs !== '0' ? ` (${stats.overs} ov)` : ''));
        // Use the innings with actual data
        if (stats.totalRuns > 0 || stats.wickets > 0) {
          latestScore = stats.score;
          latestOvers = stats.overs !== '0' ? stats.overs : null;
        }
      }
    }
    
    return { score: latestScore, overs: latestOvers, allScores };
  };

  // Clean score to just show runs/wickets - moved before getDisplayScores to avoid hoisting issue
  const cleanScore = (score: string) => {
    return score?.replace(/\s*\(\d+\.?\d*\s*ov\)/, '').trim() || '';
  };

  // Get scores for display - hook now returns correctly mapped homeScore=teamA, awayScore=teamB
  // Use innings data for detailed scorecard display, but scores are already correctly mapped
  const getDisplayScores = () => {
    // First try to get scores from calculated innings stats (for detailed multi-innings display)
    if (inningsStats.length > 0) {
      const teamAScore = getTeamScoreFromInnings(teamAName);
      const teamBScore = getTeamScoreFromInnings(teamBName);
      
      // If we got valid scores from innings, use them
      if (teamAScore.score || teamBScore.score) {
        return {
          teamA: teamAScore,
          teamB: teamBScore,
        };
      }
    }
    
    // Use homeScore/awayScore directly - they are now correctly mapped to teamA/teamB by the hook
    if (scoreData?.homeScore || scoreData?.awayScore) {
      // IMPORTANT: Check if score is empty string and treat as missing
      const hasTeamAScore = scoreData?.homeScore && scoreData.homeScore.trim() !== '';
      const hasTeamBScore = scoreData?.awayScore && scoreData.awayScore.trim() !== '';
      
      const teamAOvers = parseScoreOvers(scoreData?.homeScore || '') || scoreData?.homeOvers || null;
      const teamBOvers = parseScoreOvers(scoreData?.awayScore || '') || scoreData?.awayOvers || null;
      
      return {
        teamA: {
          score: hasTeamAScore ? cleanScore(scoreData.homeScore) : '-',
          overs: hasTeamAScore ? teamAOvers : null,
          allScores: hasTeamAScore ? [scoreData.homeScore] : [],
        },
        teamB: {
          score: hasTeamBScore ? cleanScore(scoreData.awayScore) : '-',
          overs: hasTeamBScore ? teamBOvers : null,
          allScores: hasTeamBScore ? [scoreData.awayScore] : [],
        },
      };
    }
    
    // No scores available
    return {
      teamA: { score: null, overs: null, allScores: [] },
      teamB: { score: null, overs: null, allScores: [] },
    };
  };

  const displayScores = getDisplayScores();
  const teamACalc = displayScores.teamA;
  const teamBCalc = displayScores.teamB;

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

              // Build team data with scores - use innings data directly
              const getTeamData = () => {
                if (innings.length > 0) {
                  return innings.map((inning, i) => {
                    const teamName = inning.replace(/ \d+ INN$/i, '').trim();
                    
                    // Calculate score and overs from batsmen/bowlers for this innings
                    const inningsBatsmen = scoreData.batsmen?.filter(b => b.innings === inning) || [];
                    const inningsBowlers = scoreData.bowlers?.filter(b => b.innings === inning) || [];
                    
                    // Find extras for this innings - contains API total and extras breakdown
                    const inningsExtras = scoreData.extras?.find(e => 
                      e.innings === inning || 
                      (e.team && teamName.toLowerCase().includes(e.team.toLowerCase().split(' ')[0]))
                    ) as any;
                    
                    const wickets = inningsBatsmen.filter(b => b.how_out && b.how_out.toLowerCase() !== 'not out').length;
                    
                    // Use API's total_runs if available (most accurate), otherwise calculate from batsmen + extras
                    let totalRuns: number;
                    if (inningsExtras?.total_runs && inningsExtras.total_runs > 0) {
                      totalRuns = inningsExtras.total_runs;
                    } else {
                      const batsmenRuns = inningsBatsmen.reduce((sum, b) => sum + (parseInt(b.runs) || 0), 0);
                      const extrasTotal = inningsExtras?.total || 
                        ((inningsExtras?.wides || 0) + (inningsExtras?.noballs || 0) + 
                         (inningsExtras?.byes || 0) + (inningsExtras?.legbyes || 0));
                      totalRuns = batsmenRuns + extrasTotal;
                    }
                    
                    // Calculate overs from bowlers
                    let totalBalls = 0;
                    inningsBowlers.forEach(b => {
                      const overs = parseFloat(b.overs) || 0;
                      const fullOvers = Math.floor(overs);
                      const balls = Math.round((overs - fullOvers) * 10);
                      totalBalls += (fullOvers * 6) + balls;
                    });
                    
                    const fullOvers = Math.floor(totalBalls / 6);
                    const remainingBalls = totalBalls % 6;
                    const oversStr = totalBalls > 0 
                      ? (remainingBalls > 0 ? `${fullOvers}.${remainingBalls}` : `${fullOvers}`)
                      : null;
                    
                    return {
                      name: teamName,
                      label: inning.match(/\d+ INN/)?.[0] || 'Innings',
                      score: `${totalRuns}/${wickets}`,
                      overs: oversStr,
                      batsmen: inningsBatsmen,
                      bowlers: inningsBowlers,
                    };
                  });
                }
                return [];
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
                            
                            // Get extras data from scoreData - match by innings name or team name
                            const extrasData = scoreData?.extras?.find(e => {
                              // Direct innings match (e.g., "Pretoria Capitals 1 INN")
                              if (e.innings && team.batsmen[0]?.innings && e.innings === team.batsmen[0].innings) {
                                return true;
                              }
                              // Match by team name in innings
                              if (e.innings && e.innings.toLowerCase().includes(team.name.toLowerCase().split(' ')[0])) {
                                return true;
                              }
                              // Match by team field
                              if (e.team && teamsMatch(e.team, team.name)) {
                                return true;
                              }
                              return false;
                            });
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
                                    {/* Extras Row */}
                                    <TableRow className="bg-muted/30 border-t">
                                      <TableCell className="py-2 px-2">
                                        <span className="text-xs font-medium">Extras</span>
                                      </TableCell>
                                      <TableCell className="text-right font-semibold text-xs py-2 px-1">{extrasTotal}</TableCell>
                                      <TableCell className="text-right text-muted-foreground text-xs py-2 px-1" colSpan={4}></TableCell>
                                    </TableRow>
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
                                    <TableCell className="text-right text-muted-foreground text-xs py-2 px-1">{parseFloat(bowler.overs).toFixed(1)}</TableCell>
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
              {/* Compact Score Summary - Use calculated scores from innings data */}
              <div className="grid grid-cols-2 gap-3">
                {/* Team A */}
                <div className="flex flex-col items-center gap-2 p-3 rounded-lg bg-muted/30 border border-border/30">
                  {teamALogo && (
                    <img src={teamALogo} alt={teamAName} className="w-10 h-10 object-contain" />
                  )}
                  <span className="text-sm font-medium text-center truncate w-full">{teamAName}</span>
                  <div className="text-center">
                    <div className="flex items-baseline justify-center gap-1">
                      <span className="text-2xl font-bold text-primary">{teamACalc.score || '-'}</span>
                      {teamACalc.overs && <span className="text-xs text-muted-foreground">({teamACalc.overs} ov)</span>}
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
                      <span className="text-2xl font-bold text-primary">{teamBCalc.score || '-'}</span>
                      {teamBCalc.overs && <span className="text-xs text-muted-foreground">({teamBCalc.overs} ov)</span>}
                    </div>
                  </div>
                </div>
              </div>

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
