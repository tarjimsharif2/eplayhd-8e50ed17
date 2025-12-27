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
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Plus, Edit2, Trash2, Calendar, Trophy, Users, LogOut, Loader2, Image, Link as LinkIcon, Gamepad2, Star, ShieldAlert, Settings, Tv, Save, Play, Copy, RefreshCw, Moon, Sun, Globe } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import LiveScoreUpdater from "@/components/LiveScoreUpdater";
import { motion } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import DateTimePicker from "@/components/DateTimePicker";
import { format } from "date-fns";
import StreamingServersManager from "@/components/StreamingServersManager";
import InningsManager from "@/components/InningsManager";
import PlayingXIManager from "@/components/PlayingXIManager";
import FootballPlayingXIManager from "@/components/FootballPlayingXIManager";
import PointsTableManager from "@/components/PointsTableManager";
import { Textarea } from "@/components/ui/textarea";
import SearchableSelect from "@/components/SearchableSelect";

import PasswordChangeDialog from "@/components/PasswordChangeDialog";
import { Table, FileText, Megaphone } from "lucide-react";
import { useGoogleIndexing } from "@/hooks/useGoogleIndexing";
import DynamicPagesManager from "@/components/DynamicPagesManager";
import AdsSettingsManager from "@/components/AdsSettingsManager";

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

  // Google Indexing hook
  const { submitMatchForIndexing, submitTournamentForIndexing } = useGoogleIndexing();

  const [matchDialogOpen, setMatchDialogOpen] = useState(false);
  const [teamDialogOpen, setTeamDialogOpen] = useState(false);
  const [tournamentDialogOpen, setTournamentDialogOpen] = useState(false);
  const [bannerDialogOpen, setBannerDialogOpen] = useState(false);
  const [sportDialogOpen, setSportDialogOpen] = useState(false);
  const [streamingDialogOpen, setStreamingDialogOpen] = useState(false);
  const [inningsDialogOpen, setInningsDialogOpen] = useState(false);
  const [playingXIDialogOpen, setPlayingXIDialogOpen] = useState(false);
  const [selectedMatchForStreaming, setSelectedMatchForStreaming] = useState<Match | null>(null);
  const [selectedMatchForInnings, setSelectedMatchForInnings] = useState<Match | null>(null);
  const [selectedMatchForPlayingXI, setSelectedMatchForPlayingXI] = useState<Match | null>(null);
  const [editingMatch, setEditingMatch] = useState<Match | null>(null);
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [editingTournament, setEditingTournament] = useState<Tournament | null>(null);
  const [editingBanner, setEditingBanner] = useState<Banner | null>(null);
  const [editingSport, setEditingSport] = useState<Sport | null>(null);
  
  // Match search state
  const [matchSearchQuery, setMatchSearchQuery] = useState('');
  const [matchStatusFilter, setMatchStatusFilter] = useState<'all' | 'live' | 'upcoming' | 'completed'>('all');
  const [streamingSearchQuery, setStreamingSearchQuery] = useState('');
  const [streamingStatusFilter, setStreamingStatusFilter] = useState<'all' | 'live' | 'upcoming' | 'completed'>('all');
  const [matchSportFilter, setMatchSportFilter] = useState<string>('all');
  const [streamingSportFilter, setStreamingSportFilter] = useState<string>('all');
  const [tournamentSearchQuery, setTournamentSearchQuery] = useState('');
  const [teamSearchQuery, setTeamSearchQuery] = useState('');
  
  // Bulk selection state
  const [selectedMatches, setSelectedMatches] = useState<Set<string>>(new Set());
  const [selectedTeams, setSelectedTeams] = useState<Set<string>>(new Set());
  const [selectedTournaments, setSelectedTournaments] = useState<Set<string>>(new Set());
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  
  // Bulk delete confirmation dialogs
  const [bulkDeleteMatchesDialogOpen, setBulkDeleteMatchesDialogOpen] = useState(false);
  const [bulkDeleteTeamsDialogOpen, setBulkDeleteTeamsDialogOpen] = useState(false);
  const [bulkDeleteTournamentsDialogOpen, setBulkDeleteTournamentsDialogOpen] = useState(false);
  

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
    match_end_time: null as string | null,
    duration_type: 'duration' as 'duration' | 'end_time',
    match_start_time: null as string | null,
    is_priority: false,
    match_label: '',
    sport_id: '' as string | null,
    page_type: 'redirect' as string,
    seo_title: '',
    seo_description: '',
    seo_keywords: '',
    match_minute: null as number | null,
    match_format: '' as string | null,
    test_day: null as number | null,
    is_stumps: false,
    stumps_time: null as string | null,
    day_start_time: '' as string | null,
    daily_stumps_time: '' as string | null,
    next_day_start: null as string | null,
    match_result: null as 'team_a_won' | 'team_b_won' | 'tied' | 'no_result' | 'draw' | null,
    api_score_enabled: false,
    cricbuzz_match_id: '' as string | null,
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
    slug: '',
    is_active: true,
    show_in_menu: true,
    seo_title: '',
    seo_description: '',
    seo_keywords: '',
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
    // Cricket API settings
    cricket_api_key: '',
    cricket_api_enabled: true,
    // Ads.txt
    ads_txt_content: '',
    // Custom code injection
    custom_header_code: '',
    custom_footer_code: '',
  });
  
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);

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
        ads_enabled: siteSettings.ads_enabled || false,
        google_adsense_id: siteSettings.google_adsense_id || '',
        header_ad_code: siteSettings.header_ad_code || '',
        sidebar_ad_code: siteSettings.sidebar_ad_code || '',
        footer_ad_code: siteSettings.footer_ad_code || '',
        in_article_ad_code: siteSettings.in_article_ad_code || '',
        popup_ad_code: siteSettings.popup_ad_code || '',
        canonical_url: siteSettings.canonical_url || '',
        twitter_handle: siteSettings.twitter_handle || '',
        facebook_app_id: siteSettings.facebook_app_id || '',
        telegram_link: siteSettings.telegram_link || '',
        cricket_api_key: siteSettings.cricket_api_key || '',
        cricket_api_enabled: siteSettings.cricket_api_enabled !== false,
        ads_txt_content: (siteSettings as any).ads_txt_content || '',
        custom_header_code: siteSettings.custom_header_code || '',
        custom_footer_code: siteSettings.custom_footer_code || '',
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


  const handleClearCache = async () => {
    try {
      // Clear React Query cache
      const queryClient = (await import('@tanstack/react-query')).useQueryClient;
      
      // Clear browser caches
      if ('caches' in window) {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map(name => caches.delete(name)));
      }
      
      // Clear localStorage cache items (keep auth)
      const authKeys = ['supabase.auth.token'];
      Object.keys(localStorage).forEach(key => {
        if (!authKeys.some(authKey => key.includes(authKey))) {
          if (key.includes('cache') || key.includes('query')) {
            localStorage.removeItem(key);
          }
        }
      });
      
      // Clear sessionStorage
      sessionStorage.clear();
      
      toast({
        title: "Cache cleared",
        description: "All cached data has been cleared. Refreshing page...",
      });
      
      // Reload the page to refresh all data
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to clear cache. Please try refreshing the page manually.",
        variant: "destructive",
      });
    }
  };

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
      // Generate SEO-friendly slug from team names (format: team-a-vs-team-b)
      const teamAName = teams?.find(t => t.id === matchForm.team_a_id)?.name || '';
      const teamBName = teams?.find(t => t.id === matchForm.team_b_id)?.name || '';
      const generateSlug = (teamA: string, teamB: string) => {
        return `${teamA}-vs-${teamB}`.toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)/g, '');
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
        match_duration_minutes: matchForm.duration_type === 'duration' ? (matchForm.match_duration_minutes || 180) : null,
        match_end_time: matchForm.duration_type === 'end_time' ? (matchForm.match_end_time || null) : null,
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
        match_format: matchForm.match_format || null,
        test_day: matchForm.test_day,
        is_stumps: matchForm.is_stumps,
        stumps_time: matchForm.daily_stumps_time 
          ? (() => {
              const [hours, minutes] = matchForm.daily_stumps_time.split(':').map(Number);
              const today = new Date();
              today.setHours(hours, minutes, 0, 0);
              return today.toISOString();
            })()
          : matchForm.stumps_time || null,
        day_start_time: matchForm.day_start_time || null,
        next_day_start: matchForm.next_day_start || null,
        match_result: matchForm.match_result,
        api_score_enabled: matchForm.api_score_enabled,
        cricbuzz_match_id: matchForm.cricbuzz_match_id || null,
      };
      let matchId: string | undefined;
      
      if (editingMatch) {
        await updateMatch.mutateAsync({ id: editingMatch.id, ...matchData });
        matchId = editingMatch.id;
        toast({ title: "Match updated successfully" });
      } else {
        const result = await createMatch.mutateAsync(matchData);
        matchId = result?.id;
        toast({ title: "Match created successfully" });
      }
      
      // Submit to Google Indexing if page_type is 'page' (has its own URL)
      if (matchData.page_type === 'page' && matchId) {
        submitMatchForIndexing(matchId);
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
      match_end_time: (match as any).match_end_time || null,
      duration_type: (match as any).match_end_time ? 'end_time' : 'duration',
      match_start_time: match.match_start_time || null,
      is_priority: match.is_priority || false,
      match_label: match.match_label || '',
      sport_id: match.sport_id || '',
      page_type: match.page_type || 'redirect',
      seo_title: match.seo_title || '',
      seo_description: match.seo_description || '',
      seo_keywords: match.seo_keywords || '',
      match_minute: match.match_minute,
      match_format: match.match_format || '',
      test_day: match.test_day,
      is_stumps: match.is_stumps || false,
      stumps_time: match.stumps_time || null,
      day_start_time: match.day_start_time || '',
      daily_stumps_time: match.stumps_time ? new Date(match.stumps_time).toTimeString().slice(0, 5) : '',
      next_day_start: match.next_day_start || null,
      match_result: match.match_result,
      api_score_enabled: match.api_score_enabled !== false,
      cricbuzz_match_id: match.cricbuzz_match_id || '',
    });
    setMatchDialogOpen(true);
  };

  const handleDeleteMatch = async (id: string) => {
    try {
      await deleteMatch.mutateAsync(id);
      setSelectedMatches(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      toast({ title: "Match deleted successfully" });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleBulkDeleteMatches = async () => {
    if (selectedMatches.size === 0) return;
    setIsBulkDeleting(true);
    try {
      await Promise.all(Array.from(selectedMatches).map(id => deleteMatch.mutateAsync(id)));
      setSelectedMatches(new Set());
      setBulkDeleteMatchesDialogOpen(false);
      toast({ title: `${selectedMatches.size} matches deleted successfully` });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setIsBulkDeleting(false);
    }
  };

  const toggleMatchSelection = (id: string) => {
    setSelectedMatches(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleAllMatchesSelection = (matchIds: string[]) => {
    setSelectedMatches(prev => {
      const allSelected = matchIds.every(id => prev.has(id));
      if (allSelected) {
        return new Set();
      }
      return new Set(matchIds);
    });
  };

  const handleCopyMatch = (match: Match) => {
    // Generate new slug for copied match
    const teamAName = match.team_a?.name || '';
    const teamBName = match.team_b?.name || '';
    const newSlug = `${teamAName}-vs-${teamBName}`.toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');

    setEditingMatch(null); // Ensure we're creating, not editing
    setMatchForm({
      tournament_id: match.tournament_id || '',
      team_a_id: match.team_a_id,
      team_b_id: match.team_b_id,
      match_number: match.match_number + 1,
      match_date: match.match_date,
      match_time: match.match_time,
      status: 'upcoming',
      venue: match.venue || '',
      score_a: '',
      score_b: '',
      match_link: match.match_link || '',
      match_duration_minutes: match.match_duration_minutes || 180,
      match_end_time: null,
      duration_type: 'duration',
      match_start_time: match.match_start_time || null,
      is_priority: match.is_priority || false,
      match_label: match.match_label || '',
      sport_id: match.sport_id || '',
      page_type: match.page_type || 'redirect',
      seo_title: match.seo_title || '',
      seo_description: match.seo_description || '',
      seo_keywords: match.seo_keywords || '',
      match_minute: null,
      match_format: match.match_format || '',
      test_day: null,
      is_stumps: false,
      stumps_time: null,
      day_start_time: match.day_start_time || '',
      daily_stumps_time: '',
      next_day_start: null,
      match_result: null,
      api_score_enabled: false,
      cricbuzz_match_id: '',
    });
    setMatchDialogOpen(true);
    toast({ title: "Match copied", description: "Edit the details and save to create a new match." });
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
      match_end_time: null,
      duration_type: 'duration',
      match_start_time: null,
      is_priority: false,
      match_label: '',
      sport_id: '',
      page_type: 'redirect',
      seo_title: '',
      seo_description: '',
      seo_keywords: '',
      match_minute: null,
      match_format: '',
      test_day: null,
      is_stumps: false,
      stumps_time: null,
      day_start_time: '',
      daily_stumps_time: '',
      next_day_start: null,
      match_result: null,
      api_score_enabled: false,
      cricbuzz_match_id: '',
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
      setSelectedTeams(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      toast({ title: "Team deleted successfully" });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleBulkDeleteTeams = async () => {
    if (selectedTeams.size === 0) return;
    setIsBulkDeleting(true);
    try {
      await Promise.all(Array.from(selectedTeams).map(id => deleteTeam.mutateAsync(id)));
      setSelectedTeams(new Set());
      setBulkDeleteTeamsDialogOpen(false);
      toast({ title: `${selectedTeams.size} teams deleted successfully` });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setIsBulkDeleting(false);
    }
  };

  const toggleTeamSelection = (id: string) => {
    setSelectedTeams(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleAllTeamsSelection = (teamIds: string[]) => {
    setSelectedTeams(prev => {
      const allSelected = teamIds.every(id => prev.has(id));
      if (allSelected) {
        return new Set();
      }
      return new Set(teamIds);
    });
  };

  const resetTeamForm = () => {
    setEditingTeam(null);
    setTeamForm({ name: '', short_name: '', logo_url: '' });
  };

  // Tournament handlers
  const handleSaveTournament = async () => {
    try {
      // Generate slug from name if not provided
      const generateSlug = (name: string) => {
        return name.toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)/g, '');
      };

      const tournamentData = {
        ...tournamentForm,
        logo_url: tournamentForm.logo_url || null,
        slug: tournamentForm.slug || generateSlug(tournamentForm.name),
        is_active: tournamentForm.is_active,
        show_in_menu: tournamentForm.show_in_menu,
        seo_title: tournamentForm.seo_title || null,
        seo_description: tournamentForm.seo_description || null,
        seo_keywords: tournamentForm.seo_keywords || null,
      };
      const tournamentSlug = tournamentData.slug;
      
      if (editingTournament) {
        await updateTournament.mutateAsync({ id: editingTournament.id, ...tournamentData });
        toast({ title: "Tournament updated successfully" });
      } else {
        await createTournament.mutateAsync(tournamentData);
        toast({ title: "Tournament created successfully" });
      }
      
      // Submit to Google Indexing
      if (tournamentSlug) {
        submitTournamentForIndexing(tournamentSlug);
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
      slug: tournament.slug || '',
      is_active: tournament.is_active ?? true,
      show_in_menu: tournament.show_in_menu ?? true,
      seo_title: tournament.seo_title || '',
      seo_description: tournament.seo_description || '',
      seo_keywords: tournament.seo_keywords || '',
    });
    setTournamentDialogOpen(true);
  };

  const handleDeleteTournament = async (id: string) => {
    try {
      await deleteTournament.mutateAsync(id);
      setSelectedTournaments(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      toast({ title: "Tournament deleted successfully" });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleBulkDeleteTournaments = async () => {
    if (selectedTournaments.size === 0) return;
    setIsBulkDeleting(true);
    try {
      await Promise.all(Array.from(selectedTournaments).map(id => deleteTournament.mutateAsync(id)));
      setSelectedTournaments(new Set());
      setBulkDeleteTournamentsDialogOpen(false);
      toast({ title: `${selectedTournaments.size} tournaments deleted successfully` });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setIsBulkDeleting(false);
    }
  };

  const toggleTournamentSelection = (id: string) => {
    setSelectedTournaments(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleAllTournamentsSelection = (tournamentIds: string[]) => {
    setSelectedTournaments(prev => {
      const allSelected = tournamentIds.every(id => prev.has(id));
      if (allSelected) {
        return new Set();
      }
      return new Set(tournamentIds);
    });
  };

  const resetTournamentForm = () => {
    setEditingTournament(null);
    setTournamentForm({ name: '', sport: 'Cricket', season: '', logo_url: '', slug: '', is_active: true, show_in_menu: true, seo_title: '', seo_description: '', seo_keywords: '' });
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
        // Cricket API settings
        cricket_api_key: siteSettingsForm.cricket_api_key || null,
        cricket_api_enabled: siteSettingsForm.cricket_api_enabled,
        // Ads.txt
        ads_txt_content: siteSettingsForm.ads_txt_content || null,
        // Custom code injection
        custom_header_code: siteSettingsForm.custom_header_code || null,
        custom_footer_code: siteSettingsForm.custom_footer_code || null,
      } as any);
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
            className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
          >
            <div>
              <h1 className="font-display text-2xl sm:text-3xl md:text-4xl tracking-wide text-gradient mb-1 sm:mb-2">
                Admin Panel
              </h1>
              <p className="text-sm sm:text-base text-muted-foreground">
                Manage matches, teams, tournaments & more
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={handleClearCache} className="flex-1 sm:flex-none">
                <RefreshCw className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">Clear Cache</span>
              </Button>
              <Button variant="outline" size="sm" onClick={handleSignOut} className="flex-1 sm:flex-none">
                <LogOut className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">Sign Out</span>
              </Button>
            </div>
          </motion.div>

          <Tabs defaultValue="matches" className="space-y-4 sm:space-y-6">
            <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
              <TabsList className="bg-muted/50 p-1 flex flex-nowrap sm:flex-wrap h-auto min-w-max sm:min-w-0 gap-1">
                <TabsTrigger value="matches" className="text-xs sm:text-sm whitespace-nowrap px-2 sm:px-3">
                  Matches
                </TabsTrigger>
                <TabsTrigger value="live-scores" className="text-xs sm:text-sm whitespace-nowrap px-2 sm:px-3">
                  Live Scores
                </TabsTrigger>
                <TabsTrigger value="streaming" className="text-xs sm:text-sm whitespace-nowrap px-2 sm:px-3">
                  Streaming
                </TabsTrigger>
                <TabsTrigger value="teams" className="text-xs sm:text-sm whitespace-nowrap px-2 sm:px-3">
                  Teams
                </TabsTrigger>
                <TabsTrigger value="tournaments" className="text-xs sm:text-sm whitespace-nowrap px-2 sm:px-3">
                  Tournaments
                </TabsTrigger>
                <TabsTrigger value="points-table" className="text-xs sm:text-sm whitespace-nowrap px-2 sm:px-3">
                  Points Table
                </TabsTrigger>
                <TabsTrigger value="sports" className="text-xs sm:text-sm whitespace-nowrap px-2 sm:px-3">
                  Sports
                </TabsTrigger>
                <TabsTrigger value="banners" className="text-xs sm:text-sm whitespace-nowrap px-2 sm:px-3">
                  Banners
                </TabsTrigger>
                <TabsTrigger value="pages" className="text-xs sm:text-sm whitespace-nowrap px-2 sm:px-3">
                  Pages
                </TabsTrigger>
                <TabsTrigger value="ads" className="text-xs sm:text-sm whitespace-nowrap px-2 sm:px-3">
                  Ads
                </TabsTrigger>
                <TabsTrigger value="settings" className="text-xs sm:text-sm whitespace-nowrap px-2 sm:px-3">
                  Settings
                </TabsTrigger>
              </TabsList>
            </div>

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
                  <DialogContent className="max-w-2xl w-[95vw] max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>{editingMatch ? 'Edit Match' : 'Add New Match'}</DialogTitle>
                      <DialogDescription>
                        Fill in the match details below
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      {/* Sport and Tournament Row */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                      </div>
                      
                      {/* Teams Row */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                      
                      {/* Match Number and Status Row */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                      
                      {/* Match Result - Only show when status is completed */}
                      {matchForm.status === 'completed' && (
                        <div className="space-y-2">
                          <Label>Match Result *</Label>
                          <Select 
                            value={matchForm.match_result || 'none'} 
                            onValueChange={(v) => setMatchForm({ 
                              ...matchForm, 
                              match_result: v === 'none' ? null : v as 'team_a_won' | 'team_b_won' | 'tied' | 'no_result' | 'draw'
                            })}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select result" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Not Set</SelectItem>
                              <SelectItem value="team_a_won">
                                {teams?.find(t => t.id === matchForm.team_a_id)?.short_name || 'Team A'} Won
                              </SelectItem>
                              <SelectItem value="team_b_won">
                                {teams?.find(t => t.id === matchForm.team_b_id)?.short_name || 'Team B'} Won
                              </SelectItem>
                              <SelectItem value="tied">Tied</SelectItem>
                              <SelectItem value="no_result">No Result</SelectItem>
                              <SelectItem value="draw">Draw</SelectItem>
                            </SelectContent>
                          </Select>
                          <p className="text-xs text-muted-foreground">
                            ✅ Recommended: Set this manually. Points table updates automatically on save.
                          </p>
                        </div>
                      )}
                      
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
                      
                      {/* Match Duration/End Time Selection */}
                      <div className="space-y-3 p-3 rounded-lg border border-border/50 bg-muted/10">
                        <div className="flex items-center gap-4">
                          <Label className="text-sm font-medium">Match Length:</Label>
                          <div className="flex gap-2">
                            <Button
                              type="button"
                              variant={matchForm.duration_type === 'duration' ? 'default' : 'outline'}
                              size="sm"
                              onClick={() => setMatchForm({ ...matchForm, duration_type: 'duration', match_end_time: null })}
                            >
                              Duration
                            </Button>
                            <Button
                              type="button"
                              variant={matchForm.duration_type === 'end_time' ? 'default' : 'outline'}
                              size="sm"
                              onClick={() => setMatchForm({ ...matchForm, duration_type: 'end_time', match_duration_minutes: 0 })}
                            >
                              End Time
                            </Button>
                          </div>
                        </div>
                        
                        {matchForm.duration_type === 'duration' ? (
                          <div className="space-y-2">
                            <Label>Duration (minutes)</Label>
                            <Input 
                              type="number" 
                              placeholder="180" 
                              value={matchForm.match_duration_minutes || ''} 
                              onChange={(e) => setMatchForm({ ...matchForm, match_duration_minutes: parseInt(e.target.value) || 0 })} 
                            />
                            <p className="text-xs text-muted-foreground">How long the match will run</p>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <Label>Match End Date & Time</Label>
                            <DateTimePicker
                              value={matchForm.match_end_time ? new Date(matchForm.match_end_time) : null}
                              onChange={(date) => setMatchForm({ 
                                ...matchForm, 
                                match_end_time: date ? date.toISOString() : null 
                              })}
                              placeholder="Select end date & time"
                            />
                            <p className="text-xs text-muted-foreground">When the match will end</p>
                          </div>
                        )}
                      </div>
                      
                      <div className="space-y-2">
                        <Label>Venue (optional)</Label>
                        <Input placeholder="Stadium name" value={matchForm.venue} onChange={(e) => setMatchForm({ ...matchForm, venue: e.target.value })} />
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
                      
                      {/* Cricket Format Settings */}
                      <div className="space-y-4 p-4 rounded-lg border border-border/50 bg-muted/20">
                        <h4 className="font-medium text-sm flex items-center gap-2">
                          <Gamepad2 className="w-4 h-4" />
                          Cricket Match Format (optional)
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label>Match Format</Label>
                            <Select value={matchForm.match_format || ''} onValueChange={(v) => setMatchForm({ ...matchForm, match_format: v || null })}>
                              <SelectTrigger>
                                <SelectValue placeholder="Select format" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="test">Test</SelectItem>
                                <SelectItem value="odi">ODI</SelectItem>
                                <SelectItem value="t20">T20</SelectItem>
                                <SelectItem value="t10">T10</SelectItem>
                                <SelectItem value="the_hundred">The Hundred</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          {matchForm.match_format === 'test' && (
                            <div className="space-y-2">
                              <Label>Test Day (1-5)</Label>
                              <Select value={matchForm.test_day?.toString() || ''} onValueChange={(v) => setMatchForm({ ...matchForm, test_day: v ? parseInt(v) : null })}>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select day" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="1">Day 1</SelectItem>
                                  <SelectItem value="2">Day 2</SelectItem>
                                  <SelectItem value="3">Day 3</SelectItem>
                                  <SelectItem value="4">Day 4</SelectItem>
                                  <SelectItem value="5">Day 5</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          )}
                        </div>
                        {matchForm.match_format === 'test' && (
                          <div className="space-y-4 pt-2 border-t border-border/30">
                            {/* Manual STUMPS/Resume Controls */}
                            <div className="flex gap-2">
                              {!matchForm.is_stumps ? (
                                <Button
                                  type="button"
                                  variant="outline"
                                  className="flex-1 gap-2 border-slate-500/50 hover:bg-slate-500/20"
                                  onClick={() => {
                                    const now = new Date();
                                    let nextStart: string | null = null;
                                    if (matchForm.day_start_time) {
                                      const tomorrow = new Date(now);
                                      tomorrow.setDate(tomorrow.getDate() + 1);
                                      const [hours, minutes] = matchForm.day_start_time.split(':').map(Number);
                                      tomorrow.setHours(hours, minutes, 0, 0);
                                      nextStart = tomorrow.toISOString();
                                    }
                                    setMatchForm({
                                      ...matchForm,
                                      is_stumps: true,
                                      stumps_time: now.toISOString(),
                                      next_day_start: nextStart,
                                    });
                                    toast({ title: "STUMPS set", description: "Don't forget to save the match!" });
                                  }}
                                >
                                  <Moon className="w-4 h-4" />
                                  Call STUMPS Now
                                </Button>
                              ) : (
                                <Button
                                  type="button"
                                  variant="outline"
                                  className="flex-1 gap-2 border-green-500/50 hover:bg-green-500/20 text-green-500"
                                  onClick={() => {
                                    setMatchForm({
                                      ...matchForm,
                                      is_stumps: false,
                                      test_day: (matchForm.test_day || 1) + 1,
                                      next_day_start: null,
                                      stumps_time: null,
                                    });
                                    toast({ title: "Play resumed", description: `Day ${(matchForm.test_day || 1) + 1} set. Don't forget to save!` });
                                  }}
                                >
                                  <Play className="w-4 h-4" />
                                  Resume Play (Start Day {(matchForm.test_day || 1) + 1})
                                </Button>
                              )}
                            </div>

                            {/* Current Status */}
                            {matchForm.is_stumps && (
                              <Badge className="bg-slate-600 text-white">
                                <Moon className="w-3 h-3 mr-1" />
                                STUMPS - Day {matchForm.test_day || 1} ended
                              </Badge>
                            )}

                            <div className="space-y-2">
                              <Label className="flex items-center gap-1.5">
                                <Sun className="w-3 h-3 text-yellow-500" />
                                Daily Start Time (Auto-Resume)
                              </Label>
                              <Input
                                type="time"
                                value={matchForm.day_start_time || ''}
                                onChange={(e) => setMatchForm({ ...matchForm, day_start_time: e.target.value || null })}
                                placeholder="10:00"
                              />
                              <p className="text-xs text-muted-foreground">
                                At this time daily, Day auto-increments & STUMPS is removed.
                              </p>
                            </div>

                            <div className="space-y-2">
                              <Label className="flex items-center gap-1.5">
                                <Moon className="w-3 h-3 text-slate-400" />
                                Daily STUMPS Time (Auto-Call)
                              </Label>
                              <Input
                                type="time"
                                value={matchForm.daily_stumps_time || ''}
                                onChange={(e) => setMatchForm({ ...matchForm, daily_stumps_time: e.target.value || null })}
                                placeholder="17:00"
                              />
                              <p className="text-xs text-muted-foreground">
                                At this time daily, STUMPS is called automatically.
                              </p>
                            </div>
                          </div>
                        )}
                      </div>

                      {matchForm.status !== 'upcoming' && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

              {/* Match Search & Filter */}
              <div className="flex flex-col md:flex-row gap-4">
                <Input
                  placeholder="Search matches by team name, tournament, or venue..."
                  value={matchSearchQuery}
                  onChange={(e) => setMatchSearchQuery(e.target.value)}
                  className="max-w-md"
                />
                <div className="flex flex-wrap gap-2">
                  {(['all', 'live', 'upcoming', 'completed'] as const).map((status) => (
                    <Button
                      key={status}
                      variant={matchStatusFilter === status ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setMatchStatusFilter(status)}
                      className="capitalize"
                    >
                      {status}
                    </Button>
                  ))}
                  <Select value={matchSportFilter} onValueChange={setMatchSportFilter}>
                    <SelectTrigger className="w-[140px]">
                      <SelectValue placeholder="All Sports" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Sports</SelectItem>
                      {sports?.map((sport) => (
                        <SelectItem key={sport.id} value={sport.id}>{sport.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {matchesLoading ? (
                <div className="text-center py-8"><Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" /></div>
              ) : (() => {
                const filteredMatches = matches
                  ?.filter((match) => {
                    if (matchStatusFilter !== 'all' && match.status !== matchStatusFilter) return false;
                    if (matchSportFilter !== 'all' && match.sport_id !== matchSportFilter) return false;
                    if (!matchSearchQuery.trim()) return true;
                    const query = matchSearchQuery.toLowerCase();
                    return (
                      match.team_a?.name?.toLowerCase().includes(query) ||
                      match.team_b?.name?.toLowerCase().includes(query) ||
                      match.team_a?.short_name?.toLowerCase().includes(query) ||
                      match.team_b?.short_name?.toLowerCase().includes(query) ||
                      match.tournament?.name?.toLowerCase().includes(query) ||
                      match.venue?.toLowerCase().includes(query) ||
                      match.match_label?.toLowerCase().includes(query)
                    );
                  })
                  .sort((a, b) => {
                    const statusOrder = { live: 0, upcoming: 1, completed: 2 };
                    const statusDiff = statusOrder[a.status] - statusOrder[b.status];
                    if (statusDiff !== 0) return statusDiff;
                    const timeA = a.match_start_time ? new Date(a.match_start_time).getTime() : 0;
                    const timeB = b.match_start_time ? new Date(b.match_start_time).getTime() : 0;
                    return timeA - timeB;
                  }) || [];
                const filteredMatchIds = filteredMatches.map(m => m.id);
                const allSelected = filteredMatchIds.length > 0 && filteredMatchIds.every(id => selectedMatches.has(id));
                
                return (
                  <div className="space-y-4">
                    {/* Bulk Actions Bar */}
                    {filteredMatches.length > 0 && (
                      <div className="flex items-center gap-4 p-3 rounded-lg bg-muted/50 border">
                        <div className="flex items-center gap-2">
                          <Checkbox
                            checked={allSelected}
                            onCheckedChange={() => toggleAllMatchesSelection(filteredMatchIds)}
                          />
                          <span className="text-sm text-muted-foreground">
                            {selectedMatches.size > 0 ? `${selectedMatches.size} selected` : 'Select all'}
                          </span>
                        </div>
                        {selectedMatches.size > 0 && (
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => setBulkDeleteMatchesDialogOpen(true)}
                            disabled={isBulkDeleting}
                          >
                            {isBulkDeleting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                            <Trash2 className="w-4 h-4 mr-1" />
                            Delete {selectedMatches.size}
                          </Button>
                        )}
                      </div>
                    )}
                    
                    <div className="grid gap-4">
                      {filteredMatches.length === 0 && (
                        <p className="text-center text-muted-foreground py-8">No matches yet. Add your first match!</p>
                      )}
                      {filteredMatches.map((match, index) => (
                        <motion.div
                          key={match.id}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: index * 0.05 }}
                        >
                          <Card className={`hover:border-primary/50 transition-colors ${match.is_priority ? 'border-yellow-500/50 bg-yellow-500/5' : ''} ${selectedMatches.has(match.id) ? 'border-primary bg-primary/5' : ''}`}>
                            <CardContent className="p-4">
                              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                <div className="flex items-start gap-3 flex-1">
                                  <Checkbox
                                    checked={selectedMatches.has(match.id)}
                                    onCheckedChange={() => toggleMatchSelection(match.id)}
                                    className="mt-1"
                                  />
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
                                </div>
                                <div className="flex items-center gap-2">
                                  <Badge variant={match.status === 'live' ? 'live' : match.status === 'completed' ? 'completed' : 'upcoming'}>
                                    {match.status}
                                  </Badge>
                                  {match.sport?.name?.toLowerCase() === 'cricket' && (
                                    <Button 
                                      variant="outline" 
                                      size="sm"
                                      onClick={() => {
                                        setSelectedMatchForInnings(match);
                                        setInningsDialogOpen(true);
                                      }}
                                    >
                                      <Play className="w-3 h-3 mr-1" />
                                      Innings
                                    </Button>
                                  )}
                                  <Button 
                                    variant="outline" 
                                    size="sm"
                                    onClick={() => {
                                      setSelectedMatchForPlayingXI(match);
                                      setPlayingXIDialogOpen(true);
                                    }}
                                  >
                                    <Users className="w-3 h-3 mr-1" />
                                    XI
                                  </Button>
                                  <Button variant="ghost" size="icon" onClick={() => handleEditMatch(match)} title="Edit match">
                                    <Edit2 className="w-4 h-4" />
                                  </Button>
                                  <Button variant="ghost" size="icon" onClick={() => handleCopyMatch(match)} title="Duplicate match">
                                    <Copy className="w-4 h-4 text-primary" />
                                  </Button>
                                  {match.page_type === 'page' && (
                                    <Button 
                                      variant="ghost" 
                                      size="icon" 
                                      onClick={() => submitMatchForIndexing(match.id)} 
                                      title="Submit to Google"
                                    >
                                      <Globe className="w-4 h-4 text-green-500" />
                                    </Button>
                                  )}
                                  <Button variant="ghost" size="icon" onClick={() => handleDeleteMatch(match.id)} title="Delete match">
                                    <Trash2 className="w-4 h-4 text-destructive" />
                                  </Button>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                );
              })()}
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
            <TabsContent value="streaming" className="space-y-4 sm:space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h2 className="text-lg sm:text-xl font-semibold">Streaming Servers</h2>
                  <p className="text-xs sm:text-sm text-muted-foreground">Manage M3U8 and iframe links for each match</p>
                </div>
              </div>

              {/* Streaming Search & Filter */}
              <div className="flex flex-col gap-3">
                <Input
                  placeholder="Search matches by team name..."
                  value={streamingSearchQuery}
                  onChange={(e) => setStreamingSearchQuery(e.target.value)}
                  className="w-full"
                />
                <div className="flex flex-wrap gap-2">
                  {(['all', 'live', 'upcoming', 'completed'] as const).map((status) => (
                    <Button
                      key={status}
                      variant={streamingStatusFilter === status ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setStreamingStatusFilter(status)}
                      className="capitalize text-xs sm:text-sm"
                    >
                      {status}
                    </Button>
                  ))}
                  <Select value={streamingSportFilter} onValueChange={setStreamingSportFilter}>
                    <SelectTrigger className="w-[120px] sm:w-[140px] text-xs sm:text-sm">
                      <SelectValue placeholder="All Sports" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Sports</SelectItem>
                      {sports?.map((sport) => (
                        <SelectItem key={sport.id} value={sport.id}>{sport.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {matchesLoading ? (
                <div className="text-center py-8"><Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" /></div>
              ) : (
                <div className="space-y-4">
                  {matches?.length === 0 && (
                    <p className="text-center text-muted-foreground py-8">No matches available. Create matches first to add streaming servers.</p>
                  )}
                  {matches
                    ?.filter(m => m.page_type === 'page')
                    .filter((match) => {
                      // Status filter
                      if (streamingStatusFilter !== 'all' && match.status !== streamingStatusFilter) return false;
                      // Sport filter
                      if (streamingSportFilter !== 'all' && match.sport_id !== streamingSportFilter) return false;
                      // Search filter
                      if (!streamingSearchQuery.trim()) return true;
                      const query = streamingSearchQuery.toLowerCase();
                      return (
                        match.team_a?.name?.toLowerCase().includes(query) ||
                        match.team_b?.name?.toLowerCase().includes(query) ||
                        match.team_a?.short_name?.toLowerCase().includes(query) ||
                        match.team_b?.short_name?.toLowerCase().includes(query)
                      );
                    })
                    .sort((a, b) => {
                      // Sort by status: live first, then upcoming, then completed
                      const statusOrder = { live: 0, upcoming: 1, completed: 2 };
                      const statusDiff = statusOrder[a.status] - statusOrder[b.status];
                      if (statusDiff !== 0) return statusDiff;
                      // Within same status, sort by start time
                      const timeA = a.match_start_time ? new Date(a.match_start_time).getTime() : 0;
                      const timeB = b.match_start_time ? new Date(b.match_start_time).getTime() : 0;
                      return timeA - timeB;
                    })
                    .map((match, index) => (
                    <motion.div
                      key={match.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.03 }}
                    >
                      <Card className="hover:border-primary/50 transition-colors">
                        <CardContent className="p-3 sm:p-4">
                          <div className="flex flex-col gap-3">
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-gradient-to-br from-primary/30 to-accent/20 flex items-center justify-center border border-primary/20 flex-shrink-0">
                                <Tv className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="font-semibold text-sm sm:text-base truncate">
                                  {match.team_a?.name || 'TBA'} vs {match.team_b?.name || 'TBA'}
                                </p>
                                <p className="text-xs sm:text-sm text-muted-foreground truncate">
                                  {match.match_date} • {match.match_time}
                                </p>
                              </div>
                              <Badge variant={match.status} className="text-xs flex-shrink-0">{match.status}</Badge>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <Button 
                                variant="gradient" 
                                size="sm"
                                onClick={() => {
                                  setSelectedMatchForStreaming(match);
                                  setStreamingDialogOpen(true);
                                }}
                                className="flex-1 sm:flex-none text-xs sm:text-sm"
                              >
                                <Tv className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
                                Servers
                              </Button>
                              {match.sport?.name?.toLowerCase() === 'cricket' && (
                                <Button 
                                  variant="outline" 
                                  size="sm"
                                  onClick={() => {
                                    setSelectedMatchForInnings(match);
                                    setInningsDialogOpen(true);
                                  }}
                                  className="flex-1 sm:flex-none text-xs sm:text-sm"
                                >
                                  <Play className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
                                  Innings
                                </Button>
                              )}
                              <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => {
                                  setSelectedMatchForPlayingXI(match);
                                  setPlayingXIDialogOpen(true);
                                }}
                                className="flex-1 sm:flex-none text-xs sm:text-sm"
                              >
                                <Users className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
                                XI
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

            {/* Innings Management Dialog */}
            <Dialog open={inningsDialogOpen} onOpenChange={(open) => {
              setInningsDialogOpen(open);
              if (!open) setSelectedMatchForInnings(null);
            }}>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>
                    Manage Innings - {selectedMatchForInnings?.team_a?.name} vs {selectedMatchForInnings?.team_b?.name}
                  </DialogTitle>
                </DialogHeader>
                {selectedMatchForInnings && selectedMatchForInnings.team_a && selectedMatchForInnings.team_b && (
                  <InningsManager
                    matchId={selectedMatchForInnings.id}
                    teamA={selectedMatchForInnings.team_a}
                    teamB={selectedMatchForInnings.team_b}
                    matchFormat={selectedMatchForInnings.match_format}
                  />
                )}
              </DialogContent>
            </Dialog>

            {/* Playing XI Management Dialog */}
            <Dialog open={playingXIDialogOpen} onOpenChange={(open) => {
              setPlayingXIDialogOpen(open);
              if (!open) setSelectedMatchForPlayingXI(null);
            }}>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>
                    Playing XI - {selectedMatchForPlayingXI?.team_a?.name} vs {selectedMatchForPlayingXI?.team_b?.name}
                  </DialogTitle>
                </DialogHeader>
                {selectedMatchForPlayingXI && selectedMatchForPlayingXI.team_a && selectedMatchForPlayingXI.team_b && (
                  selectedMatchForPlayingXI.sport?.name?.toLowerCase() === 'football' ? (
                    <FootballPlayingXIManager
                      matchId={selectedMatchForPlayingXI.id}
                      teamA={selectedMatchForPlayingXI.team_a}
                      teamB={selectedMatchForPlayingXI.team_b}
                    />
                  ) : (
                    <PlayingXIManager
                      matchId={selectedMatchForPlayingXI.id}
                      teamA={selectedMatchForPlayingXI.team_a}
                      teamB={selectedMatchForPlayingXI.team_b}
                    />
                  )
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

              {/* Team Search */}
              <div className="mb-4">
                <Input
                  placeholder="Search teams by name or short name..."
                  value={teamSearchQuery}
                  onChange={(e) => setTeamSearchQuery(e.target.value)}
                  className="max-w-md"
                />
              </div>

              {teamsLoading ? (
                <div className="text-center py-8"><Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" /></div>
              ) : (() => {
                const filteredTeams = teams
                  ?.filter((team) => {
                    if (!teamSearchQuery.trim()) return true;
                    const query = teamSearchQuery.toLowerCase();
                    return (
                      team.name?.toLowerCase().includes(query) ||
                      team.short_name?.toLowerCase().includes(query)
                    );
                  }) || [];
                const filteredTeamIds = filteredTeams.map(t => t.id);
                const allSelected = filteredTeamIds.length > 0 && filteredTeamIds.every(id => selectedTeams.has(id));

                return (
                  <div className="space-y-4">
                    {/* Bulk Actions Bar */}
                    {filteredTeams.length > 0 && (
                      <div className="flex items-center gap-4 p-3 rounded-lg bg-muted/50 border">
                        <div className="flex items-center gap-2">
                          <Checkbox
                            checked={allSelected}
                            onCheckedChange={() => toggleAllTeamsSelection(filteredTeamIds)}
                          />
                          <span className="text-sm text-muted-foreground">
                            {selectedTeams.size > 0 ? `${selectedTeams.size} selected` : 'Select all'}
                          </span>
                        </div>
                        {selectedTeams.size > 0 && (
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => setBulkDeleteTeamsDialogOpen(true)}
                            disabled={isBulkDeleting}
                          >
                            {isBulkDeleting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                            <Trash2 className="w-4 h-4 mr-1" />
                            Delete {selectedTeams.size}
                          </Button>
                        )}
                      </div>
                    )}

                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                      {filteredTeams.length === 0 && (
                        <p className="text-center text-muted-foreground py-8 col-span-full">No teams yet. Add your first team!</p>
                      )}
                      {filteredTeams.map((team, index) => (
                        <motion.div
                          key={team.id}
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: index * 0.05 }}
                        >
                          <Card className={`hover:border-primary/50 transition-colors ${selectedTeams.has(team.id) ? 'border-primary bg-primary/5' : ''}`}>
                            <CardContent className="p-4">
                              <div className="flex items-center gap-4">
                                <Checkbox
                                  checked={selectedTeams.has(team.id)}
                                  onCheckedChange={() => toggleTeamSelection(team.id)}
                                />
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
                  </div>
                );
              })()}
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
                  <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>{editingTournament ? 'Edit Tournament' : 'Add New Tournament'}</DialogTitle>
                      <DialogDescription>
                        Fill in the tournament details below
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                          <Label>URL Slug</Label>
                          <Input placeholder="e.g., bpl-2025" value={tournamentForm.slug} onChange={(e) => setTournamentForm({ ...tournamentForm, slug: e.target.value })} />
                        </div>
                        <div className="space-y-2 md:col-span-2">
                          <Label>Logo URL (optional)</Label>
                          <Input placeholder="https://..." value={tournamentForm.logo_url} onChange={(e) => setTournamentForm({ ...tournamentForm, logo_url: e.target.value })} />
                        </div>
                      </div>

                      {/* Display Settings */}
                      <div className="border-t pt-4 mt-4">
                        <h4 className="font-medium mb-3 text-sm text-muted-foreground">Display Settings</h4>
                        <div className="flex items-center justify-between rounded-lg border p-4 shadow-sm">
                          <div className="space-y-0.5">
                            <Label className="text-base font-medium">Show in Menu</Label>
                            <p className="text-sm text-muted-foreground">Display this tournament in the navigation menu dropdown</p>
                          </div>
                          <Switch
                            checked={tournamentForm.show_in_menu}
                            onCheckedChange={(checked) => setTournamentForm({ ...tournamentForm, show_in_menu: checked })}
                          />
                        </div>
                      </div>
                      
                      {/* SEO Section */}
                      <div className="border-t pt-4 mt-4">
                        <h4 className="font-medium mb-3 text-sm text-muted-foreground">SEO Settings</h4>
                        <div className="space-y-4">
                          <div className="space-y-2">
                            <Label>SEO Title</Label>
                            <Input 
                              placeholder="e.g., BPL 2025 Live Scores & Schedule" 
                              value={tournamentForm.seo_title} 
                              onChange={(e) => setTournamentForm({ ...tournamentForm, seo_title: e.target.value })} 
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>SEO Description</Label>
                            <Textarea 
                              placeholder="A brief description for search engines (150-160 characters recommended)" 
                              value={tournamentForm.seo_description} 
                              onChange={(e) => setTournamentForm({ ...tournamentForm, seo_description: e.target.value })}
                              rows={3}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>SEO Keywords</Label>
                            <Input 
                              placeholder="e.g., BPL 2025, Bangladesh Premier League, cricket live" 
                              value={tournamentForm.seo_keywords} 
                              onChange={(e) => setTournamentForm({ ...tournamentForm, seo_keywords: e.target.value })} 
                            />
                          </div>
                        </div>
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

              {/* Tournament Search */}
              <div className="mb-4">
                <Input
                  placeholder="Search tournaments by name or sport..."
                  value={tournamentSearchQuery}
                  onChange={(e) => setTournamentSearchQuery(e.target.value)}
                  className="max-w-md"
                />
              </div>

              {tournamentsLoading ? (
                <div className="text-center py-8"><Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" /></div>
              ) : (() => {
                const filteredTournaments = tournaments
                  ?.filter((tournament) => {
                    if (!tournamentSearchQuery.trim()) return true;
                    const query = tournamentSearchQuery.toLowerCase();
                    return (
                      tournament.name?.toLowerCase().includes(query) ||
                      tournament.sport?.toLowerCase().includes(query) ||
                      tournament.season?.toLowerCase().includes(query)
                    );
                  }) || [];
                const filteredTournamentIds = filteredTournaments.map(t => t.id);
                const allSelected = filteredTournamentIds.length > 0 && filteredTournamentIds.every(id => selectedTournaments.has(id));

                return (
                  <div className="space-y-4">
                    {/* Bulk Actions Bar */}
                    {filteredTournaments.length > 0 && (
                      <div className="flex items-center gap-4 p-3 rounded-lg bg-muted/50 border">
                        <div className="flex items-center gap-2">
                          <Checkbox
                            checked={allSelected}
                            onCheckedChange={() => toggleAllTournamentsSelection(filteredTournamentIds)}
                          />
                          <span className="text-sm text-muted-foreground">
                            {selectedTournaments.size > 0 ? `${selectedTournaments.size} selected` : 'Select all'}
                          </span>
                        </div>
                        {selectedTournaments.size > 0 && (
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => setBulkDeleteTournamentsDialogOpen(true)}
                            disabled={isBulkDeleting}
                          >
                            {isBulkDeleting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                            <Trash2 className="w-4 h-4 mr-1" />
                            Delete {selectedTournaments.size}
                          </Button>
                        )}
                      </div>
                    )}

                    <div className="grid gap-4 md:grid-cols-2">
                      {filteredTournaments.length === 0 && (
                        <p className="text-center text-muted-foreground py-8 col-span-full">No tournaments yet. Add your first tournament!</p>
                      )}
                      {filteredTournaments.map((tournament, index) => (
                        <motion.div
                          key={tournament.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: index * 0.1 }}
                        >
                          <Card className={`hover:border-primary/50 transition-colors ${selectedTournaments.has(tournament.id) ? 'border-primary bg-primary/5' : ''}`}>
                            <CardContent className="p-6">
                              <div className="flex items-start justify-between">
                                <div className="flex items-start gap-4">
                                  <Checkbox
                                    checked={selectedTournaments.has(tournament.id)}
                                    onCheckedChange={() => toggleTournamentSelection(tournament.id)}
                                    className="mt-1"
                                  />
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
                                  {tournament.slug && (
                                    <Button 
                                      variant="ghost" 
                                      size="icon" 
                                      onClick={() => submitTournamentForIndexing(tournament.slug!)} 
                                      title="Submit to Google"
                                    >
                                      <Globe className="w-4 h-4 text-green-500" />
                                    </Button>
                                  )}
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
                  </div>
                );
              })()}
            </TabsContent>

            {/* Points Table Tab */}
            <TabsContent value="points-table" className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold mb-2">Tournament Points Tables</h2>
                <p className="text-sm text-muted-foreground">Manage team standings for each tournament</p>
              </div>

              {tournamentsLoading || teamsLoading ? (
                <div className="text-center py-8"><Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" /></div>
              ) : tournaments && tournaments.length > 0 ? (
                <div className="space-y-6">
                  {tournaments.map((tournament) => (
                    <Card key={tournament.id}>
                      <CardContent className="p-6">
                        <PointsTableManager 
                          tournament={tournament} 
                          teams={teams || []} 
                        />
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">No tournaments yet. Create tournaments first to manage points tables.</p>
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
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

            {/* Pages Tab */}
            <TabsContent value="pages" className="space-y-6">
              <DynamicPagesManager />
            </TabsContent>

            {/* Ads Tab */}
            <TabsContent value="ads" className="space-y-6">
              <AdsSettingsManager />
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

                      {/* Text File Upload Section */}
                      <div className="space-y-4 pt-4 border-t border-border">
                        <div className="space-y-2">
                          <Label className="flex items-center gap-2">
                            <FileText className="w-4 h-4" />
                            Import Settings from .txt File
                          </Label>
                          <div className="flex items-center gap-2">
                            <Input
                              type="file"
                              accept=".txt"
                              className="flex-1"
                              onChange={async (e) => {
                                const file = e.target.files?.[0];
                                if (!file) return;
                                
                                try {
                                  const text = await file.text();
                                  const lines = text.split('\n');
                                  const settings: Record<string, string> = {};
                                  
                                  for (const line of lines) {
                                    const [key, ...valueParts] = line.split('=');
                                    if (key && valueParts.length > 0) {
                                      const trimmedKey = key.trim();
                                      const value = valueParts.join('=').trim();
                                      settings[trimmedKey] = value;
                                    }
                                  }
                                  
                                  // Update form with parsed settings
                                  setSiteSettingsForm(prev => ({
                                    ...prev,
                                    site_name: settings.site_name || prev.site_name,
                                    site_title: settings.site_title || prev.site_title,
                                    site_description: settings.site_description || prev.site_description,
                                    site_keywords: settings.site_keywords || prev.site_keywords,
                                    logo_url: settings.logo_url || prev.logo_url,
                                    favicon_url: settings.favicon_url || prev.favicon_url,
                                    og_image_url: settings.og_image_url || prev.og_image_url,
                                    footer_text: settings.footer_text || prev.footer_text,
                                    google_analytics_id: settings.google_analytics_id || prev.google_analytics_id,
                                    telegram_link: settings.telegram_link || prev.telegram_link,
                                    canonical_url: settings.canonical_url || prev.canonical_url,
                                    twitter_handle: settings.twitter_handle || prev.twitter_handle,
                                    facebook_app_id: settings.facebook_app_id || prev.facebook_app_id,
                                    google_adsense_id: settings.google_adsense_id || prev.google_adsense_id,
                                  }));
                                  
                                  toast({ 
                                    title: "Settings imported", 
                                    description: "Settings loaded from file. Click 'Save All Settings' to apply." 
                                  });
                                } catch (error) {
                                  toast({ 
                                    title: "Error", 
                                    description: "Failed to parse settings file", 
                                    variant: "destructive" 
                                  });
                                }
                                e.target.value = '';
                              }}
                            />
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Upload a .txt file with key=value format (one per line). E.g., site_name=My Site
                          </p>
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

                  {/* Custom Code Injection */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Custom Code Injection</CardTitle>
                      <CardDescription>Add custom scripts to header and footer sections of your site</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      <div className="space-y-2">
                        <Label>Custom Header Code</Label>
                        <Textarea 
                          placeholder={"<!-- Custom scripts for <head> section -->\n<script>\n  // Your custom JavaScript here\n</script>"}
                          value={siteSettingsForm.custom_header_code} 
                          onChange={(e) => setSiteSettingsForm({ ...siteSettingsForm, custom_header_code: e.target.value })} 
                          rows={6}
                          className="font-mono text-xs"
                        />
                        <p className="text-xs text-muted-foreground">Code will be injected into the &lt;head&gt; section. Use for analytics, tracking pixels, or custom stylesheets.</p>
                      </div>

                      <div className="space-y-2">
                        <Label>Custom Footer Code</Label>
                        <Textarea 
                          placeholder={"<!-- Custom scripts for footer section -->\n<script>\n  // Your custom JavaScript here\n</script>"}
                          value={siteSettingsForm.custom_footer_code} 
                          onChange={(e) => setSiteSettingsForm({ ...siteSettingsForm, custom_footer_code: e.target.value })} 
                          rows={6}
                          className="font-mono text-xs"
                        />
                        <p className="text-xs text-muted-foreground">Code will be injected before the closing &lt;/body&gt; tag. Use for chat widgets, tracking scripts, etc.</p>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Cricket API Settings */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Cricket Score API</CardTitle>
                      <CardDescription>Configure live cricket score updates from CricketData.org API</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      <div className="flex items-center justify-between rounded-lg border p-4 shadow-sm">
                        <div className="space-y-0.5">
                          <Label className="text-base font-medium">Enable Live Scores</Label>
                          <p className="text-sm text-muted-foreground">Globally enable/disable live score updates from API</p>
                        </div>
                        <Switch
                          checked={siteSettingsForm.cricket_api_enabled}
                          onCheckedChange={(checked) => setSiteSettingsForm({ ...siteSettingsForm, cricket_api_enabled: checked })}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Cricket API Key</Label>
                        <Input 
                          type="password"
                          placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" 
                          value={siteSettingsForm.cricket_api_key} 
                          onChange={(e) => setSiteSettingsForm({ ...siteSettingsForm, cricket_api_key: e.target.value })} 
                        />
                        <p className="text-xs text-muted-foreground">
                          Get your free API key from{' '}
                          <a href="https://cricketdata.org/signup.aspx" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                            cricketdata.org
                          </a>
                        </p>
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

                  {/* Ads.txt Settings */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <FileText className="w-5 h-5" />
                        ads.txt
                      </CardTitle>
                      <CardDescription>
                        Configure your ads.txt file for ad verification. Access it at /ads.txt
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <Label>ads.txt Content</Label>
                        <Textarea 
                          placeholder={"google.com, pub-0000000000000000, DIRECT, f08c47fec0942fa0\n# Add your ad network entries here..."}
                          value={siteSettingsForm.ads_txt_content} 
                          onChange={(e) => setSiteSettingsForm({ ...siteSettingsForm, ads_txt_content: e.target.value })} 
                          rows={8}
                          className="font-mono text-xs"
                        />
                        <p className="text-xs text-muted-foreground">
                          Each line should follow the format: domain, publisher-id, relationship, certification-authority-id
                        </p>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Security Settings */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Security</CardTitle>
                      <CardDescription>Manage your account security settings</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Button variant="outline" onClick={() => setPasswordDialogOpen(true)}>
                        Change Password
                      </Button>
                    </CardContent>
                  </Card>

                  <div className="flex justify-end pt-4">
                    <Button variant="gradient" onClick={handleSaveSiteSettings} disabled={updateSiteSettings.isPending}>
                      {updateSiteSettings.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                      <Save className="w-4 h-4 mr-2" />
                      Save All Settings
                    </Button>
                  </div>

                  <PasswordChangeDialog open={passwordDialogOpen} onOpenChange={setPasswordDialogOpen} />
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </main>
      <Footer />

      {/* Bulk Delete Confirmation Dialogs */}
      <AlertDialog open={bulkDeleteMatchesDialogOpen} onOpenChange={setBulkDeleteMatchesDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedMatches.size} Match{selectedMatches.size > 1 ? 'es' : ''}?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the selected match{selectedMatches.size > 1 ? 'es' : ''} and all associated data including streaming servers and innings.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDeleteMatches}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isBulkDeleting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Delete {selectedMatches.size} Match{selectedMatches.size > 1 ? 'es' : ''}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={bulkDeleteTeamsDialogOpen} onOpenChange={setBulkDeleteTeamsDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedTeams.size} Team{selectedTeams.size > 1 ? 's' : ''}?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the selected team{selectedTeams.size > 1 ? 's' : ''}. Make sure no matches are using these teams.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDeleteTeams}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isBulkDeleting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Delete {selectedTeams.size} Team{selectedTeams.size > 1 ? 's' : ''}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={bulkDeleteTournamentsDialogOpen} onOpenChange={setBulkDeleteTournamentsDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedTournaments.size} Tournament{selectedTournaments.size > 1 ? 's' : ''}?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the selected tournament{selectedTournaments.size > 1 ? 's' : ''} and may affect associated matches.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDeleteTournaments}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isBulkDeleting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Delete {selectedTournaments.size} Tournament{selectedTournaments.size > 1 ? 's' : ''}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Admin;
