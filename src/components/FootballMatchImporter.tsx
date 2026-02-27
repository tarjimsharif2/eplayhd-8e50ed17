import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { Download, Loader2, RefreshCw, Clock, Trophy } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import SearchableSelect from "@/components/SearchableSelect";
import { useTeams, useTournaments, useSports } from "@/hooks/useSportsData";
import { useQueryClient } from '@tanstack/react-query';

interface ESPNMatch {
  homeTeam: string;
  awayTeam: string;
  homeScore: string | null;
  awayScore: string | null;
  status: string;
  minute: string | null;
  competition: string | null;
  matchUrl: string | null;
  startTime: string | null;
  venue?: string | null;
  eventId?: string;
  round?: string | null;
  homeTeamLogo?: string | null;
  awayTeamLogo?: string | null;
}

interface MatchToImport extends ESPNMatch {
  selected: boolean;
  teamAId: string | null;
  teamBId: string | null;
  tournamentId: string | null;
}

interface FootballMatchImporterProps {
  onImportComplete?: () => void;
}

// Static fallback leagues in case database is empty
const FALLBACK_LEAGUES = [
  { value: 'eng.1', label: 'Premier League' },
  { value: 'esp.1', label: 'La Liga' },
  { value: 'ger.1', label: 'Bundesliga' },
  { value: 'ita.1', label: 'Serie A' },
  { value: 'fra.1', label: 'Ligue 1' },
  { value: 'uefa.champions', label: 'UEFA Champions League' },
  { value: 'uefa.europa', label: 'UEFA Europa League' },
  { value: 'fifa.friendly', label: 'International Friendly' },
];

export default function FootballMatchImporter({ onImportComplete }: FootballMatchImporterProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: teams } = useTeams();
  const { data: tournaments } = useTournaments();
  const { data: sports } = useSports();

  const [open, setOpen] = useState(false);
  const [selectedLeague, setSelectedLeague] = useState('eng.1');
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [apiMatches, setApiMatches] = useState<MatchToImport[]>([]);
  const [defaultTournamentId, setDefaultTournamentId] = useState<string | null>(null);
  
  // Dynamic leagues from database
  const [leagues, setLeagues] = useState<{value: string, label: string}[]>([]);
  const [loadingLeagues, setLoadingLeagues] = useState(true);
  const [refreshingLeagues, setRefreshingLeagues] = useState(false);
  
  // Fetch leagues from database on mount
  useEffect(() => {
    const fetchLeagues = async () => {
      setLoadingLeagues(true);
      try {
        const { data, error } = await supabase
          .from('football_leagues')
          .select('league_code, league_name')
          .eq('is_active', true)
          .order('league_name');
        
        if (error) throw error;
        
        if (data && data.length > 0) {
          setLeagues(data.map(l => ({
            value: l.league_code,
            label: l.league_name
          })));
        } else {
          // Fallback to static list if database is empty
          setLeagues(FALLBACK_LEAGUES);
        }
      } catch (err) {
        console.error('Error fetching leagues:', err);
        setLeagues(FALLBACK_LEAGUES);
      } finally {
        setLoadingLeagues(false);
      }
    };
    fetchLeagues();
  }, []);
  
  // Refresh leagues from ESPN API
  const refreshLeagues = async () => {
    setRefreshingLeagues(true);
    try {
      const { data, error } = await supabase.functions.invoke('fetch-football-leagues');
      
      if (error) throw error;
      
      toast({
        title: "Leagues refreshed",
        description: `${data.inserted} new, ${data.updated} updated leagues`,
      });
      
      // Refetch from database
      const { data: newLeagues } = await supabase
        .from('football_leagues')
        .select('league_code, league_name')
        .eq('is_active', true)
        .order('league_name');
      
      if (newLeagues && newLeagues.length > 0) {
        setLeagues(newLeagues.map(l => ({
          value: l.league_code,
          label: l.league_name
        })));
      }
    } catch (err) {
      console.error('Error refreshing leagues:', err);
      toast({
        title: "Failed to refresh leagues",
        description: "Please try again later",
        variant: "destructive",
      });
    } finally {
      setRefreshingLeagues(false);
    }
  };

  // Get Football sport ID (handles emoji prefix like "⚽ Football")
  const footballSportId = sports?.find(s => 
    s.name.toLowerCase().includes('football') || s.name.toLowerCase().includes('soccer')
  )?.id;

  // Fuzzy match team name to database
  const findTeamMatch = (apiTeamName: string): string | null => {
    if (!teams) return null;
    
    const normalizedApiName = apiTeamName.toLowerCase().replace(/[^a-z0-9]/g, '');
    
    for (const team of teams) {
      const normalizedDbName = team.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      const normalizedShortName = team.short_name.toLowerCase().replace(/[^a-z0-9]/g, '');
      
      if (normalizedDbName === normalizedApiName || normalizedShortName === normalizedApiName) {
        return team.id;
      }
      
      // Partial match
      if (normalizedApiName.includes(normalizedDbName) || normalizedDbName.includes(normalizedApiName)) {
        return team.id;
      }
      
      // Check for common variations
      const apiWords = normalizedApiName.split(/(?=[A-Z])/).join('').toLowerCase();
      if (normalizedDbName.includes(apiWords) || apiWords.includes(normalizedDbName)) {
        return team.id;
      }
    }
    
    return null;
  };

  const fetchMatches = async () => {
    setLoading(true);
    try {
      // Use includeDetails: true to get round/matchday info from ESPN summary API
      const { data, error } = await supabase.functions.invoke('scrape-football-scores', {
        body: { league: selectedLeague, includeDetails: true }
      });

      if (error) throw error;

      if (data?.matches) {
        // Filter out completed matches - only import upcoming/live
        const filteredMatches = data.matches.filter((m: ESPNMatch) => {
          const status = m.status?.toLowerCase() || '';
          const isCompleted = status.includes('final') || status.includes('completed') || status.includes('ft') || status === 'full time';
          return !isCompleted;
        });

        const matchesWithMappings: MatchToImport[] = filteredMatches.map((m: ESPNMatch) => ({
          ...m,
          selected: false,
          teamAId: findTeamMatch(m.homeTeam),
          teamBId: findTeamMatch(m.awayTeam),
          tournamentId: defaultTournamentId,
        }));
        setApiMatches(matchesWithMappings);
        
        if (filteredMatches.length === 0 && data.matches.length > 0) {
          toast({
            title: "No upcoming matches",
            description: `All ${data.matches.length} matches are completed. Try a different league or wait for new fixtures.`,
          });
        }
      }
    } catch (error) {
      console.error('Error fetching matches:', error);
      toast({
        title: "Error",
        description: "Failed to fetch matches from ESPN",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  // Update all selected matches' tournament when default changes
  useEffect(() => {
    if (defaultTournamentId) {
      setApiMatches(prev => prev.map(m => ({
        ...m,
        tournamentId: m.tournamentId || defaultTournamentId
      })));
    }
  }, [defaultTournamentId]);

  const toggleMatchSelection = (index: number) => {
    setApiMatches(prev => prev.map((m, i) => 
      i === index ? { ...m, selected: !m.selected } : m
    ));
  };

  const updateMatchTeam = (index: number, field: 'teamAId' | 'teamBId', value: string | null) => {
    setApiMatches(prev => prev.map((m, i) => 
      i === index ? { ...m, [field]: value } : m
    ));
  };

  const updateMatchTournament = (index: number, value: string | null) => {
    setApiMatches(prev => prev.map((m, i) => 
      i === index ? { ...m, tournamentId: value } : m
    ));
  };

  const updateMatchRound = (index: number, value: string) => {
    setApiMatches(prev => prev.map((m, i) => 
      i === index ? { ...m, round: value || null } : m
    ));
  };

  const selectAllValid = () => {
    setApiMatches(prev => prev.map(m => ({
      ...m,
      selected: m.teamAId !== null && m.teamBId !== null
    })));
  };

  const deselectAll = () => {
    setApiMatches(prev => prev.map(m => ({ ...m, selected: false })));
  };

  const getMatchStatus = (apiStatus: string): 'upcoming' | 'live' | 'completed' => {
    const status = apiStatus.toLowerCase();
    if (status.includes('live') || status.includes('half')) return 'live';
    if (status.includes('final') || status.includes('completed') || status.includes('ft')) return 'completed';
    return 'upcoming';
  };

  const formatMatchDate = (startTime: string | null): { date: string; time: string } => {
    if (!startTime) {
      const now = new Date();
      return {
        date: format(now, 'yyyy-MM-dd'),
        time: format(now, 'HH:mm')
      };
    }
    try {
      const date = new Date(startTime);
      return {
        date: format(date, 'yyyy-MM-dd'),
        time: format(date, 'HH:mm')
      };
    } catch {
      const now = new Date();
      return {
        date: format(now, 'yyyy-MM-dd'),
        time: format(now, 'HH:mm')
      };
    }
  };

  // Generate short name from full name
  const generateShortName = (fullName: string): string => {
    const words = fullName.trim().split(/\s+/);
    if (words.length === 1) {
      return fullName.substring(0, 3).toUpperCase();
    }
    // Take first letter of each word, max 3-4 characters
    return words.slice(0, 3).map(w => w[0]).join('').toUpperCase();
  };

  // Create team if it doesn't exist (with optional logo URL from ESPN)
  const getOrCreateTeam = async (teamName: string, existingTeamId: string | null, logoUrl?: string | null): Promise<string | null> => {
    // If already matched, return the existing ID
    if (existingTeamId) {
      return existingTeamId;
    }

    // Try to find again in database (in case teams were just created)
    const foundId = findTeamMatch(teamName);
    if (foundId) {
      return foundId;
    }

    // Create new team with logo from ESPN
    try {
      const newTeam = {
        name: teamName,
        short_name: generateShortName(teamName),
        logo_url: logoUrl || null,
        logo_background_color: null,
      };

      const { data, error } = await supabase
        .from('teams')
        .insert(newTeam)
        .select()
        .single();

      if (error) {
        // If duplicate error, try to fetch the existing one
        if (error.code === '23505') {
          const { data: existingTeam } = await supabase
            .from('teams')
            .select('id')
            .eq('name', teamName)
            .maybeSingle();
          return existingTeam?.id || null;
        }
        throw error;
      }

      // Refresh teams query cache
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      
      return data?.id || null;
    } catch (error) {
      console.error('Error creating team:', teamName, error);
      return null;
    }
  };

  const importSelectedMatches = async () => {
    // Now we can import even if teams are not mapped - they'll be auto-created
    const selectedMatches = apiMatches.filter(m => m.selected);
    
    if (selectedMatches.length === 0) {
      toast({
        title: "No matches selected",
        description: "Please select at least one match to import",
        variant: "destructive"
      });
      return;
    }

    setImporting(true);
    let successCount = 0;
    let errorCount = 0;
    let teamsCreated = 0;

    for (const match of selectedMatches) {
      try {
        // Get or create teams with ESPN logos
        const teamAId = await getOrCreateTeam(match.homeTeam, match.teamAId, match.homeTeamLogo);
        const teamBId = await getOrCreateTeam(match.awayTeam, match.teamBId, match.awayTeamLogo);

        if (!teamAId || !teamBId) {
          console.error('Could not get/create teams for match:', match.homeTeam, 'vs', match.awayTeam);
          errorCount++;
          continue;
        }

        // Count newly created teams
        if (!match.teamAId && teamAId) teamsCreated++;
        if (!match.teamBId && teamBId) teamsCreated++;

        const { date, time } = formatMatchDate(match.startTime);
        const status = getMatchStatus(match.status);
        
        // Get tournament SEO if available - Auto import from tournament
        let seoTitle: string | null = null;
        let seoDescription: string | null = null;
        let seoKeywords: string | null = null;
        
        if (match.tournamentId) {
          const tournament = tournaments?.find(t => t.id === match.tournamentId);
          if (tournament) {
            seoTitle = tournament.seo_title || null;
            seoDescription = tournament.seo_description || null;
            seoKeywords = tournament.seo_keywords || null;
          }
        }
        
        // Generate slug from team names (use ESPN names if teams were just created)
        const teamAName = teams?.find(t => t.id === teamAId)?.name || match.homeTeam;
        const teamBName = teams?.find(t => t.id === teamBId)?.name || match.awayTeam;
        const slug = `${teamAName.toLowerCase().replace(/\s+/g, '-')}-vs-${teamBName.toLowerCase().replace(/\s+/g, '-')}-live`;

        const matchData = {
          team_a_id: teamAId,
          team_b_id: teamBId,
          tournament_id: match.tournamentId,
          sport_id: footballSportId || null,
          match_date: date,
          match_time: time,
          status,
          score_a: match.homeScore || null,
          score_b: match.awayScore || null,
          match_minute: match.minute ? parseInt(match.minute.replace(/'/g, '')) || null : null,
          is_active: true,
          page_type: 'page',
          slug,
          seo_title: seoTitle,
          seo_description: seoDescription,
          seo_keywords: seoKeywords,
          auto_sync_enabled: status === 'live' || status === 'upcoming',
          match_start_time: match.startTime ? new Date(match.startTime).toISOString() : null,
          venue: match.venue || null,
          match_number: match.round || null,
          match_label: null,
          match_duration_minutes: 180,
          espn_event_id: match.eventId || null,
          auto_match_result_enabled: true,
          show_playing_xi: true,
        };

        const { error } = await supabase.from('matches').insert(matchData);
        if (error) throw error;
        
        successCount++;
      } catch (error) {
        console.error('Error importing match:', error);
        errorCount++;
      }
    }

    setImporting(false);

    if (successCount > 0) {
      queryClient.invalidateQueries({ queryKey: ['matches'] });
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      
      const teamsMsg = teamsCreated > 0 ? ` (${teamsCreated} new team(s) created)` : '';
      toast({
        title: "Import Complete",
        description: `Successfully imported ${successCount} match(es)${teamsMsg}${errorCount > 0 ? `, ${errorCount} failed` : ''}`,
      });
      onImportComplete?.();
      setOpen(false);
    } else {
      toast({
        title: "Import Failed",
        description: "Failed to import matches. Please try again.",
        variant: "destructive"
      });
    }
  };

  const selectedCount = apiMatches.filter(m => m.selected).length;
  const unmatchedTeamsCount = apiMatches.filter(m => m.selected && (!m.teamAId || !m.teamBId)).reduce((acc, m) => {
    return acc + (m.teamAId ? 0 : 1) + (m.teamBId ? 0 : 1);
  }, 0);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Download className="w-4 h-4" />
          Import Football
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl w-[95vw] max-h-[90vh] overflow-y-auto flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trophy className="w-5 h-5" />
            Import Football Matches
          </DialogTitle>
          <DialogDescription>
            Fetch matches from ESPN and import them with auto-mapped teams. SEO will be imported from tournament.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 flex-1 flex flex-col min-h-0">
          {/* Controls */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs sm:text-sm">League</Label>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5"
                  onClick={refreshLeagues}
                  disabled={refreshingLeagues}
                  title="Refresh leagues from ESPN"
                >
                  <RefreshCw className={`h-3 w-3 ${refreshingLeagues ? 'animate-spin' : ''}`} />
                </Button>
              </div>
              <SearchableSelect
                options={leagues}
                value={selectedLeague}
                onValueChange={setSelectedLeague}
                placeholder={loadingLeagues ? "Loading leagues..." : "Select league"}
                searchPlaceholder="Search leagues..."
                emptyText="No leagues found"
              />
            </div>
            
            <div className="space-y-2">
              <Label className="text-xs sm:text-sm">Tournament (SEO)</Label>
              <SearchableSelect
                options={[
                  { value: 'none', label: 'No Tournament' },
                  ...(tournaments?.filter(t => {
                    // Show all Football tournaments (active or completed)
                    const isFootball = t.sport.toLowerCase().includes('football') || t.sport.toLowerCase().includes('soccer');
                    return isFootball;
                  }).map((t) => ({
                    value: t.id,
                    label: t.name,
                    sublabel: `${t.season}${t.is_completed ? ' • Completed' : t.is_active ? ' • Active' : ''}${t.total_matches ? ` • ${t.total_matches} matches` : ''}`,
                    imageUrl: t.logo_url,
                  })) || [])
                ]}
                value={defaultTournamentId || 'none'}
                onValueChange={(v) => setDefaultTournamentId(v === 'none' ? null : v)}
                placeholder="Select tournament"
                searchPlaceholder="Search tournaments..."
                emptyText="No football tournaments found"
              />
            </div>
            
            <div className="col-span-2 sm:col-span-1 flex items-end">
              <Button onClick={fetchMatches} disabled={loading} className="w-full gap-2 h-9">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                Fetch Matches
              </Button>
            </div>
          </div>

          {/* Match List */}
          {apiMatches.length > 0 && (
            <>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={selectAllValid}>
                    Select All Valid
                  </Button>
                  <Button variant="outline" size="sm" onClick={deselectAll}>
                    Deselect All
                  </Button>
                </div>
                <Badge variant="secondary">
                  {selectedCount} selected{unmatchedTeamsCount > 0 ? ` (${unmatchedTeamsCount} new teams)` : ''}
                </Badge>
              </div>

              <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                {apiMatches.map((match, index) => (
                  <div 
                    key={index} 
                    className={`p-3 rounded-lg border transition-colors ${
                      match.selected 
                        ? 'border-primary bg-primary/5' 
                        : 'border-border hover:border-muted-foreground/30'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <Checkbox
                        checked={match.selected}
                        onCheckedChange={() => toggleMatchSelection(index)}
                        className="mt-1"
                      />
                      
                        <div className="flex-1 space-y-3">
                        {/* Match Info with ESPN Logos */}
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <div className="flex items-center gap-3 flex-wrap">
                            {/* Home Team with Logo */}
                            <div className="flex items-center gap-2">
                              {match.homeTeamLogo ? (
                                <img 
                                  src={match.homeTeamLogo} 
                                  alt={match.homeTeam}
                                  className="w-6 h-6 object-contain rounded"
                                  onError={(e) => {
                                    (e.target as HTMLImageElement).style.display = 'none';
                                  }}
                                />
                              ) : (
                                <div className="w-6 h-6 rounded bg-muted flex items-center justify-center text-xs font-medium">
                                  {match.homeTeam.charAt(0)}
                                </div>
                              )}
                              <span className="font-medium">{match.homeTeam}</span>
                            </div>
                            
                            <span className="text-muted-foreground">vs</span>
                            
                            {/* Away Team with Logo */}
                            <div className="flex items-center gap-2">
                              {match.awayTeamLogo ? (
                                <img 
                                  src={match.awayTeamLogo} 
                                  alt={match.awayTeam}
                                  className="w-6 h-6 object-contain rounded"
                                  onError={(e) => {
                                    (e.target as HTMLImageElement).style.display = 'none';
                                  }}
                                />
                              ) : (
                                <div className="w-6 h-6 rounded bg-muted flex items-center justify-center text-xs font-medium">
                                  {match.awayTeam.charAt(0)}
                                </div>
                              )}
                              <span className="font-medium">{match.awayTeam}</span>
                            </div>
                            
                            {(match.homeScore || match.awayScore) && (
                              <Badge variant="outline" className="ml-2">
                                {match.homeScore || '0'} - {match.awayScore || '0'}
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Badge 
                              variant={
                                match.status.toLowerCase().includes('live') ? 'destructive' :
                                match.status.toLowerCase().includes('final') ? 'secondary' : 
                                'outline'
                              }
                            >
                              {match.status}
                            </Badge>
                            {match.startTime && (
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {format(new Date(match.startTime), 'MMM d, HH:mm')}
                              </span>
                            )}
                          </div>
                        </div>
                        
                        {/* Team Mapping */}
                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Home Team</Label>
                            <SearchableSelect
                              options={teams?.map((t) => ({
                                value: t.id,
                                label: t.name,
                                sublabel: t.short_name,
                                imageUrl: t.logo_url,
                              })) || []}
                              value={match.teamAId || ''}
                              onValueChange={(v) => updateMatchTeam(index, 'teamAId', v || null)}
                              placeholder="Select team"
                              searchPlaceholder="Search..."
                              emptyText="No teams"
                            />
                            {!match.teamAId && (
                              <p className="text-xs text-green-500">✨ Will be created</p>
                            )}
                          </div>
                          
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Away Team</Label>
                            <SearchableSelect
                              options={teams?.map((t) => ({
                                value: t.id,
                                label: t.name,
                                sublabel: t.short_name,
                                imageUrl: t.logo_url,
                              })) || []}
                              value={match.teamBId || ''}
                              onValueChange={(v) => updateMatchTeam(index, 'teamBId', v || null)}
                              placeholder="Select team"
                              searchPlaceholder="Search..."
                              emptyText="No teams"
                            />
                            {!match.teamBId && (
                              <p className="text-xs text-green-500">✨ Will be created</p>
                            )}
                          </div>
                          
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Tournament (SEO)</Label>
                            <SearchableSelect
                              options={[
                                { value: 'none', label: 'No Tournament' },
                                ...(tournaments?.filter(t => !t.is_completed).map((t) => ({
                                  value: t.id,
                                  label: t.name,
                                  sublabel: t.season,
                                  imageUrl: t.logo_url,
                                })) || [])
                              ]}
                              value={match.tournamentId || 'none'}
                              onValueChange={(v) => updateMatchTournament(index, v === 'none' ? null : v)}
                              placeholder="Tournament"
                              searchPlaceholder="Search..."
                              emptyText="No tournaments"
                            />
                          </div>
                          
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Round/Matchday</Label>
                            <Input
                              value={match.round || ''}
                              onChange={(e) => updateMatchRound(index, e.target.value)}
                              placeholder="e.g., Round 22, MD 7"
                              className="h-9"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {apiMatches.length === 0 && !loading && (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <p>Select a league and click "Fetch Matches" to load available matches</p>
            </div>
          )}

          {loading && (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          )}
        </div>

        {/* Footer Actions */}
        {apiMatches.length > 0 && (
          <div className="flex items-center justify-between pt-4 border-t">
            <p className="text-sm text-muted-foreground">
              {selectedCount} match(es) ready to import{unmatchedTeamsCount > 0 ? ` (${unmatchedTeamsCount} teams will be created)` : ''}
            </p>
            <Button 
              onClick={importSelectedMatches} 
              disabled={importing || selectedCount === 0}
              className="gap-2"
            >
              {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              Import {selectedCount} Match(es)
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
