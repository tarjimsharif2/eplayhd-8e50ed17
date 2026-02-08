import { useParams } from 'react-router-dom';
import { useEffect, useState, useMemo } from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import SEOHead from '@/components/SEOHead';
import AdSlot from '@/components/AdSlot';
import MultiAdSlot from '@/components/MultiAdSlot';
import MatchCard from '@/components/MatchCard';
import PointsTable from '@/components/PointsTable';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { Tournament, Match } from '@/hooks/useSportsData';
import { useSiteSettings } from '@/hooks/useSiteSettings';
import { usePublicSiteSettings } from '@/hooks/usePublicSiteSettings';
import { useRealtimeLiveMatches } from '@/hooks/useRealtimeMatch';
import { Trophy, Calendar, Loader2, Radio, Users, ChevronDown } from 'lucide-react';
import { motion } from 'framer-motion';
import DOMPurify from 'dompurify';

const TournamentPage = () => {
  const { slug } = useParams<{ slug: string }>();
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  
  const { data: siteSettings } = useSiteSettings();
  const { data: publicSettings } = usePublicSiteSettings();
  
  // Get tournament ad positions
  const tournamentAdPositions = useMemo(() => {
    const positions = (publicSettings as any)?.tournament_page_ad_positions;
    return {
      before_matches: positions?.before_matches !== false,
      after_matches: positions?.after_matches !== false,
      sidebar: positions?.sidebar !== false,
      before_points_table: positions?.before_points_table !== false,
      after_points_table: positions?.after_points_table !== false,
      before_teams: positions?.before_teams !== false,
      after_teams: positions?.after_teams !== false,
      before_about: positions?.before_about !== false,
      after_about: positions?.after_about !== false,
      between_sections: positions?.between_sections !== false,
    };
  }, [publicSettings]);
  
  // Subscribe to real-time match updates
  useRealtimeLiveMatches();

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
        setTournament(tournamentData as unknown as Tournament);
        
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
          setMatches(matchesData as unknown as Match[]);
        }
      }
      
      setLoading(false);
    };

    fetchTournament();
  }, [slug]);

  // Get unique participating teams from matches - must be before early returns (React hooks rules)
  const participatingTeams = useMemo(() => {
    // If custom teams are set, use them
    const customTeams = tournament?.custom_participating_teams;
    if (customTeams && Array.isArray(customTeams) && customTeams.length > 0) {
      return (customTeams as { name: string; logo_url?: string }[]).map((team, index) => ({
        id: `custom-${index}`,
        name: team.name,
        short_name: team.name.substring(0, 3).toUpperCase(),
        logo_url: team.logo_url || null
      }));
    }
    
    // Otherwise extract from matches
    const teamMap = new Map<string, { id: string; name: string; short_name: string; logo_url: string | null }>();
    matches.forEach(match => {
      if (match.team_a && !teamMap.has(match.team_a.id)) {
        teamMap.set(match.team_a.id, match.team_a);
      }
      if (match.team_b && !teamMap.has(match.team_b.id)) {
        teamMap.set(match.team_b.id, match.team_b);
      }
    });
    return Array.from(teamMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [matches, tournament?.custom_participating_teams]);

  // Check if we should show participating teams
  const showParticipatingTeams = tournament?.show_participating_teams !== false && participatingTeams.length > 0;
  const teamsPosition = tournament?.participating_teams_position || 'before_matches';

  // Participating Teams Component - Compact version
  const ParticipatingTeamsSection = () => {
    if (!showParticipatingTeams) return null;
    
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="mb-6"
      >
        <Card className="border-border/50 bg-card/80 backdrop-blur">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Users className="w-4 h-4 text-primary" />
              <h2 className="font-display text-lg text-gradient">Participating Teams</h2>
              <Badge variant="secondary" className="ml-auto text-[10px] px-1.5">{tournament?.total_teams ?? participatingTeams.length}</Badge>
            </div>
            <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-2">
              {participatingTeams.map((team, index) => (
                <motion.div
                  key={team.id}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: index * 0.02 }}
                  className="flex flex-col items-center p-2 rounded-lg bg-background/50 border border-border/30 hover:border-primary/50 transition-colors"
                >
                  {team.logo_url ? (
                    <div 
                      className="w-8 h-8 rounded-lg p-0.5 mb-1 border border-border/20"
                      style={{ backgroundColor: (tournament as any)?.logo_background_color || 'transparent' }}
                    >
                      <img 
                        src={team.logo_url} 
                        alt={team.name} 
                        className="w-full h-full object-contain"
                      />
                    </div>
                  ) : (
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center mb-1">
                      <span className="text-xs font-bold text-primary">{team.short_name.charAt(0)}</span>
                    </div>
                  )}
                  <span className="text-[10px] font-medium text-center text-foreground leading-tight line-clamp-2">{team.name}</span>
                </motion.div>
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>
    );
  };

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

  // SEO - use tournament's custom SEO if available, with enhanced keywords
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
  };
  
  const seoTitle = tournament.seo_title || `${tournament.name} ${tournament.season} - Live Scores, Schedule & Points Table | ${siteSettings?.site_name || 'Live Sports'}`;
  const seoDescription = tournament.seo_description || tournament.description || `Watch ${tournament.name} ${tournament.season} live. Get live scores, match schedules, points table, team standings and streaming links. ${tournament.start_date && tournament.end_date ? `Tournament runs from ${formatDate(tournament.start_date)} to ${formatDate(tournament.end_date)}.` : ''} ${tournament.total_matches ? `Total ${tournament.total_matches} matches.` : ''}`;
  const seoKeywords = tournament.seo_keywords || `${tournament.name}, ${tournament.name} ${tournament.season}, ${tournament.sport}, ${tournament.sport} live, live scores, points table, ${tournament.name} schedule, ${tournament.name} live streaming, ${tournament.name} today match`;

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
                    <div 
                      className={`w-24 h-24 rounded-2xl p-3 border ${
                        (tournament as any).logo_background_color
                          ? 'border-border/30'
                          : 'bg-background/60 border-border/30'
                      }`}
                      style={(tournament as any).logo_background_color ? { backgroundColor: (tournament as any).logo_background_color } : undefined}
                    >
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
                    <div className="flex flex-wrap items-center justify-center md:justify-start gap-3 mb-2">
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
                    {/* Tournament Dates */}
                    {(tournament.start_date || tournament.end_date) && (
                      <p className="text-sm text-muted-foreground">
                        {tournament.start_date && tournament.end_date ? (
                          <>📅 {formatDate(tournament.start_date)} - {formatDate(tournament.end_date)}</>
                        ) : tournament.start_date ? (
                          <>📅 Starts: {formatDate(tournament.start_date)}</>
                        ) : (
                          <>📅 Ends: {formatDate(tournament.end_date)}</>
                        )}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-6 flex-wrap justify-center">
                    <div className="text-center">
                      <div className="text-3xl font-bold text-primary">
                        {tournament.total_matches ?? matches.length}
                      </div>
                      <div className="text-sm text-muted-foreground">Total Matches</div>
                    </div>
                    {(tournament.total_teams || participatingTeams.length > 0) && (
                      <div className="text-center">
                        <div className="text-3xl font-bold text-primary">
                          {tournament.total_teams ?? participatingTeams.length}
                        </div>
                        <div className="text-sm text-muted-foreground">Total Teams</div>
                      </div>
                    )}
                    {tournament.total_venues && (
                      <div className="text-center">
                        <div className="text-3xl font-bold text-primary">
                          {tournament.total_venues}
                        </div>
                        <div className="text-sm text-muted-foreground">Venues</div>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Participating Teams - Before Matches position */}
          {teamsPosition === 'before_matches' && (
            <>
              {/* Ad - Before Teams */}
              {tournamentAdPositions.before_teams && (
                <MultiAdSlot position="tournament_before_teams" className="my-4" />
              )}
              <ParticipatingTeamsSection />
              {/* Ad - After Teams */}
              {tournamentAdPositions.after_teams && (
                <MultiAdSlot position="tournament_after_teams" className="my-4" />
              )}
            </>
          )}

          {/* View Points Table Button - before matches */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="my-4"
          >
            <button
              onClick={() => {
                document.getElementById('tournament-points-table')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-primary/10 hover:bg-primary/20 border border-primary/20 transition-colors group"
            >
              <Trophy className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium text-primary">View Points Table</span>
              <ChevronDown className="w-4 h-4 text-primary group-hover:translate-y-0.5 transition-transform" />
            </button>
          </motion.div>

          {/* Tournament Ad - Before Matches */}
          {tournamentAdPositions.before_matches && (
            <MultiAdSlot position="tournament_before_matches" fallbackPosition="in_article" className="my-4" />
          )}

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

          {/* Participating Teams - After Matches position */}
          {teamsPosition === 'after_matches' && (
            <>
              {tournamentAdPositions.before_teams && (
                <MultiAdSlot position="tournament_before_teams" className="my-4" />
              )}
              <ParticipatingTeamsSection />
              {tournamentAdPositions.after_teams && (
                <MultiAdSlot position="tournament_after_teams" className="my-4" />
              )}
            </>
          )}

          {/* Tournament Ad - After Matches */}
          {tournamentAdPositions.after_matches && (
            <MultiAdSlot position="tournament_after_matches" fallbackPosition="in_article" className="my-6" />
          )}

          {/* Tournament Sidebar Ad - Desktop Only */}
          {tournamentAdPositions.sidebar && (
            <div className="hidden lg:block my-6">
              <MultiAdSlot position="tournament_sidebar" fallbackPosition="sidebar" className="sticky top-4" />
            </div>
          )}

          {/* Ad - Between Sections */}
          {tournamentAdPositions.between_sections && (
            <MultiAdSlot position="tournament_between_sections" className="my-4" />
          )}

          {/* Tournament Ad - Before Points Table */}
          {tournamentAdPositions.before_points_table && (
            <MultiAdSlot position="tournament_before_points" className="my-4" />
          )}

          {/* Points Table */}
          <div id="tournament-points-table" className="mt-6 mb-8 scroll-mt-20">
            <PointsTable tournamentId={tournament.id} tournamentName={tournament.name} syncTime={(tournament as any).points_table_sync_time} />
          </div>

          {/* Tournament Ad - After Points Table */}
          {tournamentAdPositions.after_points_table && (
            <MultiAdSlot position="tournament_after_points" className="my-4" />
          )}

          {/* Participating Teams - After Points Table position */}
          {teamsPosition === 'after_points_table' && (
            <>
              {tournamentAdPositions.before_teams && (
                <MultiAdSlot position="tournament_before_teams" className="my-4" />
              )}
              <ParticipatingTeamsSection />
              {tournamentAdPositions.after_teams && (
                <MultiAdSlot position="tournament_after_teams" className="my-4" />
              )}
            </>
          )}

          {/* Participating Teams - Before About position */}
          {teamsPosition === 'before_about' && (
            <>
              {tournamentAdPositions.before_teams && (
                <MultiAdSlot position="tournament_before_teams" className="my-4" />
              )}
              <ParticipatingTeamsSection />
              {tournamentAdPositions.after_teams && (
                <MultiAdSlot position="tournament_after_teams" className="my-4" />
              )}
            </>
          )}

          {/* Ad - Before About */}
          {tournamentAdPositions.before_about && tournament.description && (
            <MultiAdSlot position="tournament_before_about" className="my-4" />
          )}

          {/* Tournament Description */}
          {tournament.description && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="mb-8"
            >
              <Card className="border-border/50 bg-card/80 backdrop-blur">
                <CardContent className="p-6">
                  <h2 className="font-display text-xl text-gradient mb-4">About Tournament</h2>
                  <div 
                    className="text-sm text-muted-foreground leading-relaxed prose prose-sm prose-invert max-w-none
                      prose-headings:text-foreground prose-headings:font-display prose-headings:mb-3 prose-headings:mt-4
                      prose-p:text-muted-foreground prose-p:mb-3
                      prose-strong:text-foreground prose-strong:font-semibold
                      prose-em:text-primary/80
                      prose-a:text-primary prose-a:underline hover:prose-a:text-primary/80
                      prose-ul:text-muted-foreground prose-ol:text-muted-foreground
                      prose-li:text-muted-foreground"
                    dangerouslySetInnerHTML={{ 
                      __html: DOMPurify.sanitize(tournament.description, {
                        ALLOWED_TAGS: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'br', 'strong', 'b', 'em', 'i', 'u', 'a', 'ul', 'ol', 'li', 'span', 'div', 'article', 'section'],
                        ALLOWED_ATTR: ['href', 'target', 'rel', 'style', 'class']
                      }) 
                    }}
                  />
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Ad - After About */}
          {tournamentAdPositions.after_about && tournament.description && (
            <MultiAdSlot position="tournament_after_about" className="my-4" />
          )}

          {/* Participating Teams - After About position */}
          {teamsPosition === 'after_about' && (
            <>
              {tournamentAdPositions.before_teams && (
                <MultiAdSlot position="tournament_before_teams" className="my-4" />
              )}
              <ParticipatingTeamsSection />
              {tournamentAdPositions.after_teams && (
                <MultiAdSlot position="tournament_after_teams" className="my-4" />
              )}
            </>
          )}
        </div>
      </main>

      <AdSlot position="footer" className="container mx-auto px-4 py-2" />
      <Footer />
    </div>
  );
};

export default TournamentPage;
