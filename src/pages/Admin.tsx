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
  useMatches, useTeams, useTournaments, useBanners,
  useCreateMatch, useUpdateMatch, useDeleteMatch,
  useCreateTeam, useUpdateTeam, useDeleteTeam,
  useCreateTournament, useUpdateTournament, useDeleteTournament,
  useCreateBanner, useUpdateBanner, useDeleteBanner,
  Match, Team, Tournament, Banner
} from "@/hooks/useSportsData";
import { useState, useEffect } from "react";
import { Plus, Edit2, Trash2, Calendar, Trophy, Users, LogOut, Loader2, Image, Link as LinkIcon } from "lucide-react";
import { motion } from "framer-motion";
import { useToast } from "@/hooks/use-toast";

const Admin = () => {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  // Data hooks
  const { data: matches, isLoading: matchesLoading } = useMatches();
  const { data: teams, isLoading: teamsLoading } = useTeams();
  const { data: tournaments, isLoading: tournamentsLoading } = useTournaments();
  const { data: banners, isLoading: bannersLoading } = useBanners();

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

  // Dialog states
  const [matchDialogOpen, setMatchDialogOpen] = useState(false);
  const [teamDialogOpen, setTeamDialogOpen] = useState(false);
  const [tournamentDialogOpen, setTournamentDialogOpen] = useState(false);
  const [bannerDialogOpen, setBannerDialogOpen] = useState(false);
  const [editingMatch, setEditingMatch] = useState<Match | null>(null);
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [editingTournament, setEditingTournament] = useState<Tournament | null>(null);
  const [editingBanner, setEditingBanner] = useState<Banner | null>(null);

  // Form states
  const [matchForm, setMatchForm] = useState({
    tournament_id: '',
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

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
    }
  }, [user, loading, navigate]);

  if (loading) {
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
      const matchData = {
        ...matchForm,
        venue: matchForm.venue || null,
        score_a: matchForm.score_a || null,
        score_b: matchForm.score_b || null,
        match_link: matchForm.match_link || null,
        match_duration_minutes: matchForm.match_duration_minutes || 180,
        match_start_time: matchForm.match_start_time || null,
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
      tournament_id: match.tournament_id,
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
                Manage matches, teams, tournaments & banners
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
              <TabsTrigger value="teams" className="gap-2">
                <Users className="w-4 h-4" />
                Teams
              </TabsTrigger>
              <TabsTrigger value="tournaments" className="gap-2">
                <Trophy className="w-4 h-4" />
                Tournaments
              </TabsTrigger>
              <TabsTrigger value="banners" className="gap-2">
                <Image className="w-4 h-4" />
                Banners
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
                      <div className="space-y-2">
                        <Label>Tournament</Label>
                        <Select value={matchForm.tournament_id} onValueChange={(v) => setMatchForm({ ...matchForm, tournament_id: v })}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select tournament" />
                          </SelectTrigger>
                          <SelectContent>
                            {tournaments?.map((t) => (
                              <SelectItem key={t.id} value={t.id}>{t.name} {t.season}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Team A</Label>
                          <Select value={matchForm.team_a_id} onValueChange={(v) => setMatchForm({ ...matchForm, team_a_id: v })}>
                            <SelectTrigger>
                              <SelectValue placeholder="Select team" />
                            </SelectTrigger>
                            <SelectContent>
                              {teams?.map((t) => (
                                <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Team B</Label>
                          <Select value={matchForm.team_b_id} onValueChange={(v) => setMatchForm({ ...matchForm, team_b_id: v })}>
                            <SelectTrigger>
                              <SelectValue placeholder="Select team" />
                            </SelectTrigger>
                            <SelectContent>
                              {teams?.map((t) => (
                                <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
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
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Match Date</Label>
                          <Input placeholder="e.g., 26th December 2025" value={matchForm.match_date} onChange={(e) => setMatchForm({ ...matchForm, match_date: e.target.value })} />
                        </div>
                        <div className="space-y-2">
                          <Label>Match Time</Label>
                          <Input placeholder="e.g., 3:00 PM" value={matchForm.match_time} onChange={(e) => setMatchForm({ ...matchForm, match_time: e.target.value })} />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Duration (minutes)</Label>
                          <Input type="number" placeholder="180" value={matchForm.match_duration_minutes} onChange={(e) => setMatchForm({ ...matchForm, match_duration_minutes: parseInt(e.target.value) || 180 })} />
                        </div>
                        <div className="space-y-2">
                          <Label>Venue</Label>
                          <Input placeholder="Stadium name" value={matchForm.venue} onChange={(e) => setMatchForm({ ...matchForm, venue: e.target.value })} />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label className="flex items-center gap-2">
                          <LinkIcon className="w-4 h-4" />
                          Match Link (redirect URL)
                        </Label>
                        <Input placeholder="https://..." value={matchForm.match_link} onChange={(e) => setMatchForm({ ...matchForm, match_link: e.target.value })} />
                      </div>
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
                      <Card className="hover:border-primary/50 transition-colors">
                        <CardContent className="p-4">
                          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                <Badge variant="sport">{match.tournament?.sport}</Badge>
                                <span className="text-muted-foreground text-sm">
                                  {match.tournament?.name} {match.tournament?.season}
                                </span>
                                {match.match_link && (
                                  <LinkIcon className="w-3 h-3 text-primary" />
                                )}
                              </div>
                              <p className="font-semibold text-lg">
                                {match.team_a?.name} vs {match.team_b?.name}
                              </p>
                              <p className="text-muted-foreground text-sm">
                                {match.match_date} • {match.match_time}
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
                            <SelectItem value="Cricket">Cricket</SelectItem>
                            <SelectItem value="Football">Football</SelectItem>
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
                        Banners appear above the match list
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>Title</Label>
                        <Input placeholder="e.g., Watch Live Now!" value={bannerForm.title} onChange={(e) => setBannerForm({ ...bannerForm, title: e.target.value })} />
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
                        <div className="space-y-2">
                          <Label>Active</Label>
                          <div className="flex items-center h-10">
                            <Switch checked={bannerForm.is_active} onCheckedChange={(checked) => setBannerForm({ ...bannerForm, is_active: checked })} />
                          </div>
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
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.05 }}
                    >
                      <Card className="hover:border-primary/50 transition-colors overflow-hidden">
                        <CardContent className="p-0">
                          <div className="flex items-stretch">
                            <div className="w-32 h-24 flex-shrink-0 bg-muted">
                              <img src={banner.image_url} alt={banner.title} className="w-full h-full object-cover" />
                            </div>
                            <div className="flex-1 p-4 flex items-center justify-between">
                              <div>
                                <p className="font-semibold">{banner.title}</p>
                                <div className="flex items-center gap-2 mt-1">
                                  <Badge variant={banner.is_active ? 'completed' : 'secondary'}>
                                    {banner.is_active ? 'Active' : 'Inactive'}
                                  </Badge>
                                  <span className="text-muted-foreground text-sm">Order: {banner.display_order}</span>
                                </div>
                              </div>
                              <div className="flex items-center gap-1">
                                <Button variant="ghost" size="icon" onClick={() => handleEditBanner(banner)}>
                                  <Edit2 className="w-4 h-4" />
                                </Button>
                                <Button variant="ghost" size="icon" onClick={() => handleDeleteBanner(banner.id)}>
                                  <Trash2 className="w-4 h-4 text-destructive" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  ))}
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