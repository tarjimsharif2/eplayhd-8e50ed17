import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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

const ESPN_LEAGUES = [
  { value: 'epl', label: 'Premier League' },
  { value: 'laliga', label: 'La Liga' },
  { value: 'bundesliga', label: 'Bundesliga' },
  { value: 'seriea', label: 'Serie A' },
  { value: 'ligue1', label: 'Ligue 1' },
  { value: 'ucl', label: 'UEFA Champions League' },
  { value: 'uel', label: 'UEFA Europa League' },
];

export default function FootballMatchImporter({ onImportComplete }: FootballMatchImporterProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: teams } = useTeams();
  const { data: tournaments } = useTournaments();
  const { data: sports } = useSports();

  const [open, setOpen] = useState(false);
  const [selectedLeague, setSelectedLeague] = useState('epl');
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [apiMatches, setApiMatches] = useState<MatchToImport[]>([]);
  const [defaultTournamentId, setDefaultTournamentId] = useState<string | null>(null);

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
      const { data, error } = await supabase.functions.invoke('scrape-football-scores', {
        body: { league: selectedLeague, includeDetails: false }
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

  // Create team if it doesn't exist
  const getOrCreateTeam = async (teamName: string, existingTeamId: string | null): Promise<string | null> => {
    // If already matched, return the existing ID
    if (existingTeamId) {
      return existingTeamId;
    }

    // Try to find again in database (in case teams were just created)
    const foundId = findTeamMatch(teamName);
    if (foundId) {
      return foundId;
    }

    // Create new team
    try {
      const newTeam = {
        name: teamName,
        short_name: generateShortName(teamName),
        logo_url: null,
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
        // Get or create teams
        const teamAId = await getOrCreateTeam(match.homeTeam, match.teamAId);
        const teamBId = await getOrCreateTeam(match.awayTeam, match.teamBId);

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
          page_type: 'match_page',
          slug,
          seo_title: seoTitle,
          seo_description: seoDescription,
          seo_keywords: seoKeywords,
          auto_sync_enabled: status === 'live' || status === 'upcoming',
          match_start_time: match.startTime ? new Date(match.startTime).toISOString() : null,
          venue: match.venue || null,
          match_number: null,
          match_label: match.competition || null,
          match_duration_minutes: 180,
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
      <DialogContent className="max-w-4xl w-[95vw] max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trophy className="w-5 h-5" />
            Import Football Matches
          </DialogTitle>
          <DialogDescription>
            Fetch matches from ESPN and import them with auto-mapped teams. SEO will be imported from tournament.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
          {/* Controls */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>League</Label>
              <Select value={selectedLeague} onValueChange={setSelectedLeague}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ESPN_LEAGUES.map(league => (
                    <SelectItem key={league.value} value={league.value}>
                      {league.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>Default Tournament (SEO source)</Label>
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
                value={defaultTournamentId || 'none'}
                onValueChange={(v) => setDefaultTournamentId(v === 'none' ? null : v)}
                placeholder="Select tournament"
                searchPlaceholder="Search..."
                emptyText="No tournaments"
              />
            </div>
            
            <div className="flex items-end">
              <Button onClick={fetchMatches} disabled={loading} className="w-full gap-2">
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
                        {/* Match Info */}
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium">{match.homeTeam}</span>
                            <span className="text-muted-foreground">vs</span>
                            <span className="font-medium">{match.awayTeam}</span>
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
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
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
                            <Label className="text-xs text-muted-foreground">Tournament (SEO source)</Label>
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
