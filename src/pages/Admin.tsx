import { useNavigate } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/hooks/useAuth";
import { 
  useMatches, useTeams, useTournaments, useBanners, useSports, useIsAdmin,
  useCreateMatch, useUpdateMatch, useDeleteMatch,
  useCreateTeam, useUpdateTeam, useDeleteTeam,
  useCreateTournament, useUpdateTournament, useDeleteTournament,
  useCreateBanner, useUpdateBanner, useDeleteBanner,
  useCreateSport, useUpdateSport, useDeleteSport,
  Match, Team, Tournament, Banner, Sport
} from "@/hooks/useSportsData";
import { useSiteSettings, useUpdateSiteSettings, SiteSettings } from "@/hooks/useSiteSettings";
import { useState, useEffect, useMemo } from "react";
import { Plus, Edit2, Trash2, Calendar, Trophy, Users, LogOut, Loader2, Image, Link as LinkIcon, Gamepad2, Star, ShieldAlert, Settings, Tv, Save, Play } from "lucide-react";
import LiveScoreUpdater from "@/components/LiveScoreUpdater";
import { motion } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import DateTimePicker from "@/components/DateTimePicker";
import { format } from "date-fns";
import StreamingServersManager from "@/components/StreamingServersManager";
import { Textarea } from "@/components/ui/textarea";
import SearchableSelect from "@/components/SearchableSelect";

const Admin = () => {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  // Check if user is admin
  const { data: isAdmin, isLoading: isAdminLoading } = useIsAdmin(user?.id);

  // Data hooks
  const { data: matches, isLoading: matchesLoading } = useMatches();
  const { data: teams, isLoading: teamsLoading } = useTeams();
  const { data: tournaments, isLoading: tournamentsLoading } = useTournaments();
  const { data: banners, isLoading: bannersLoading } = useBanners();
  const { data: sports, isLoading: sportsLoading } = useSports();
  const { data: siteSettings, isLoading: siteSettingsLoading } = useSiteSettings();
  const updateSiteSettings = useUpdateSiteSettings();

  // Mutation hooks
  const createMatch = useCreateMatch();
  const updateMatch = useUpdateMatch();
  const deleteMatch = useDeleteMatch();
  const createTeam = useCreateTeam();
  const updateTeam = useUpdateTeam();
  const deleteTeam = useDeleteTeam();
  const createTournament = useCreateTournament();
  const updateTournament = useUpdateTournament();
  const deleteTournament = useDeleteTournament();
  const createBanner = useCreateBanner();
  const updateBanner = useUpdateBanner();
  const deleteBanner = useDeleteBanner();
  const createSport = useCreateSport();
  const updateSport = useUpdateSport();
  const deleteSport = useDeleteSport();

  // Dialog states
  const [matchDialogOpen, setMatchDialogOpen] = useState(false);
  const [teamDialogOpen, setTeamDialogOpen] = useState(false);
  const [tournamentDialogOpen, setTournamentDialogOpen] = useState(false);
  const [bannerDialogOpen, setBannerDialogOpen] = useState(false);
  const [sportDialogOpen, setSportDialogOpen] = useState(false);
  const [streamingDialogOpen, setStreamingDialogOpen] = useState(false);
  const [selectedMatchForStreaming, setSelectedMatchForStreaming] = useState<Match | null>(null);
  const [editingMatch, setEditingMatch] = useState<Match | null>(null);
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [editingTournament, setEditingTournament] = useState<Tournament | null>(null);
  const [editingBanner, setEditingBanner] = useState<Banner | null>(null);
  const [editingSport, setEditingSport] = useState<Sport | null>(null);

  // Form states
  const [matchForm, setMatchForm] = useState({
    tournament_id: '' as string | null,
    team_a_id: '',
    team_b_id: '',
    match_number: 1,
    match_date: '',
    match_time: '',
    status: 'upcoming' as 'upcoming' | 'live' | 'completed',
    venue: '',
    score_a: '',
    score_b: '',
    match_link: '',
    match_duration_minutes: 180,
    match_start_time: null as string | null,
    is_priority: false,
    match_label: '',
    sport_id: '' as string | null,
    page_type: 'redirect' as string,
    seo_title: '',
    seo_description: '',
    seo_keywords: '',
    match_minute: null as number | null,
  });

  const [teamForm, setTeamForm] = useState({
    name: '',
    short_name: '',
    logo_url: '',
  });

  const [tournamentForm, setTournamentForm] = useState({
    name: '',
    sport: 'Cricket',
    season: '',
    logo_url: '',
  });

  const [bannerForm, setBannerForm] = useState({
    title: '',
    image_url: '',
    link_url: '',
    is_active: true,
    display_order: 0,
  });

  const [sportForm, setSportForm] = useState({
    name: '',
    icon_url: '',
  });

  const [siteSettingsForm, setSiteSettingsForm] = useState({
    site_name: '',
    site_title: '',
    site_description: '',
    site_keywords: '',
    logo_url: '',
    favicon_url: '',
    og_image_url: '',
    footer_text: '',
    google_analytics_id: '',
    // Ad settings
    ads_enabled: false,
    google_adsense_id: '',
    header_ad_code: '',
    sidebar_ad_code: '',
    footer_ad_code: '',
    in_article_ad_code: '',
    popup_ad_code: '',
    // Additional SEO
    canonical_url: '',
    twitter_handle: '',
    facebook_app_id: '',
    telegram_link: '',
  });

  // Initialize site settings form when data is loaded
  useEffect(() => {
    if (siteSettings) {
      setSiteSettingsForm({
        site_name: siteSettings.site_name || '',
        site_title: siteSettings.site_title || '',
        site_description: siteSettings.site_description || '',
        site_keywords: siteSettings.site_keywords || '',
        logo_url: siteSettings.logo_url || '',
        favicon_url: siteSettings.favicon_url || '',
        og_image_url: siteSettings.og_image_url || '',
        footer_text: siteSettings.footer_text || '',
        google_analytics_id: siteSettings.google_analytics_id || '',
        // Ad settings
        ads_enabled: siteSettings.ads_enabled || false,
        google_adsense_id: siteSettings.google_adsense_id || '',
        header_ad_code: siteSettings.header_ad_code || '',
        sidebar_ad_code: siteSettings.sidebar_ad_code || '',
        footer_ad_code: siteSettings.footer_ad_code || '',
        in_article_ad_code: siteSettings.in_article_ad_code || '',
        popup_ad_code: siteSettings.popup_ad_code || '',
        // Additional SEO
        canonical_url: siteSettings.canonical_url || '',
        twitter_handle: siteSettings.twitter_handle || '',
        facebook_app_id: siteSettings.facebook_app_id || '',
        telegram_link: siteSettings.telegram_link || '',
      });
    }
  }, [siteSettings]);

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
    }
  }, [user, loading, navigate]);

  // Show access denied if not admin
  if (!loading && !isAdminLoading && user && !isAdmin) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Header />
        <main className="flex-1 flex items-center justify-center py-20">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center max-w-md mx-4"
          >
            <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-destructive/10 flex items-center justify-center">
              <ShieldAlert className="w-10 h-10 text-destructive" />
            </div>
            <h1 className="font-display text-3xl text-gradient mb-4">Access Denied</h1>
            <p className="text-muted-foreground mb-6">
              You don't have admin privileges to access this page.
            </p>
            <Button variant="gradient" onClick={() => navigate('/')}>
              Go to Home
            </Button>
          </motion.div>
        </main>
        <Footer />
      </div>
    );
  }

  if (loading || isAdminLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
    toast({
      title: "Signed out",
      description: "You've been successfully signed out.",
    });
  };

  // Match handlers
  const handleSaveMatch = async () => {
    try {
      // Generate SEO-friendly slug from team names
      const teamAName = teams?.find(t => t.id === matchForm.team_a_id)?.name || '';
      const teamBName = teams?.find(t => t.id === matchForm.team_b_id)?.name || '';
      const generateSlug = (teamA: string, teamB: string) => {
        const base = `${teamA}-vs-${teamB}`.toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)/g, '');
        const random = Math.random().toString(36).substring(2, 8);
        return `${base}-${random}`;
      };

      const matchData = {
        tournament_id: matchForm.tournament_id || null,
        team_a_id: matchForm.team_a_id,
        team_b_id: matchForm.team_b_id,
        match_number: matchForm.match_number,
        match_date: matchForm.match_date,
        match_time: matchForm.match_time,
        status: matchForm.status,
        venue: matchForm.venue || null,
        score_a: matchForm.score_a || null,
        score_b: matchForm.score_b || null,
        match_link: matchForm.page_type === 'redirect' ? (matchForm.match_link || null) : null,
        match_duration_minutes: matchForm.match_duration_minutes || 180,
        match_start_time: matchForm.match_start_time || null,
        is_priority: matchForm.is_priority,
        match_label: matchForm.match_label || null,
        sport_id: matchForm.sport_id || null,
        page_type: matchForm.page_type,
        slug: matchForm.page_type === 'page' ? (editingMatch?.slug || generateSlug(teamAName, teamBName)) : null,
        seo_title: matchForm.seo_title || null,
        seo_description: matchForm.seo_description || null,
        seo_keywords: matchForm.seo_keywords || null,
        match_minute: matchForm.match_minute,
      };
      
      if (editingMatch) {
        await updateMatch.mutateAsync({ id: editingMatch.id, ...matchData });
        toast({ title: "Match updated successfully" });
      } else {
        await createMatch.mutateAsync(matchData);
        toast({ title: "Match created successfully" });
      }
      setMatchDialogOpen(false);
      resetMatchForm();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleEditMatch = (match: Match) => {
    setEditingMatch(match);
    setMatchForm({
      tournament_id: match.tournament_id || '',
      team_a_id: match.team_a_id,
      team_b_id: match.team_b_id,
      match_number: match.match_number,
      match_date: match.match_date,
      match_time: match.match_time,
      status: match.status,
      venue: match.venue || '',
      score_a: match.score_a || '',
      score_b: match.score_b || '',
      match_link: match.match_link || '',
      match_duration_minutes: match.match_duration_minutes || 180,
      match_start_time: match.match_start_time || null,
      is_priority: match.is_priority || false,
      match_label: match.match_label || '',
      sport_id: match.sport_id || '',
      page_type: match.page_type || 'redirect',
      seo_title: match.seo_title || '',
      seo_description: match.seo_description || '',
      seo_keywords: match.seo_keywords || '',
      match_minute: match.match_minute,
    });
    setMatchDialogOpen(true);
  };

  const handleDeleteMatch = async (id: string) => {
    try {
      await deleteMatch.mutateAsync(id);
      toast({ title: "Match deleted successfully" });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const resetMatchForm = () => {
    setEditingMatch(null);
    setMatchForm({
      tournament_id: '',
      team_a_id: '',
      team_b_id: '',
      match_number: 1,
      match_date: '',
      match_time: '',
      status: 'upcoming',
      venue: '',
      score_a: '',
      score_b: '',
      match_link: '',
      match_duration_minutes: 180,
      match_start_time: null,
      is_priority: false,
      match_label: '',
      sport_id: '',
      page_type: 'redirect',
      seo_title: '',
      seo_description: '',
      seo_keywords: '',
      match_minute: null,
    });
  };

  // Team handlers
  const handleSaveTeam = async () => {
    try {
      const teamData = {
        ...teamForm,
        logo_url: teamForm.logo_url || null,
      };
      
      if (editingTeam) {
        await updateTeam.mutateAsync({ id: editingTeam.id, ...teamData });
        toast({ title: "Team updated successfully" });
      } else {
        await createTeam.mutateAsync(teamData);
        toast({ title: "Team created successfully" });
      }
      setTeamDialogOpen(false);
      resetTeamForm();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleEditTeam = (team: Team) => {
    setEditingTeam(team);
    setTeamForm({
      name: team.name,
      short_name: team.short_name,
      logo_url: team.logo_url || '',
    });
    setTeamDialogOpen(true);
  };

  const handleDeleteTeam = async (id: string) => {
    try {
      await deleteTeam.mutateAsync(id);
      toast({ title: "Team deleted successfully" });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const resetTeamForm = () => {
    setEditingTeam(null);
    setTeamForm({ name: '', short_name: '', logo_url: '' });
  };

  // Tournament handlers
  const handleSaveTournament = async () => {
    try {
      const tournamentData = {
        ...tournamentForm,
        logo_url: tournamentForm.logo_url || null,
      };
      
      if (editingTournament) {
        await updateTournament.mutateAsync({ id: editingTournament.id, ...tournamentData });
        toast({ title: "Tournament updated successfully" });
      } else {
        await createTournament.mutateAsync(tournamentData);
        toast({ title: "Tournament created successfully" });
      }
      setTournamentDialogOpen(false);
      resetTournamentForm();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleEditTournament = (tournament: Tournament) => {
    setEditingTournament(tournament);
    setTournamentForm({
      name: tournament.name,
      sport: tournament.sport,
      season: tournament.season,
      logo_url: tournament.logo_url || '',
    });
    setTournamentDialogOpen(true);
  };

  const handleDeleteTournament = async (id: string) => {
    try {
      await deleteTournament.mutateAsync(id);
      toast({ title: "Tournament deleted successfully" });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const resetTournamentForm = () => {
    setEditingTournament(null);
    setTournamentForm({ name: '', sport: 'Cricket', season: '', logo_url: '' });
  };

  // Banner handlers
  const handleSaveBanner = async () => {
    try {
      const bannerData = {
        ...bannerForm,
        link_url: bannerForm.link_url || null,
      };
      
      if (editingBanner) {
        await updateBanner.mutateAsync({ id: editingBanner.id, ...bannerData });
        toast({ title: "Banner updated successfully" });
      } else {
        await createBanner.mutateAsync(bannerData);
        toast({ title: "Banner created successfully" });
      }
      setBannerDialogOpen(false);
      resetBannerForm();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleEditBanner = (banner: Banner) => {
    setEditingBanner(banner);
    setBannerForm({
      title: banner.title,
      image_url: banner.image_url,
      link_url: banner.link_url || '',
      is_active: banner.is_active,
      display_order: banner.display_order,
    });
    setBannerDialogOpen(true);
  };

  const handleDeleteBanner = async (id: string) => {
    try {
      await deleteBanner.mutateAsync(id);
      toast({ title: "Banner deleted successfully" });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const resetBannerForm = () => {
    setEditingBanner(null);
    setBannerForm({ title: '', image_url: '', link_url: '', is_active: true, display_order: 0 });
  };

  // Sport handlers
  const handleSaveSport = async () => {
    try {
      const sportData = {
        name: sportForm.name,
        icon_url: sportForm.icon_url || null,
      };
      
      if (editingSport) {
        await updateSport.mutateAsync({ id: editingSport.id, ...sportData });
        toast({ title: "Sport updated successfully" });
      } else {
        await createSport.mutateAsync(sportData);
        toast({ title: "Sport created successfully" });
      }
      setSportDialogOpen(false);
      resetSportForm();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleEditSport = (sport: Sport) => {
    setEditingSport(sport);
    setSportForm({
      name: sport.name,
      icon_url: sport.icon_url || '',
    });
    setSportDialogOpen(true);
  };

  const handleDeleteSport = async (id: string) => {
    try {
      await deleteSport.mutateAsync(id);
      toast({ title: "Sport deleted successfully" });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const resetSportForm = () => {
    setEditingSport(null);
    setSportForm({ name: '', icon_url: '' });
  };

  // Site Settings handler
  const handleSaveSiteSettings = async () => {
    if (!siteSettings?.id) {
      toast({ title: "Error", description: "Site settings not found", variant: "destructive" });
      return;
    }
    
    try {
      await updateSiteSettings.mutateAsync({
        id: siteSettings.id,
        site_name: siteSettingsForm.site_name,
        site_title: siteSettingsForm.site_title,
        site_description: siteSettingsForm.site_description || null,
        site_keywords: siteSettingsForm.site_keywords || null,
        logo_url: siteSettingsForm.logo_url || null,
        favicon_url: siteSettingsForm.favicon_url || null,
        og_image_url: siteSettingsForm.og_image_url || null,
        footer_text: siteSettingsForm.footer_text || null,
        google_analytics_id: siteSettingsForm.google_analytics_id || null,
        // Ad settings
        ads_enabled: siteSettingsForm.ads_enabled,
        google_adsense_id: siteSettingsForm.google_adsense_id || null,
        header_ad_code: siteSettingsForm.header_ad_code || null,
        sidebar_ad_code: siteSettingsForm.sidebar_ad_code || null,
        footer_ad_code: siteSettingsForm.footer_ad_code || null,
        in_article_ad_code: siteSettingsForm.in_article_ad_code || null,
        popup_ad_code: siteSettingsForm.popup_ad_code || null,
        // Additional SEO
        canonical_url: siteSettingsForm.canonical_url || null,
        twitter_handle: siteSettingsForm.twitter_handle || null,
        facebook_app_id: siteSettingsForm.facebook_app_id || null,
        telegram_link: siteSettingsForm.telegram_link || null,
      });
      toast({ title: "Site settings updated successfully" });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1 py-8">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="mb-8 flex items-center justify-between"
          >
            <div>
              <h1 className="font-display text-3xl md:text-4xl tracking-wide text-gradient mb-2">
                Admin Panel
              </h1>
              <p className="text-muted-foreground">
                Manage matches, teams, tournaments, sports & banners
              </p>
            </div>
            <Button variant="outline" onClick={handleSignOut}>
              <LogOut className="w-4 h-4 mr-2" />
              Sign Out
            </Button>
          </motion.div>

          <Tabs defaultValue="matches" className="space-y-6">
            <TabsList className="bg-muted/50 p-1 flex-wrap h-auto">
              <TabsTrigger value="matches" className="gap-2">
                <Calendar className="w-4 h-4" />
                Matches
              </TabsTrigger>
              <TabsTrigger value="live-scores" className="gap-2">
                <Play className="w-4 h-4" />
                Live Scores
              </TabsTrigger>
              <TabsTrigger value="streaming" className="gap-2">
                <Tv className="w-4 h-4" />
                Streaming
              </TabsTrigger>
              <TabsTrigger value="teams" className="gap-2">
                <Users className="w-4 h-4" />
                Teams
              </TabsTrigger>
              <TabsTrigger value="tournaments" className="gap-2">
                <Trophy className="w-4 h-4" />
                Tournaments
              </TabsTrigger>
              <TabsTrigger value="sports" className="gap-2">
                <Gamepad2 className="w-4 h-4" />
                Sports
              </TabsTrigger>
              <TabsTrigger value="banners" className="gap-2">
                <Image className="w-4 h-4" />
                Banners
              </TabsTrigger>
              <TabsTrigger value="settings" className="gap-2">
                <Settings className="w-4 h-4" />
                Settings
              </TabsTrigger>
            </TabsList>

            {/* Matches Tab */}
            <TabsContent value="matches" className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">All Matches</h2>
                <Dialog open={matchDialogOpen} onOpenChange={(open) => {
                  setMatchDialogOpen(open);
                  if (!open) resetMatchForm();
                }}>
                  <DialogTrigger asChild>
                    <Button variant="gradient" size="sm">
                      <Plus className="w-4 h-4" />
                      Add Match
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>{editingMatch ? 'Edit Match' : 'Add New Match'}</DialogTitle>
                      <DialogDescription>
                        Fill in the match details below
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      {/* Sport Selection */}
                      <div className="space-y-2">
                        <Label>Sport *</Label>
                        <Select value={matchForm.sport_id || ''} onValueChange={(v) => setMatchForm({ ...matchForm, sport_id: v || null })}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select sport" />
                          </SelectTrigger>
                          <SelectContent>
                            {sports?.map((s) => (
                              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      
                      {/* Tournament (Optional) - Searchable */}
                      <div className="space-y-2">
                        <Label>Tournament (optional)</Label>
                        <SearchableSelect
                          options={[
                            { value: 'none', label: 'No Tournament' },
                            ...(tournaments?.map((t) => ({
                              value: t.id,
                              label: t.name,
                              sublabel: t.season,
                              imageUrl: t.logo_url,
                            })) || [])
                          ]}
                          value={matchForm.tournament_id || 'none'}
                          onValueChange={(v) => setMatchForm({ ...matchForm, tournament_id: v === 'none' ? null : v })}
                          placeholder="Select tournament (optional)"
                          searchPlaceholder="Search tournaments..."
                          emptyText="No tournaments found."
                        />
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Team A *</Label>
                          <SearchableSelect
                            options={teams?.map((t) => ({
                              value: t.id,
                              label: t.name,
                              sublabel: t.short_name,
                              imageUrl: t.logo_url,
                            })) || []}
                            value={matchForm.team_a_id}
                            onValueChange={(v) => setMatchForm({ ...matchForm, team_a_id: v })}
                            placeholder="Select team"
                            searchPlaceholder="Search teams..."
                            emptyText="No teams found."
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Team B *</Label>
                          <SearchableSelect
                            options={teams?.map((t) => ({
                              value: t.id,
                              label: t.name,
                              sublabel: t.short_name,
                              imageUrl: t.logo_url,
                            })) || []}
                            value={matchForm.team_b_id}
                            onValueChange={(v) => setMatchForm({ ...matchForm, team_b_id: v })}
                            placeholder="Select team"
                            searchPlaceholder="Search teams..."
                            emptyText="No teams found."
                          />
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Match Number</Label>
                          <Input type="number" value={matchForm.match_number} onChange={(e) => setMatchForm({ ...matchForm, match_number: parseInt(e.target.value) || 1 })} />
                        </div>
                        <div className="space-y-2">
                          <Label>Status</Label>
                          <Select value={matchForm.status} onValueChange={(v: 'upcoming' | 'live' | 'completed') => setMatchForm({ ...matchForm, status: v })}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="upcoming">Upcoming</SelectItem>
                              <SelectItem value="live">Live</SelectItem>
                              <SelectItem value="completed">Completed</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      
                      {/* Match Label (Optional - Final, Semi-Final, etc.) */}
                      <div className="space-y-2">
                        <Label>Match Label (optional)</Label>
                        <Select value={matchForm.match_label || 'none'} onValueChange={(v) => setMatchForm({ ...matchForm, match_label: v === 'none' ? null : v })}>
                          <SelectTrigger>
                            <SelectValue placeholder="e.g., Final, Semi-Final" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">None</SelectItem>
                            <SelectItem value="Final">Final</SelectItem>
                            <SelectItem value="Semi-Final">Semi-Final</SelectItem>
                            <SelectItem value="Quarter-Final">Quarter-Final</SelectItem>
                            <SelectItem value="Qualifier">Qualifier</SelectItem>
                            <SelectItem value="Eliminator">Eliminator</SelectItem>
                            <SelectItem value="Group Stage">Group Stage</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      
                      {/* Priority Match Toggle */}
                      <div className="flex items-center justify-between rounded-lg border p-3 shadow-sm">
                        <div className="space-y-0.5">
                          <Label className="flex items-center gap-2">
                            <Star className="w-4 h-4 text-yellow-500" />
                            Priority Match
                          </Label>
                          <p className="text-xs text-muted-foreground">Show this match at the top of the list</p>
                        </div>
                        <Switch
                          checked={matchForm.is_priority}
                          onCheckedChange={(checked) => setMatchForm({ ...matchForm, is_priority: checked })}
                        />
                      </div>
                      
                      <div className="space-y-2">
                        <Label>Match Date & Time *</Label>
                        <DateTimePicker
                          value={matchForm.match_start_time ? new Date(matchForm.match_start_time) : null}
                          onChange={(date) => {
                            if (date) {
                              const dateStr = format(date, "do MMMM yyyy");
                              const timeStr = format(date, "h:mm a");
                              setMatchForm({
                                ...matchForm,
                                match_start_time: date.toISOString(),
                                match_date: dateStr,
                                match_time: timeStr
                              });
                            } else {
                              setMatchForm({
                                ...matchForm,
                                match_start_time: null,
                                match_date: '',
                                match_time: ''
                              });
                            }
                          }}
                          placeholder="Select match date & time"
                        />
                        {matchForm.match_date && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {matchForm.match_date} at {matchForm.match_time}
                          </p>
                        )}
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Duration (minutes)</Label>
                          <Input type="number" placeholder="180" value={matchForm.match_duration_minutes} onChange={(e) => setMatchForm({ ...matchForm, match_duration_minutes: parseInt(e.target.value) || 180 })} />
                        </div>
                        <div className="space-y-2">
                          <Label>Venue (optional)</Label>
                          <Input placeholder="Stadium name" value={matchForm.venue} onChange={(e) => setMatchForm({ ...matchForm, venue: e.target.value })} />
                        </div>
                      </div>
                      
                      {/* Page Type Selection */}
                      <div className="space-y-2">
                        <Label>Match Page Type</Label>
                        <Select value={matchForm.page_type} onValueChange={(v) => setMatchForm({ ...matchForm, page_type: v })}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="redirect">Redirect URL</SelectItem>
                            <SelectItem value="page">SEO Match Page</SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                          {matchForm.page_type === 'redirect' 
                            ? 'Match card will redirect to an external URL' 
                            : 'Auto-generate an SEO-friendly match page with streaming servers'}
                        </p>
                      </div>

                      {matchForm.page_type === 'redirect' ? (
                        <div className="space-y-2">
                          <Label className="flex items-center gap-2">
                            <LinkIcon className="w-4 h-4" />
                            Match Link (redirect URL)
                          </Label>
                          <Input placeholder="https://..." value={matchForm.match_link} onChange={(e) => setMatchForm({ ...matchForm, match_link: e.target.value })} />
                        </div>
                      ) : (
                        <>
                          <div className="space-y-2">
                            <Label>SEO Title (optional)</Label>
                            <Input 
                              placeholder="e.g., Team A vs Team B Live Stream" 
                              value={matchForm.seo_title} 
                              onChange={(e) => setMatchForm({ ...matchForm, seo_title: e.target.value })} 
                            />
                            <p className="text-xs text-muted-foreground">Leave empty to auto-generate from team names</p>
                          </div>
                          <div className="space-y-2">
                            <Label>SEO Description (optional)</Label>
                            <Input 
                              placeholder="Watch live stream online..." 
                              value={matchForm.seo_description} 
                              onChange={(e) => setMatchForm({ ...matchForm, seo_description: e.target.value })} 
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>SEO Keywords (optional)</Label>
                            <Input 
                              placeholder="team a, team b, live stream, cricket match" 
                              value={matchForm.seo_keywords} 
                              onChange={(e) => setMatchForm({ ...matchForm, seo_keywords: e.target.value })} 
                            />
                            <p className="text-xs text-muted-foreground">Comma-separated keywords for this match page</p>
                          </div>
                        </>
                      )}
                      
                      {matchForm.status !== 'upcoming' && (
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label>Score A</Label>
                            <Input placeholder="e.g., 180/5" value={matchForm.score_a} onChange={(e) => setMatchForm({ ...matchForm, score_a: e.target.value })} />
                          </div>
                          <div className="space-y-2">
                            <Label>Score B</Label>
                            <Input placeholder="e.g., 175/8" value={matchForm.score_b} onChange={(e) => setMatchForm({ ...matchForm, score_b: e.target.value })} />
                          </div>
                        </div>
                      )}
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setMatchDialogOpen(false)}>Cancel</Button>
                      <Button variant="gradient" onClick={handleSaveMatch} disabled={createMatch.isPending || updateMatch.isPending}>
                        {(createMatch.isPending || updateMatch.isPending) && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                        {editingMatch ? 'Update' : 'Create'}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>

              {matchesLoading ? (
                <div className="text-center py-8"><Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" /></div>
              ) : (
                <div className="grid gap-4">
                  {matches?.length === 0 && (
                    <p className="text-center text-muted-foreground py-8">No matches yet. Add your first match!</p>
                  )}
                  {matches?.map((match, index) => (
                    <motion.div
                      key={match.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.05 }}
                    >
                      <Card className={`hover:border-primary/50 transition-colors ${match.is_priority ? 'border-yellow-500/50 bg-yellow-500/5' : ''}`}>
                        <CardContent className="p-4">
                          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2 flex-wrap">
                                {match.is_priority && <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />}
                                {match.match_label && <Badge variant="outline" className="text-xs">{match.match_label}</Badge>}
                                <Badge variant="sport">{match.sport?.name || match.tournament?.sport}</Badge>
                                {match.tournament && (
                                  <span className="text-muted-foreground text-sm">
                                    {match.tournament.name} {match.tournament.season}
                                  </span>
                                )}
                                {match.match_link && (
                                  <LinkIcon className="w-3 h-3 text-primary" />
                                )}
                              </div>
                              <p className="font-semibold text-lg">
                                {match.team_a?.name} vs {match.team_b?.name}
                              </p>
                              <p className="text-muted-foreground text-sm">
                                {match.match_date} • {match.match_time}
                                {match.venue && ` • ${match.venue}`}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant={match.status === 'live' ? 'live' : match.status === 'completed' ? 'completed' : 'upcoming'}>
                                {match.status}
                              </Badge>
                              <Button variant="ghost" size="icon" onClick={() => handleEditMatch(match)}>
                                <Edit2 className="w-4 h-4" />
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => handleDeleteMatch(match.id)}>
                                <Trash2 className="w-4 h-4 text-destructive" />
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* Live Scores Tab */}
            <TabsContent value="live-scores" className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold">Live Score Updates</h2>
                  <p className="text-sm text-muted-foreground">Quickly update scores for live matches</p>
                </div>
              </div>

              {matchesLoading ? (
                <div className="text-center py-8"><Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" /></div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {matches?.filter(m => m.status === 'live').length === 0 && (
                    <div className="col-span-full text-center py-8">
                      <p className="text-muted-foreground">No live matches at the moment.</p>
                      <p className="text-sm text-muted-foreground mt-1">Set a match status to "Live" to update its score here.</p>
                    </div>
                  )}
                  {matches?.filter(m => m.status === 'live').map((match) => (
                    <LiveScoreUpdater key={match.id} match={match} />
                  ))}
                </div>
              )}
            </TabsContent>

            {/* Streaming Servers Tab */}
            <TabsContent value="streaming" className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold">Streaming Servers</h2>
                  <p className="text-sm text-muted-foreground">Manage M3U8 and iframe links for each match</p>
                </div>
              </div>

              {matchesLoading ? (
                <div className="text-center py-8"><Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" /></div>
              ) : (
                <div className="space-y-4">
                  {matches?.length === 0 && (
                    <p className="text-center text-muted-foreground py-8">No matches available. Create matches first to add streaming servers.</p>
                  )}
                  {matches?.filter(m => m.page_type === 'page').map((match, index) => (
                    <motion.div
                      key={match.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.03 }}
                    >
                      <Card className="hover:border-primary/50 transition-colors">
                        <CardContent className="p-4">
                          <div className="flex flex-col md:flex-row md:items-center gap-4">
                            <div className="flex items-center gap-3 flex-1">
                              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary/30 to-accent/20 flex items-center justify-center border border-primary/20">
                                <Tv className="w-5 h-5 text-primary" />
                              </div>
                              <div>
                                <p className="font-semibold">
                                  {match.team_a?.name || 'TBA'} vs {match.team_b?.name || 'TBA'}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                  {match.match_date} • {match.match_time}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant={match.status}>{match.status}</Badge>
                              <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => {
                                  setSelectedMatchForStreaming(match);
                                  setStreamingDialogOpen(true);
                                }}
                              >
                                <Tv className="w-4 h-4 mr-1" />
                                Manage Servers
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  ))}
                  {matches?.filter(m => m.page_type === 'page').length === 0 && matches?.length > 0 && (
                    <Card className="border-dashed">
                      <CardContent className="flex flex-col items-center justify-center py-8 text-center">
                        <Tv className="w-12 h-12 text-muted-foreground/50 mb-3" />
                        <p className="text-muted-foreground">No matches with "Page" type found</p>
                        <p className="text-sm text-muted-foreground/70">Set match page type to "Page" to add streaming servers</p>
                      </CardContent>
                    </Card>
                  )}
                </div>
              )}
            </TabsContent>

            {/* Streaming Servers Dialog */}
            <Dialog open={streamingDialogOpen} onOpenChange={(open) => {
              setStreamingDialogOpen(open);
              if (!open) setSelectedMatchForStreaming(null);
            }}>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                {selectedMatchForStreaming && (
                  <StreamingServersManager
                    match={selectedMatchForStreaming}
                    onClose={() => {
                      setStreamingDialogOpen(false);
                      setSelectedMatchForStreaming(null);
                    }}
                  />
                )}
              </DialogContent>
            </Dialog>

            {/* Teams Tab */}
            <TabsContent value="teams" className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">All Teams</h2>
                <Dialog open={teamDialogOpen} onOpenChange={(open) => {
                  setTeamDialogOpen(open);
                  if (!open) resetTeamForm();
                }}>
                  <DialogTrigger asChild>
                    <Button variant="gradient" size="sm">
                      <Plus className="w-4 h-4" />
                      Add Team
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>{editingTeam ? 'Edit Team' : 'Add New Team'}</DialogTitle>
                      <DialogDescription>
                        Fill in the team details below
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>Team Name</Label>
                        <Input placeholder="e.g., Sylhet Titans" value={teamForm.name} onChange={(e) => setTeamForm({ ...teamForm, name: e.target.value })} />
                      </div>
                      <div className="space-y-2">
                        <Label>Short Name</Label>
                        <Input placeholder="e.g., SYL" value={teamForm.short_name} onChange={(e) => setTeamForm({ ...teamForm, short_name: e.target.value })} />
                      </div>
                      <div className="space-y-2">
                        <Label>Logo URL (optional)</Label>
                        <Input placeholder="https://..." value={teamForm.logo_url} onChange={(e) => setTeamForm({ ...teamForm, logo_url: e.target.value })} />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setTeamDialogOpen(false)}>Cancel</Button>
                      <Button variant="gradient" onClick={handleSaveTeam} disabled={createTeam.isPending || updateTeam.isPending}>
                        {(createTeam.isPending || updateTeam.isPending) && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                        {editingTeam ? 'Update' : 'Create'}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>

              {teamsLoading ? (
                <div className="text-center py-8"><Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" /></div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {teams?.length === 0 && (
                    <p className="text-center text-muted-foreground py-8 col-span-full">No teams yet. Add your first team!</p>
                  )}
                  {teams?.map((team, index) => (
                    <motion.div
                      key={team.id}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: index * 0.05 }}
                    >
                      <Card className="hover:border-primary/50 transition-colors">
                        <CardContent className="p-4">
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-primary/30 to-accent/20 flex items-center justify-center border border-primary/20">
                              {team.logo_url ? (
                                <img src={team.logo_url} alt={team.name} className="w-8 h-8 object-contain" />
                              ) : (
                                <span className="font-display text-primary">{team.short_name}</span>
                              )}
                            </div>
                            <div className="flex-1">
                              <p className="font-semibold">{team.name}</p>
                              <p className="text-muted-foreground text-sm">{team.short_name}</p>
                            </div>
                            <div className="flex items-center gap-1">
                              <Button variant="ghost" size="icon" onClick={() => handleEditTeam(team)}>
                                <Edit2 className="w-4 h-4" />
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => handleDeleteTeam(team.id)}>
                                <Trash2 className="w-4 h-4 text-destructive" />
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* Tournaments Tab */}
            <TabsContent value="tournaments" className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">All Tournaments</h2>
                <Dialog open={tournamentDialogOpen} onOpenChange={(open) => {
                  setTournamentDialogOpen(open);
                  if (!open) resetTournamentForm();
                }}>
                  <DialogTrigger asChild>
                    <Button variant="gradient" size="sm">
                      <Plus className="w-4 h-4" />
                      Add Tournament
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>{editingTournament ? 'Edit Tournament' : 'Add New Tournament'}</DialogTitle>
                      <DialogDescription>
                        Fill in the tournament details below
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>Tournament Name</Label>
                        <Input placeholder="e.g., BPL" value={tournamentForm.name} onChange={(e) => setTournamentForm({ ...tournamentForm, name: e.target.value })} />
                      </div>
                      <div className="space-y-2">
                        <Label>Sport</Label>
                        <Select value={tournamentForm.sport} onValueChange={(v) => setTournamentForm({ ...tournamentForm, sport: v })}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {sports?.map((s) => (
                              <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Season</Label>
                        <Input placeholder="e.g., 2025-26" value={tournamentForm.season} onChange={(e) => setTournamentForm({ ...tournamentForm, season: e.target.value })} />
                      </div>
                      <div className="space-y-2">
                        <Label>Logo URL (optional)</Label>
                        <Input placeholder="https://..." value={tournamentForm.logo_url} onChange={(e) => setTournamentForm({ ...tournamentForm, logo_url: e.target.value })} />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setTournamentDialogOpen(false)}>Cancel</Button>
                      <Button variant="gradient" onClick={handleSaveTournament} disabled={createTournament.isPending || updateTournament.isPending}>
                        {(createTournament.isPending || updateTournament.isPending) && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                        {editingTournament ? 'Update' : 'Create'}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>

              {tournamentsLoading ? (
                <div className="text-center py-8"><Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" /></div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {tournaments?.length === 0 && (
                    <p className="text-center text-muted-foreground py-8 col-span-full">No tournaments yet. Add your first tournament!</p>
                  )}
                  {tournaments?.map((tournament, index) => (
                    <motion.div
                      key={tournament.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.1 }}
                    >
                      <Card className="hover:border-primary/50 transition-colors">
                        <CardContent className="p-6">
                          <div className="flex items-start justify-between">
                            <div className="flex items-start gap-4">
                              {tournament.logo_url && (
                                <img src={tournament.logo_url} alt={tournament.name} className="w-12 h-12 object-contain rounded-lg" />
                              )}
                              <div>
                                <h3 className="font-display text-2xl text-gradient tracking-wider mb-2">
                                  {tournament.name}
                                </h3>
                                <div className="flex items-center gap-2">
                                  <Badge variant="sport">{tournament.sport}</Badge>
                                  <span className="text-muted-foreground text-sm">
                                    Season {tournament.season}
                                  </span>
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              <Button variant="ghost" size="icon" onClick={() => handleEditTournament(tournament)}>
                                <Edit2 className="w-4 h-4" />
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => handleDeleteTournament(tournament.id)}>
                                <Trash2 className="w-4 h-4 text-destructive" />
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* Sports Tab */}
            <TabsContent value="sports" className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">All Sports</h2>
                <Dialog open={sportDialogOpen} onOpenChange={(open) => {
                  setSportDialogOpen(open);
                  if (!open) resetSportForm();
                }}>
                  <DialogTrigger asChild>
                    <Button variant="gradient" size="sm">
                      <Plus className="w-4 h-4" />
                      Add Sport
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>{editingSport ? 'Edit Sport' : 'Add New Sport'}</DialogTitle>
                      <DialogDescription>
                        Add a new sport type with an optional icon
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>Sport Name</Label>
                        <Input placeholder="e.g., Badminton" value={sportForm.name} onChange={(e) => setSportForm({ ...sportForm, name: e.target.value })} />
                      </div>
                      <div className="space-y-2">
                        <Label>Icon URL (optional)</Label>
                        <Input placeholder="https://..." value={sportForm.icon_url} onChange={(e) => setSportForm({ ...sportForm, icon_url: e.target.value })} />
                        <p className="text-xs text-muted-foreground">Leave empty to use default icon</p>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setSportDialogOpen(false)}>Cancel</Button>
                      <Button variant="gradient" onClick={handleSaveSport} disabled={createSport.isPending || updateSport.isPending}>
                        {(createSport.isPending || updateSport.isPending) && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                        {editingSport ? 'Update' : 'Create'}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>

              {sportsLoading ? (
                <div className="text-center py-8"><Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" /></div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {sports?.length === 0 && (
                    <p className="text-center text-muted-foreground py-8 col-span-full">No sports yet. Add your first sport!</p>
                  )}
                  {sports?.map((sport, index) => (
                    <motion.div
                      key={sport.id}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: index * 0.05 }}
                    >
                      <Card className="hover:border-primary/50 transition-colors">
                        <CardContent className="p-4">
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-primary/30 to-accent/20 flex items-center justify-center border border-primary/20">
                              {sport.icon_url ? (
                                <img src={sport.icon_url} alt={sport.name} className="w-6 h-6 object-contain" />
                              ) : (
                                <Gamepad2 className="w-6 h-6 text-primary" />
                              )}
                            </div>
                            <div className="flex-1">
                              <p className="font-semibold">{sport.name}</p>
                            </div>
                            <div className="flex items-center gap-1">
                              <Button variant="ghost" size="icon" onClick={() => handleEditSport(sport)}>
                                <Edit2 className="w-4 h-4" />
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => handleDeleteSport(sport.id)}>
                                <Trash2 className="w-4 h-4 text-destructive" />
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* Banners Tab */}
            <TabsContent value="banners" className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">All Banners</h2>
                <Dialog open={bannerDialogOpen} onOpenChange={(open) => {
                  setBannerDialogOpen(open);
                  if (!open) resetBannerForm();
                }}>
                  <DialogTrigger asChild>
                    <Button variant="gradient" size="sm">
                      <Plus className="w-4 h-4" />
                      Add Banner
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>{editingBanner ? 'Edit Banner' : 'Add New Banner'}</DialogTitle>
                      <DialogDescription>
                        Fill in the banner details below
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>Title</Label>
                        <Input placeholder="Banner title" value={bannerForm.title} onChange={(e) => setBannerForm({ ...bannerForm, title: e.target.value })} />
                      </div>
                      <div className="space-y-2">
                        <Label>Image URL</Label>
                        <Input placeholder="https://..." value={bannerForm.image_url} onChange={(e) => setBannerForm({ ...bannerForm, image_url: e.target.value })} />
                      </div>
                      <div className="space-y-2">
                        <Label>Link URL (optional)</Label>
                        <Input placeholder="https://..." value={bannerForm.link_url} onChange={(e) => setBannerForm({ ...bannerForm, link_url: e.target.value })} />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Display Order</Label>
                          <Input type="number" value={bannerForm.display_order} onChange={(e) => setBannerForm({ ...bannerForm, display_order: parseInt(e.target.value) || 0 })} />
                        </div>
                        <div className="flex items-center gap-2 pt-7">
                          <Switch
                            checked={bannerForm.is_active}
                            onCheckedChange={(checked) => setBannerForm({ ...bannerForm, is_active: checked })}
                          />
                          <Label>Active</Label>
                        </div>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setBannerDialogOpen(false)}>Cancel</Button>
                      <Button variant="gradient" onClick={handleSaveBanner} disabled={createBanner.isPending || updateBanner.isPending}>
                        {(createBanner.isPending || updateBanner.isPending) && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                        {editingBanner ? 'Update' : 'Create'}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>

              {bannersLoading ? (
                <div className="text-center py-8"><Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" /></div>
              ) : (
                <div className="grid gap-4">
                  {banners?.length === 0 && (
                    <p className="text-center text-muted-foreground py-8">No banners yet. Add your first banner!</p>
                  )}
                  {banners?.map((banner, index) => (
                    <motion.div
                      key={banner.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.05 }}
                    >
                      <Card className="hover:border-primary/50 transition-colors">
                        <CardContent className="p-4">
                          <div className="flex flex-col md:flex-row md:items-center gap-4">
                            <div className="w-full md:w-48 h-24 rounded-lg overflow-hidden bg-muted">
                              <img src={banner.image_url} alt={banner.title} className="w-full h-full object-cover" />
                            </div>
                            <div className="flex-1">
                              <p className="font-semibold text-lg">{banner.title}</p>
                              <p className="text-muted-foreground text-sm">Order: {banner.display_order}</p>
                              {banner.link_url && (
                                <p className="text-primary text-sm truncate">{banner.link_url}</p>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant={banner.is_active ? 'upcoming' : 'completed'}>
                                {banner.is_active ? 'Active' : 'Inactive'}
                              </Badge>
                              <Button variant="ghost" size="icon" onClick={() => handleEditBanner(banner)}>
                                <Edit2 className="w-4 h-4" />
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => handleDeleteBanner(banner.id)}>
                                <Trash2 className="w-4 h-4 text-destructive" />
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* Settings Tab */}
            <TabsContent value="settings" className="space-y-6">
              {siteSettingsLoading ? (
                <div className="text-center py-8"><Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" /></div>
              ) : (
                <div className="space-y-6">
                  {/* General Site Settings */}
                  <Card>
                    <CardHeader>
                      <CardTitle>General Settings</CardTitle>
                      <CardDescription>Configure your website name, logo and basic info</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label>Site Name</Label>
                          <Input 
                            placeholder="My Sports Site" 
                            value={siteSettingsForm.site_name} 
                            onChange={(e) => setSiteSettingsForm({ ...siteSettingsForm, site_name: e.target.value })} 
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Site Title (SEO)</Label>
                          <Input 
                            placeholder="My Sports Site - Watch Live Matches" 
                            value={siteSettingsForm.site_title} 
                            onChange={(e) => setSiteSettingsForm({ ...siteSettingsForm, site_title: e.target.value })} 
                          />
                        </div>
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label>Logo URL</Label>
                          <Input 
                            placeholder="https://..." 
                            value={siteSettingsForm.logo_url} 
                            onChange={(e) => setSiteSettingsForm({ ...siteSettingsForm, logo_url: e.target.value })} 
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Favicon URL</Label>
                          <Input 
                            placeholder="https://..." 
                            value={siteSettingsForm.favicon_url} 
                            onChange={(e) => setSiteSettingsForm({ ...siteSettingsForm, favicon_url: e.target.value })} 
                          />
                        </div>
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label>Footer Text</Label>
                          <Input 
                            placeholder="© 2025 My Sports Site. All rights reserved." 
                            value={siteSettingsForm.footer_text} 
                            onChange={(e) => setSiteSettingsForm({ ...siteSettingsForm, footer_text: e.target.value })} 
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Telegram Link</Label>
                          <Input 
                            placeholder="https://t.me/yourchannel" 
                            value={siteSettingsForm.telegram_link} 
                            onChange={(e) => setSiteSettingsForm({ ...siteSettingsForm, telegram_link: e.target.value })} 
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* SEO Settings */}
                  <Card>
                    <CardHeader>
                      <CardTitle>SEO Settings</CardTitle>
                      <CardDescription>Optimize your site for search engines like Google</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      <div className="space-y-2">
                        <Label>Site Description</Label>
                        <Textarea 
                          placeholder="Describe your site for search engines (max 160 characters recommended)..." 
                          value={siteSettingsForm.site_description} 
                          onChange={(e) => setSiteSettingsForm({ ...siteSettingsForm, site_description: e.target.value })} 
                          rows={3}
                        />
                        <p className="text-xs text-muted-foreground">{(siteSettingsForm.site_description || '').length}/160 characters</p>
                      </div>

                      <div className="space-y-2">
                        <Label>Site Keywords</Label>
                        <Input 
                          placeholder="live sports, cricket, football, streaming, live match" 
                          value={siteSettingsForm.site_keywords} 
                          onChange={(e) => setSiteSettingsForm({ ...siteSettingsForm, site_keywords: e.target.value })} 
                        />
                        <p className="text-xs text-muted-foreground">Comma-separated keywords for SEO</p>
                      </div>

                      <div className="space-y-2">
                        <Label>Canonical URL</Label>
                        <Input 
                          placeholder="https://yoursite.com" 
                          value={siteSettingsForm.canonical_url} 
                          onChange={(e) => setSiteSettingsForm({ ...siteSettingsForm, canonical_url: e.target.value })} 
                        />
                        <p className="text-xs text-muted-foreground">Your main website URL for canonical tags</p>
                      </div>

                      <div className="space-y-2">
                        <Label>Open Graph Image URL (Social Sharing)</Label>
                        <Input 
                          placeholder="https://..." 
                          value={siteSettingsForm.og_image_url} 
                          onChange={(e) => setSiteSettingsForm({ ...siteSettingsForm, og_image_url: e.target.value })} 
                        />
                        <p className="text-xs text-muted-foreground">Image shown when shared on social media (1200x630 recommended)</p>
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label>Twitter Handle</Label>
                          <Input 
                            placeholder="@youraccount" 
                            value={siteSettingsForm.twitter_handle} 
                            onChange={(e) => setSiteSettingsForm({ ...siteSettingsForm, twitter_handle: e.target.value })} 
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Facebook App ID</Label>
                          <Input 
                            placeholder="123456789" 
                            value={siteSettingsForm.facebook_app_id} 
                            onChange={(e) => setSiteSettingsForm({ ...siteSettingsForm, facebook_app_id: e.target.value })} 
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label>Google Analytics ID</Label>
                        <Input 
                          placeholder="G-XXXXXXXXXX" 
                          value={siteSettingsForm.google_analytics_id} 
                          onChange={(e) => setSiteSettingsForm({ ...siteSettingsForm, google_analytics_id: e.target.value })} 
                        />
                      </div>
                    </CardContent>
                  </Card>

                  {/* Ad Settings */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Advertisement Settings</CardTitle>
                      <CardDescription>Configure Google Ads and other advertisement placements</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      <div className="flex items-center justify-between rounded-lg border p-4 shadow-sm">
                        <div className="space-y-0.5">
                          <Label className="text-base font-medium">Enable Ads</Label>
                          <p className="text-sm text-muted-foreground">Turn on/off all advertisements across the site</p>
                        </div>
                        <Switch
                          checked={siteSettingsForm.ads_enabled}
                          onCheckedChange={(checked) => setSiteSettingsForm({ ...siteSettingsForm, ads_enabled: checked })}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Google AdSense Publisher ID</Label>
                        <Input 
                          placeholder="ca-pub-XXXXXXXXXXXXXXXX" 
                          value={siteSettingsForm.google_adsense_id} 
                          onChange={(e) => setSiteSettingsForm({ ...siteSettingsForm, google_adsense_id: e.target.value })} 
                        />
                        <p className="text-xs text-muted-foreground">Your AdSense publisher ID for auto ads</p>
                      </div>

                      <div className="space-y-2">
                        <Label>Header Ad Code</Label>
                        <Textarea 
                          placeholder="Paste your ad code here (HTML/JavaScript)..." 
                          value={siteSettingsForm.header_ad_code} 
                          onChange={(e) => setSiteSettingsForm({ ...siteSettingsForm, header_ad_code: e.target.value })} 
                          rows={4}
                          className="font-mono text-xs"
                        />
                        <p className="text-xs text-muted-foreground">Displayed at the top of pages</p>
                      </div>

                      <div className="space-y-2">
                        <Label>In-Article Ad Code</Label>
                        <Textarea 
                          placeholder="Paste your ad code here (HTML/JavaScript)..." 
                          value={siteSettingsForm.in_article_ad_code} 
                          onChange={(e) => setSiteSettingsForm({ ...siteSettingsForm, in_article_ad_code: e.target.value })} 
                          rows={4}
                          className="font-mono text-xs"
                        />
                        <p className="text-xs text-muted-foreground">Displayed within match pages and content</p>
                      </div>

                      <div className="space-y-2">
                        <Label>Sidebar Ad Code</Label>
                        <Textarea 
                          placeholder="Paste your ad code here (HTML/JavaScript)..." 
                          value={siteSettingsForm.sidebar_ad_code} 
                          onChange={(e) => setSiteSettingsForm({ ...siteSettingsForm, sidebar_ad_code: e.target.value })} 
                          rows={4}
                          className="font-mono text-xs"
                        />
                        <p className="text-xs text-muted-foreground">Displayed in sidebars</p>
                      </div>

                      <div className="space-y-2">
                        <Label>Footer Ad Code</Label>
                        <Textarea 
                          placeholder="Paste your ad code here (HTML/JavaScript)..." 
                          value={siteSettingsForm.footer_ad_code} 
                          onChange={(e) => setSiteSettingsForm({ ...siteSettingsForm, footer_ad_code: e.target.value })} 
                          rows={4}
                          className="font-mono text-xs"
                        />
                        <p className="text-xs text-muted-foreground">Displayed at the bottom of pages</p>
                      </div>

                      <div className="space-y-2">
                        <Label>Popup Ad Code</Label>
                        <Textarea 
                          placeholder="Paste your popup ad code here (HTML/JavaScript)..." 
                          value={siteSettingsForm.popup_ad_code} 
                          onChange={(e) => setSiteSettingsForm({ ...siteSettingsForm, popup_ad_code: e.target.value })} 
                          rows={4}
                          className="font-mono text-xs"
                        />
                        <p className="text-xs text-muted-foreground">Popup/interstitial ads (use sparingly)</p>
                      </div>
                    </CardContent>
                  </Card>

                  <div className="flex justify-end pt-4">
                    <Button variant="gradient" onClick={handleSaveSiteSettings} disabled={updateSiteSettings.isPending}>
                      {updateSiteSettings.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                      <Save className="w-4 h-4 mr-2" />
                      Save All Settings
                    </Button>
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Admin;
