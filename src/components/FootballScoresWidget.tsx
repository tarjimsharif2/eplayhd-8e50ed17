import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { RefreshCw, Trophy, Clock, CheckCircle2 } from 'lucide-react';
import { motion } from 'framer-motion';

interface FootballMatch {
  homeTeam: string;
  awayTeam: string;
  homeScore: number | null;
  awayScore: number | null;
  status: string;
  minute: string | null;
  competition: string;
  matchUrl: string;
  startTime: string;
}

interface LeagueMatches {
  [league: string]: FootballMatch[];
}

const LEAGUE_NAMES: Record<string, string> = {
  epl: 'Premier League',
  laliga: 'La Liga',
  bundesliga: 'Bundesliga',
  seriea: 'Serie A',
  ucl: 'Champions League',
  uel: 'Europa League',
};

const FootballScoresWidget = () => {
  const [matches, setMatches] = useState<LeagueMatches>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('all');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchScores = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('scrape-football-scores', {
        body: { allLeagues: true }
      });

      if (fnError) throw fnError;

      if (data?.success && data?.results) {
        setMatches(data.results);
        setLastUpdated(new Date());
      } else if (data?.error) {
        setError(data.error);
      }
    } catch (err) {
      console.error('Failed to fetch football scores:', err);
      setError('Failed to load scores');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchScores();
    // Auto-refresh every 60 seconds
    const interval = setInterval(fetchScores, 60000);
    return () => clearInterval(interval);
  }, []);

  const getAllMatches = (): FootballMatch[] => {
    return Object.values(matches).flat();
  };

  const getLiveMatches = (): FootballMatch[] => {
    return getAllMatches().filter(m => m.status === 'Live' || m.status === 'Half Time');
  };

  const getRecentMatches = (): FootballMatch[] => {
    return getAllMatches().filter(m => m.status === 'Completed');
  };

  const getUpcomingMatches = (): FootballMatch[] => {
    return getAllMatches().filter(m => m.status === 'Scheduled');
  };

  const getDisplayMatches = (): FootballMatch[] => {
    switch (activeTab) {
      case 'live':
        return getLiveMatches();
      case 'recent':
        return getRecentMatches();
      case 'upcoming':
        return getUpcomingMatches();
      default:
        return getAllMatches();
    }
  };

  const liveCount = getLiveMatches().length;

  const getStatusBadge = (match: FootballMatch) => {
    if (match.status === 'Live') {
      return (
        <Badge className="bg-red-500/20 text-red-500 border-red-500/30 animate-pulse">
          <span className="w-1.5 h-1.5 bg-red-500 rounded-full mr-1.5" />
          {match.minute || 'LIVE'}
        </Badge>
      );
    }
    if (match.status === 'Half Time') {
      return (
        <Badge className="bg-amber-500/20 text-amber-500 border-amber-500/30">
          HT
        </Badge>
      );
    }
    if (match.status === 'Completed') {
      return (
        <Badge variant="outline" className="text-muted-foreground">
          <CheckCircle2 className="w-3 h-3 mr-1" />
          FT
        </Badge>
      );
    }
    if (match.status === 'Scheduled') {
      return (
        <Badge variant="outline" className="text-primary">
          <Clock className="w-3 h-3 mr-1" />
          {new Date(match.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Badge>
      );
    }
    return <Badge variant="outline">{match.status}</Badge>;
  };

  const displayMatches = getDisplayMatches();

  return (
    <section className="container mx-auto px-4 py-8">
      <Card className="border-border/50 bg-card/80 backdrop-blur overflow-hidden">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-500/20 to-emerald-500/20 flex items-center justify-center border border-green-500/30">
                <Trophy className="w-5 h-5 text-green-500" />
              </div>
              <div>
                <CardTitle className="text-lg font-semibold flex items-center gap-2">
                  Football Scores
                  {liveCount > 0 && (
                    <Badge className="bg-red-500/20 text-red-500 border-red-500/30 text-xs">
                      {liveCount} LIVE
                    </Badge>
                  )}
                </CardTitle>
                {lastUpdated && (
                  <p className="text-xs text-muted-foreground">
                    Updated {lastUpdated.toLocaleTimeString()}
                  </p>
                )}
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={fetchScores}
              disabled={isLoading}
              className="h-8"
            >
              <RefreshCw className={`w-4 h-4 mr-1 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </CardHeader>

        <CardContent className="pt-0">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-4 mb-4">
              <TabsTrigger value="all" className="text-xs">All</TabsTrigger>
              <TabsTrigger value="live" className="text-xs">
                Live {liveCount > 0 && `(${liveCount})`}
              </TabsTrigger>
              <TabsTrigger value="recent" className="text-xs">Recent</TabsTrigger>
              <TabsTrigger value="upcoming" className="text-xs">Upcoming</TabsTrigger>
            </TabsList>

            <TabsContent value={activeTab} className="mt-0">
              {isLoading && displayMatches.length === 0 ? (
                <div className="flex items-center justify-center py-12">
                  <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : error ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p>{error}</p>
                  <Button variant="link" onClick={fetchScores} className="mt-2">
                    Try again
                  </Button>
                </div>
              ) : displayMatches.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p>No matches found</p>
                </div>
              ) : (
                <div className="grid gap-3 max-h-[500px] overflow-y-auto pr-1">
                  {displayMatches.slice(0, 15).map((match, index) => (
                    <motion.div
                      key={`${match.homeTeam}-${match.awayTeam}-${index}`}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.03 }}
                    >
                      <a
                        href={match.matchUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block"
                      >
                        <div className="p-3 rounded-lg bg-background/50 border border-border/50 hover:border-primary/30 hover:bg-background/80 transition-all group">
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium truncate">
                              {match.competition}
                            </span>
                            {getStatusBadge(match)}
                          </div>
                          
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2 mb-1">
                                <span className="text-sm font-medium truncate group-hover:text-primary transition-colors">
                                  {match.homeTeam}
                                </span>
                                <span className={`text-lg font-bold tabular-nums ${
                                  match.status === 'Live' || match.status === 'Half Time' 
                                    ? 'text-primary' 
                                    : 'text-foreground'
                                }`}>
                                  {match.homeScore ?? '-'}
                                </span>
                              </div>
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-sm font-medium truncate group-hover:text-primary transition-colors">
                                  {match.awayTeam}
                                </span>
                                <span className={`text-lg font-bold tabular-nums ${
                                  match.status === 'Live' || match.status === 'Half Time' 
                                    ? 'text-primary' 
                                    : 'text-foreground'
                                }`}>
                                  {match.awayScore ?? '-'}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </a>
                    </motion.div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </section>
  );
};

export default FootballScoresWidget;
