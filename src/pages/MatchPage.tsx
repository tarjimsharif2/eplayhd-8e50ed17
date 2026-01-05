import { useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import VideoPlayer from '@/components/VideoPlayer';
import SEOHead from '@/components/SEOHead';
import AdSlot from '@/components/AdSlot';
import PlayingXI from '@/components/PlayingXI';
import PointsTable from '@/components/PointsTable';
import ManualScoreCard from '@/components/ManualScoreCard';
import ApiCricketLiveScore from '@/components/ApiCricketLiveScore';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { useStreamingServers, StreamingServer } from '@/hooks/useStreamingServers';
import { useSiteSettings } from '@/hooks/useSiteSettings';
import { useRealtimeMatch } from '@/hooks/useRealtimeMatch';
import { supabase } from '@/integrations/supabase/client';
import { Match } from '@/hooks/useSportsData';
import { MapPin, Clock, Calendar, Tv, Server, Loader2, Radio } from 'lucide-react';
import { motion } from 'framer-motion';

const MatchPage = () => {
  const { slug } = useParams<{ slug: string }>();
  const [match, setMatch] = useState<Match | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeServer, setActiveServer] = useState<StreamingServer | null>(null);
  const [localTime, setLocalTime] = useState<string>('');
  const [timezone, setTimezone] = useState<string>('');
  
  const { data: siteSettings } = useSiteSettings();
  const { data: servers, isLoading: serversLoading } = useStreamingServers(match?.id || '');
  
  // Real-time updates for match and innings
  const { realtimeMatch } = useRealtimeMatch(match?.id);

  // Scroll to top when match page loads
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [slug]);

  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const tzAbbr = new Date().toLocaleTimeString('en-US', { timeZoneName: 'short' }).split(' ').pop() || '';
    setTimezone(tzAbbr);
  }, []);

  useEffect(() => {
    const fetchMatch = async () => {
      if (!slug) return;
      
      const { data, error } = await supabase
        .from('matches')
        .select(`
          *,
          tournament:tournaments(*),
          team_a:teams!matches_team_a_id_fkey(*),
          team_b:teams!matches_team_b_id_fkey(*),
          sport:sports(*)
        `)
        .eq('slug', slug)
        .single();
      
      if (error) {
        console.error('Error fetching match:', error);
        setLoading(false);
        return;
      }
      
      setMatch(data as Match);
      setLoading(false);
    };

    fetchMatch();
  }, [slug]);

  // Apply real-time updates to match state
  useEffect(() => {
    if (realtimeMatch && match) {
      setMatch(prev => prev ? { ...prev, ...realtimeMatch } as Match : prev);
    }
  }, [realtimeMatch]);

  useEffect(() => {
    if (match?.match_start_time) {
      const matchDate = new Date(match.match_start_time);
      setLocalTime(matchDate.toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit',
        hour12: true 
      }));
    } else if (match?.match_time) {
      setLocalTime(match.match_time);
    }
  }, [match]);

  useEffect(() => {
    if (servers && servers.length > 0 && !activeServer) {
      setActiveServer(servers[0]);
    }
  }, [servers, activeServer]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!match) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Header />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <h1 className="font-display text-3xl text-gradient mb-4">Match Not Found</h1>
            <p className="text-muted-foreground">The match you're looking for doesn't exist.</p>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const teamA = match.team_a;
  const teamB = match.team_b;
  const tournament = match.tournament;
  const sport = match.sport;

  // SEO data
  const seoTitle = match.seo_title || `${teamA?.name} vs ${teamB?.name} Live Stream - ${siteSettings?.site_name || 'Live Sports'}`;
  const seoDescription = match.seo_description || `Watch ${teamA?.name} vs ${teamB?.name} live stream online. ${tournament?.name || ''} match on ${match.match_date}.`;
  const seoKeywords = (match as any).seo_keywords || `${teamA?.name}, ${teamB?.name}, live stream, ${sport?.name || 'sports'}, ${tournament?.name || ''}`;

  const getStatusVariant = (status: string) => {
    switch (status) {
      case 'live': return 'live';
      case 'completed': return 'completed';
      default: return 'upcoming';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'live': return 'Live Now';
      case 'completed': return 'Completed';
      default: return 'Upcoming';
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <SEOHead 
        title={seoTitle}
        description={seoDescription}
        keywords={seoKeywords}
        type="article"
      />
      <Header />
      
      {/* Header Ad */}
      <AdSlot position="header" className="container mx-auto px-4 py-2" />
      
      <main className="flex-1 py-6">
        <div className="container mx-auto px-4 max-w-6xl">
          {/* Video Player Section - FIRST */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6"
          >
            <Card className="overflow-hidden border-border/50 bg-card/80 backdrop-blur">
              <CardContent className="p-0">
                {activeServer ? (
                  <VideoPlayer 
                    key={`${activeServer.id}-${activeServer.server_type}-${activeServer.player_type || 'auto'}`}
                    url={activeServer.server_url} 
                    type={activeServer.server_type}
                    headers={{
                      referer: activeServer.referer_value,
                      origin: activeServer.origin_value,
                      cookie: activeServer.cookie_value,
                      userAgent: activeServer.user_agent,
                    }}
                    playerType={activeServer.player_type}
                  />
                ) : (
                  <div className="aspect-video bg-muted flex items-center justify-center">
                    <div className="text-center text-muted-foreground">
                      <Tv className="w-12 h-12 mx-auto mb-3 opacity-50" />
                      <p>No streaming servers available</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* Server Selection */}
          {servers && servers.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="mb-6"
            >
              <div className="flex items-center gap-2 mb-3">
                <Server className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium text-muted-foreground">Select Server:</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {servers.map((server) => (
                  <Button
                    key={server.id}
                    variant={activeServer?.id === server.id ? 'gradient' : 'outline'}
                    onClick={() => setActiveServer(server)}
                    className="min-w-[100px]"
                  >
                    {server.server_name}
                  </Button>
                ))}
              </div>
            </motion.div>
          )}

          {/* Live Score from API Cricket - Now positioned under server selection */}
          {match?.api_score_enabled && match.team_a && match.team_b && (
            <ApiCricketLiveScore
              teamAName={match.team_a.name}
              teamBName={match.team_b.name}
              teamALogo={match.team_a.logo_url}
              teamBLogo={match.team_b.logo_url}
              enabled={match.api_score_enabled}
              matchId={match.id}
              matchStatus={match.status}
            />
          )}

          {/* Playing XI Section - Below Full Scoreboard */}
          {teamA && teamB && (
            <div className="mb-6">
              <PlayingXI
                matchId={match.id}
                teamAId={teamA.id}
                teamBId={teamB.id}
                teamAName={teamA.name}
                teamBName={teamB.name}
                teamALogo={teamA.logo_url}
                teamBLogo={teamB.logo_url}
              />
            </div>
          )}

          {/* Score Card - Shows innings data (always shown for cricket) */}
          {sport?.name?.toLowerCase().includes('cricket') && teamA && teamB && (
            <ManualScoreCard 
              matchId={match.id}
              teamAId={teamA.id}
              teamBId={teamB.id}
              matchStatus={match.status}
              isPrimary={true}
              matchResult={match.match_result}
              teamAName={teamA.name}
              teamBName={teamB.name}
              matchFormat={match.match_format}
              testDay={match.test_day}
              isStumps={match.is_stumps}
              stumpsTime={match.stumps_time}
              nextDayStart={match.next_day_start}
              dayStartTime={match.day_start_time}
            />
          )}

          {/* In-Article Ad */}
          <AdSlot position="in_article" className="mb-6 mt-6" />

          {/* Match Header - AFTER video */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <Card className="overflow-hidden border-border/50 bg-card/80 backdrop-blur">
              <CardContent className="p-6">
                {/* Tournament & Sport Info */}
                <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
                  <div className="flex items-center gap-3">
                    {tournament?.logo_url && (
                      <img src={tournament.logo_url} alt={tournament.name} className="w-10 h-10 object-contain" />
                    )}
                    <div>
                      <h2 className="font-display text-lg text-gradient">{tournament?.name || 'Match'}</h2>
                      <p className="text-sm text-muted-foreground">{sport?.name} • {tournament?.season}</p>
                    </div>
                  </div>
                  <Badge variant={getStatusVariant(match.status)} className="text-sm px-4 py-1.5">
                    {match.status === 'live' && <span className="w-2 h-2 bg-current rounded-full mr-2 animate-pulse" />}
                    {getStatusText(match.status)}
                  </Badge>
                </div>

                {/* Teams Section */}
                <div className="flex items-center justify-between gap-4 py-6">
                  <div className="flex-1 flex flex-col items-center text-center gap-3">
                    <div className="w-20 h-20 md:w-24 md:h-24 rounded-2xl bg-gradient-to-br from-primary/15 to-transparent flex items-center justify-center border border-primary/20">
                      {teamA?.logo_url ? (
                        <img src={teamA.logo_url} alt={teamA.name} className="w-14 h-14 md:w-16 md:h-16 object-contain" />
                      ) : (
                        <span className="font-display text-2xl text-primary">{teamA?.short_name}</span>
                      )}
                    </div>
                    <h1 className="font-semibold text-lg md:text-xl break-words text-center">{teamA?.name}</h1>
                    {match.score_a && <span className="text-2xl font-bold text-primary">{match.score_a}</span>}
                  </div>

                  <div className="flex flex-col items-center gap-2 px-4">
                    <div className="w-14 h-14 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center border border-primary/30">
                      <span className="font-display text-lg text-foreground/80">VS</span>
                    </div>
                  </div>

                  <div className="flex-1 flex flex-col items-center text-center gap-3">
                    <div className="w-20 h-20 md:w-24 md:h-24 rounded-2xl bg-gradient-to-br from-accent/15 to-transparent flex items-center justify-center border border-accent/20">
                      {teamB?.logo_url ? (
                        <img src={teamB.logo_url} alt={teamB.name} className="w-14 h-14 md:w-16 md:h-16 object-contain" />
                      ) : (
                        <span className="font-display text-2xl text-accent">{teamB?.short_name}</span>
                      )}
                    </div>
                    <h1 className="font-semibold text-lg md:text-xl break-words text-center">{teamB?.name}</h1>
                    {match.score_b && <span className="text-2xl font-bold text-accent">{match.score_b}</span>}
                  </div>
                </div>

                {/* Match Info Footer */}
                <div className="flex flex-wrap items-center justify-center gap-4 pt-4 border-t border-border/30 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <Calendar className="w-4 h-4" />
                    <span>{match.match_date}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-4 h-4" />
                    <span>{localTime}</span>
                    <span className="text-primary font-medium">({timezone})</span>
                  </div>
                  {match.venue && (
                    <div className="flex items-center gap-1.5">
                      <MapPin className="w-4 h-4" />
                      <span>{match.venue}</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </motion.div>


          {/* Points Table Section */}
          {tournament?.id && (
            <div className="mt-6">
              <PointsTable tournamentId={tournament.id} tournamentName={tournament.name} />
            </div>
          )}

        </div>
      </main>

      {/* Footer Ad */}
      <AdSlot position="footer" className="container mx-auto px-4 py-2" />

      <Footer />
    </div>
  );
};

export default MatchPage;
