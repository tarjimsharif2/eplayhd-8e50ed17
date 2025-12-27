import { useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import SEOHead from '@/components/SEOHead';
import AdSlot from '@/components/AdSlot';
import MatchCard from '@/components/MatchCard';
import PointsTable from '@/components/PointsTable';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { Tournament, Match } from '@/hooks/useSportsData';
import { useSiteSettings } from '@/hooks/useSiteSettings';
import { Trophy, Calendar, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';

const TournamentPage = () => {
  const { slug } = useParams<{ slug: string }>();
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  
  const { data: siteSettings } = useSiteSettings();

  // Scroll to top when tournament page loads
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [slug]);

  useEffect(() => {
    const fetchTournament = async () => {
      if (!slug) return;
      
      // Try to find by slug first, then by id
      let { data: tournamentData, error } = await supabase
        .from('tournaments')
        .select('*')
        .eq('slug', slug)
        .maybeSingle();
      
      if (!tournamentData) {
        // Try by ID
        const { data: byId, error: idError } = await supabase
          .from('tournaments')
          .select('*')
          .eq('id', slug)
          .maybeSingle();
        
        tournamentData = byId;
        error = idError;
      }

      if (error) {
        console.error('Error fetching tournament:', error);
        setLoading(false);
        return;
      }
      
      if (tournamentData) {
        setTournament(tournamentData as Tournament);
        
        // Fetch matches for this tournament
        const { data: matchesData, error: matchesError } = await supabase
          .from('matches')
          .select(`
            *,
            tournament:tournaments(*),
            team_a:teams!matches_team_a_id_fkey(*),
            team_b:teams!matches_team_b_id_fkey(*),
            sport:sports(*)
          `)
          .eq('tournament_id', tournamentData.id)
          .order('match_date', { ascending: true })
          .order('match_time', { ascending: true });
        
        if (!matchesError && matchesData) {
          setMatches(matchesData as Match[]);
        }
      }
      
      setLoading(false);
    };

    fetchTournament();
  }, [slug]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!tournament) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Header />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <h1 className="font-display text-3xl text-gradient mb-4">Tournament Not Found</h1>
            <p className="text-muted-foreground">The tournament you're looking for doesn't exist.</p>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  // Categorize matches
  const liveMatches = matches.filter(m => m.status === 'live');
  const upcomingMatches = matches.filter(m => m.status === 'upcoming');
  const completedMatches = matches.filter(m => m.status === 'completed');
  // STUMPS matches are included in live matches
  const stumpsMatches = liveMatches.filter(m => m.is_stumps);

  // Sort all matches by status: Live -> Upcoming -> Completed, then by start time
  const sortedAllMatches = [...matches].sort((a, b) => {
    const statusOrder: Record<string, number> = { 'live': 0, 'upcoming': 1, 'completed': 2 };
    const statusDiff = (statusOrder[a.status] ?? 3) - (statusOrder[b.status] ?? 3);
    if (statusDiff !== 0) return statusDiff;
    
    // Within same status, sort by date and time
    const dateA = `${a.match_date} ${a.match_time}`;
    const dateB = `${b.match_date} ${b.match_time}`;
    return dateA.localeCompare(dateB);
  });

  // SEO - use tournament's custom SEO if available
  const seoTitle = tournament.seo_title || `${tournament.name} - ${tournament.season} | ${siteSettings?.site_name || 'Live Sports'}`;
  const seoDescription = tournament.seo_description || `Follow ${tournament.name} ${tournament.season}. Live scores, match schedules, points table and streaming links.`;
  const seoKeywords = tournament.seo_keywords || `${tournament.name}, ${tournament.sport}, ${tournament.season}, live scores, points table`;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <SEOHead 
        title={seoTitle}
        description={seoDescription}
        keywords={seoKeywords}
      />
      <Header />
      
      <AdSlot position="header" className="container mx-auto px-4 py-2" />
      
      <main className="flex-1 py-6">
        <div className="container mx-auto px-4 max-w-6xl">
          {/* Tournament Header */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8"
          >
            <Card className="overflow-hidden border-border/50 bg-card/80 backdrop-blur">
              <CardContent className="p-6">
                <div className="flex flex-col md:flex-row items-center gap-6">
                  {tournament.logo_url ? (
                    <div className="w-24 h-24 rounded-2xl bg-background/60 p-3 border border-border/30">
                      <img 
                        src={tournament.logo_url} 
                        alt={tournament.name}
                        className="w-full h-full object-contain"
                      />
                    </div>
                  ) : (
                    <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
                      <Trophy className="w-12 h-12 text-primary" />
                    </div>
                  )}
                  <div className="text-center md:text-left flex-1">
                    <h1 className="font-display text-3xl text-gradient mb-2">{tournament.name}</h1>
                    <div className="flex flex-wrap items-center justify-center md:justify-start gap-3">
                      <Badge variant="secondary">{tournament.sport}</Badge>
                      <Badge variant="outline" className="gap-1">
                        <Calendar className="w-3 h-3" />
                        {tournament.season}
                      </Badge>
                      {liveMatches.length > 0 && (
                        <Badge variant="live">
                          <span className="w-2 h-2 bg-current rounded-full mr-1.5 animate-pulse" />
                          {liveMatches.length} Live
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-3xl font-bold text-primary">{matches.length}</div>
                    <div className="text-sm text-muted-foreground">Total Matches</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Points Table */}
          <div className="mb-8">
            <PointsTable tournamentId={tournament.id} tournamentName={tournament.name} />
          </div>

          <AdSlot position="in_article" className="mb-6" />

          {/* Match Tabs */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <Tabs defaultValue="all" className="w-full">
              <TabsList className="w-full justify-start mb-6 bg-muted/50">
                <TabsTrigger value="all" className="gap-2">
                  All
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{matches.length}</Badge>
                </TabsTrigger>
                <TabsTrigger value="live" className="gap-2">
                  Live
                  {liveMatches.length > 0 && (
                    <Badge variant="live" className="text-[10px] px-1.5 py-0">{liveMatches.length}</Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="upcoming" className="gap-2">
                  Upcoming
                  {upcomingMatches.length > 0 && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{upcomingMatches.length}</Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="completed" className="gap-2">
                  Completed
                  {completedMatches.length > 0 && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{completedMatches.length}</Badge>
                  )}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="all">
                {sortedAllMatches.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    No matches scheduled
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {sortedAllMatches.map((match, index) => (
                      <MatchCard key={match.id} match={match} index={index} />
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="live">
                {liveMatches.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    No live matches at the moment
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {liveMatches.map((match, index) => (
                      <MatchCard key={match.id} match={match} index={index} />
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="upcoming">
                {upcomingMatches.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    No upcoming matches scheduled
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {upcomingMatches.map((match, index) => (
                      <MatchCard key={match.id} match={match} index={index} />
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="completed">
                {completedMatches.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    No completed matches yet
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {completedMatches.map((match, index) => (
                      <MatchCard key={match.id} match={match} index={index} />
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </motion.div>
        </div>
      </main>

      <AdSlot position="footer" className="container mx-auto px-4 py-2" />
      <Footer />
    </div>
  );
};

export default TournamentPage;
