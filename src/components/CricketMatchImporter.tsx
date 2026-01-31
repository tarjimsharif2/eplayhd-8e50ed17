import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { Download, Loader2, RefreshCw, Clock, Trophy, Zap, Globe } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import SearchableSelect from "@/components/SearchableSelect";
import { useTeams, useTournaments, useSports } from "@/hooks/useSportsData";
import { useQueryClient } from '@tanstack/react-query';

interface ESPNCricketMatch {
  homeTeam: string;
  awayTeam: string;
  homeScore: string | null;
  awayScore: string | null;
  status: string;
  matchFormat: string | null;
  competition: string | null;
  matchUrl: string | null;
  startTime: string | null;
  venue?: string | null;
  eventId?: string;
  matchNumber?: string | null;
  seriesName?: string | null;
  homeTeamLogo?: string | null;
  awayTeamLogo?: string | null;
  cricbuzzMatchId?: string;
  seriesId?: string | null;
}

interface MatchToImport extends ESPNCricketMatch {
  selected: boolean;
  teamAId: string | null;
  teamBId: string | null;
  tournamentId: string | null;
}

interface CricketMatchImporterProps {
  onImportComplete?: () => void;
}

const ESPN_CRICKET_SERIES = [
  { value: 'all', label: 'All Live/Upcoming Matches' },
  { value: 'custom', label: '🔍 Custom Series ID' },
  // ICC Events
  { value: 'ct2025', label: '🏆 ICC Champions Trophy 2025' },
  { value: 'u19-wc', label: '🏆 ICC U19 World Cup 2026' },
  { value: 'icc-wc', label: 'ICC World Cup' },
  { value: 'icc-t20wc', label: 'ICC T20 World Cup' },
  { value: 'icc-wtc', label: 'ICC World Test Championship' },
  { value: 'asia-cup', label: 'Asia Cup' },
  // Domestic T20 Leagues
  { value: 'ipl', label: 'IPL' },
  { value: 'bpl', label: 'BPL' },
  { value: 'psl', label: 'PSL' },
  { value: 'bbl', label: 'BBL' },
  { value: 'cpl', label: 'CPL' },
  { value: 'sa20', label: 'SA20' },
  { value: 'ilt20', label: 'ILT20' },
  { value: 'wpl', label: "WPL" },
  // Bilateral Series 2025-26
  { value: 'ind-vs-eng', label: 'India vs England 2025' },
  { value: 'aus-vs-ind', label: 'Australia vs India 2025-26' },
  { value: 'nz-in-ind', label: 'New Zealand in India 2025' },
  { value: 'sa-vs-wi', label: 'SA vs West Indies 2025-26' },
  { value: 'eng-vs-wi', label: 'England vs West Indies 2025' },
  { value: 'pak-vs-wi', label: 'Pakistan vs West Indies 2025' },
];

// RapidAPI sources removed - now we use series-based fetching (like football_leagues)

interface CricketSeriesItem {
  id: string;
  series_id: string;
  series_name: string;
  start_date: string | null;
  end_date: string | null;
  match_count: number | null;
  is_active: boolean;
}

export default function CricketMatchImporter({ onImportComplete }: CricketMatchImporterProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: teams } = useTeams();
  const { data: tournaments } = useTournaments();
  const { data: sports } = useSports();

  const [open, setOpen] = useState(false);
  const [importSource, setImportSource] = useState<'espn' | 'rapidapi'>('espn');
  const [selectedSeries, setSelectedSeries] = useState('all');
  const [customSeriesId, setCustomSeriesId] = useState('');
  const [seriesSearch, setSeriesSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [apiMatches, setApiMatches] = useState<MatchToImport[]>([]);
  const [defaultTournamentId, setDefaultTournamentId] = useState<string | null>(null);
  
  // RapidAPI specific states - series-first approach (like football)
  const [rapidApiSeriesId, setRapidApiSeriesId] = useState<string | null>(null);
  const [seriesListSearch, setSeriesListSearch] = useState('');
  const [rapidApiCustomSeriesId, setRapidApiCustomSeriesId] = useState('');
  const [useCustomSeriesId, setUseCustomSeriesId] = useState(false);
  const [syncingSeries, setSyncingSeries] = useState(false);
  
  // Cricket series from database (like football_leagues)
  const [cricketSeries, setCricketSeries] = useState<CricketSeriesItem[]>([]);
  const [loadingSeries, setLoadingSeries] = useState(true);
  
  // Fetch cricket series from database on mount
  useEffect(() => {
    const fetchSeries = async () => {
      setLoadingSeries(true);
      try {
        const { data, error } = await supabase
          .from('cricket_series')
          .select('*')
          .eq('is_active', true)
          .order('series_name');
        
        if (error) throw error;
        
        setCricketSeries(data || []);
      } catch (err) {
        console.error('Error fetching cricket series:', err);
      } finally {
        setLoadingSeries(false);
      }
    };
    fetchSeries();
  }, []);

  // Sync cricket series from RapidAPI (Cricbuzz) - saves to cricket_series table
  const syncCricketSeries = async () => {
    setSyncingSeries(true);
    try {
      const { data, error } = await supabase.functions.invoke('fetch-cricket-series');
      
      if (error) throw error;
      
      toast({
        title: "Series Synced",
        description: `${data.inserted} new, ${data.updated} updated series from Cricbuzz`,
      });
      
      // Refetch series from database
      const { data: newSeries } = await supabase
        .from('cricket_series')
        .select('*')
        .eq('is_active', true)
        .order('series_name');
      
      if (newSeries) {
        setCricketSeries(newSeries);
      }
    } catch (err) {
      console.error('Error syncing series:', err);
      toast({
        title: "Sync Failed",
        description: "Failed to sync series from RapidAPI. Check settings.",
        variant: "destructive",
      });
    } finally {
      setSyncingSeries(false);
    }
  };

  // Get Cricket sport ID
  const cricketSportId = sports?.find(s => 
    s.name.toLowerCase().includes('cricket')
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
    // Determine which series ID to use
    const seriesIdToFetch = selectedSeries === 'custom' ? customSeriesId.trim() : selectedSeries;
    
    if (selectedSeries === 'custom' && !customSeriesId.trim()) {
      toast({
        title: "Custom Series ID Required",
        description: "Please enter an ESPN series ID",
        variant: "destructive"
      });
      return;
    }
    
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('scrape-cricket-matches', {
        body: { seriesId: seriesIdToFetch }
      });

      if (error) throw error;

      if (data?.matches) {
        // Filter out completed matches - only import upcoming/live
        const filteredMatches = data.matches.filter((m: ESPNCricketMatch) => {
          const status = m.status?.toLowerCase() || '';
          const isCompleted = status.includes('completed') || status.includes('final') || status.includes('result');
          return !isCompleted;
        });

        const matchesWithMappings: MatchToImport[] = filteredMatches.map((m: ESPNCricketMatch) => ({
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
            description: `All ${data.matches.length} matches are completed.`,
          });
        }
      }
    } catch (error) {
      console.error('Error fetching matches:', error);
      toast({
        title: "Error",
        description: "Failed to fetch matches from ESPN Cricinfo",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  // Fetch matches from RapidAPI using selected series from cricket_series table
  const fetchRapidApiMatches = async () => {
    // Get series ID from selected series or custom input
    let seriesId = rapidApiCustomSeriesId.trim();
    
    if (!useCustomSeriesId && rapidApiSeriesId) {
      const series = cricketSeries.find(s => s.id === rapidApiSeriesId);
      if (series?.series_id) {
        seriesId = series.series_id;
      }
    }
    
    if (!seriesId) {
      toast({
        title: "Series ID Required",
        description: useCustomSeriesId 
          ? "Please enter a Cricbuzz Series ID" 
          : "Please select a series from the list",
        variant: "destructive"
      });
      return;
    }
    
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('rapidapi-cricket-schedule', {
        body: { 
          source: 'series',
          seriesId: seriesId
        }
      });

      if (error) throw error;

      if (data?.matches) {
        // Filter to keep only upcoming and live matches
        const filteredMatches = data.matches.filter((m: ESPNCricketMatch) => {
          const status = m.status?.toLowerCase() || '';
          // Check for completed match indicators
          const isCompleted = status.includes('complete') || 
            status.includes(' won ') || 
            status.includes(' beat ') ||
            status.includes(' defeated ') ||
            status.includes('match drawn') ||
            status.includes('match tied') ||
            (status.includes('result') && !status.includes('no result'));
          
          // Also check if it's explicitly upcoming/scheduled
          const isUpcoming = status.includes('upcoming') || 
            status.includes('scheduled') || 
            status.includes('starts') || 
            status.includes('match starts') ||
            status === '' ||
            !status;
            
          const isLive = status.includes('live') || 
            status.includes('in progress') || 
            status.includes('innings') ||
            status.includes('batting');
          
          return !isCompleted || isUpcoming || isLive;
        });

        // Use default tournament if selected
        const targetTournamentId = defaultTournamentId || null;
        
        const matchesWithMappings: MatchToImport[] = filteredMatches.map((m: ESPNCricketMatch) => ({
          ...m,
          selected: false,
          teamAId: findTeamMatch(m.homeTeam),
          teamBId: findTeamMatch(m.awayTeam),
          tournamentId: targetTournamentId,
        }));
        setApiMatches(matchesWithMappings);
        
        // Also set default tournament for SEO
        if (targetTournamentId) {
          setDefaultTournamentId(targetTournamentId);
        }
        
        toast({
          title: "Matches Fetched",
          description: `Found ${filteredMatches.length} upcoming/live match(es) from ${data.matches.length} total`,
        });
        
        if (filteredMatches.length === 0) {
          toast({
            title: "No upcoming matches",
            description: data.matches.length > 0 
              ? `All ${data.matches.length} matches are completed.`
              : "No matches found for this series. Check series ID.",
            variant: "destructive"
          });
        }
      }
    } catch (error) {
      console.error('Error fetching matches from RapidAPI:', error);
      toast({
        title: "Error",
        description: "Failed to fetch matches from RapidAPI. Make sure RapidAPI is enabled and configured.",
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

  const updateMatchNumber = (index: number, value: string) => {
    setApiMatches(prev => prev.map((m, i) => 
      i === index ? { ...m, matchNumber: value || null } : m
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
    if (status.includes('live') || status.includes('progress')) return 'live';
    if (status.includes('completed') || status.includes('final') || status.includes('result')) return 'completed';
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
    return words.slice(0, 3).map(w => w[0]).join('').toUpperCase();
  };

  // Create team if it doesn't exist
  const getOrCreateTeam = async (teamName: string, existingTeamId: string | null, logoUrl?: string | null): Promise<string | null> => {
    if (existingTeamId) {
      return existingTeamId;
    }

    const foundId = findTeamMatch(teamName);
    if (foundId) {
      return foundId;
    }

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

      queryClient.invalidateQueries({ queryKey: ['teams'] });
      
      return data?.id || null;
    } catch (error) {
      console.error('Error creating team:', teamName, error);
      return null;
    }
  };

  const importSelectedMatches = async () => {
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
        const teamAId = await getOrCreateTeam(match.homeTeam, match.teamAId, match.homeTeamLogo);
        const teamBId = await getOrCreateTeam(match.awayTeam, match.teamBId, match.awayTeamLogo);

        if (!teamAId || !teamBId) {
          console.error('Could not get/create teams for match:', match.homeTeam, 'vs', match.awayTeam);
          errorCount++;
          continue;
        }

        if (!match.teamAId && teamAId) teamsCreated++;
        if (!match.teamBId && teamBId) teamsCreated++;

        const { date, time } = formatMatchDate(match.startTime);
        const status = getMatchStatus(match.status);
        
        // Get tournament SEO if available
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
        
        const teamAName = teams?.find(t => t.id === teamAId)?.name || match.homeTeam;
        const teamBName = teams?.find(t => t.id === teamBId)?.name || match.awayTeam;
        const slug = `${teamAName.toLowerCase().replace(/\s+/g, '-')}-vs-${teamBName.toLowerCase().replace(/\s+/g, '-')}-live`;

        const matchData = {
          team_a_id: teamAId,
          team_b_id: teamBId,
          tournament_id: match.tournamentId,
          sport_id: cricketSportId || null,
          match_date: date,
          match_time: time,
          status,
          score_a: match.homeScore || null,
          score_b: match.awayScore || null,
          is_active: true,
          page_type: 'match_page',
          slug,
          seo_title: seoTitle,
          seo_description: seoDescription,
          seo_keywords: seoKeywords,
          auto_sync_enabled: status === 'live' || status === 'upcoming',
          match_start_time: match.startTime ? new Date(match.startTime).toISOString() : null,
          venue: match.venue || null,
          match_number: match.matchNumber || null,
          match_format: match.matchFormat || 'T20',
          match_label: null,
        };

        const { error } = await supabase.from('matches').insert(matchData);
        if (error) {
          console.error('DB insert error:', error.message, error.details, error.code);
          throw error;
        }
        
        successCount++;
      } catch (error: any) {
        console.error('Error importing match:', error);
        const errMsg = error?.message || error?.details || 'Unknown error';
        toast({
          title: "Match Import Error",
          description: `${match.homeTeam} vs ${match.awayTeam}: ${errMsg}`,
          variant: "destructive"
        });
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
    } else if (errorCount > 0) {
      toast({
        title: "Import Failed",
        description: `All ${errorCount} match(es) failed. Check console for details.`,
        variant: "destructive"
      });
    } else {
      toast({
        title: "No Matches",
        description: "No matches were imported.",
        variant: "destructive"
      });
    }
  };

  const selectedCount = apiMatches.filter(m => m.selected).length;
  const unmatchedTeamsCount = apiMatches.filter(m => m.selected && (!m.teamAId || !m.teamBId)).reduce((acc, m) => {
    return acc + (m.teamAId ? 0 : 1) + (m.teamBId ? 0 : 1);
  }, 0);

  const getFormatBadgeColor = (format: string | null) => {
    switch (format?.toLowerCase()) {
      case 'test': return 'bg-red-500/20 text-red-400 border-red-500/30';
      case 'odi': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 't20': return 'bg-green-500/20 text-green-400 border-green-500/30';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Download className="w-4 h-4" />
          Import Cricket
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl w-[95vw] max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trophy className="w-5 h-5" />
            Import Cricket Matches
          </DialogTitle>
          <DialogDescription>
            Fetch matches from ESPN Cricinfo or RapidAPI and import them with auto-mapped teams.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
          {/* Source Tabs */}
          <Tabs value={importSource} onValueChange={(v) => { setImportSource(v as 'espn' | 'rapidapi'); setApiMatches([]); }}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="espn" className="gap-2">
                <Globe className="w-4 h-4" />
                ESPN Cricinfo
              </TabsTrigger>
              <TabsTrigger value="rapidapi" className="gap-2">
                <Zap className="w-4 h-4" />
                RapidAPI (Cricbuzz)
              </TabsTrigger>
            </TabsList>

            {/* ESPN Tab Content */}
            <TabsContent value="espn" className="space-y-4 mt-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Series/Source</Label>
                  <div className="space-y-2">
                    <Input
                      placeholder="Search series..."
                      value={seriesSearch}
                      onChange={(e) => setSeriesSearch(e.target.value)}
                      className="h-9"
                    />
                    <Select value={selectedSeries} onValueChange={setSelectedSeries}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="max-h-[300px]">
                        {ESPN_CRICKET_SERIES
                          .filter(series => 
                            seriesSearch === '' || 
                            series.label.toLowerCase().includes(seriesSearch.toLowerCase())
                          )
                          .map(series => (
                            <SelectItem key={series.value} value={series.value}>
                              {series.label}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                {selectedSeries === 'custom' ? (
                  <div className="space-y-2">
                    <Label>ESPN Series ID</Label>
                    <Input
                      placeholder="e.g., 1477604 or 23220"
                      value={customSeriesId}
                      onChange={(e) => setCustomSeriesId(e.target.value)}
                      className="h-10"
                    />
                    <p className="text-xs text-muted-foreground">
                      Find ID from ESPN Cricinfo URL: espn.in/cricket/series/<strong>SERIES_ID</strong>/...
                    </p>
                  </div>
                ) : (
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
                )}
              </div>

              {selectedSeries === 'custom' && (
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
              )}
              
              <Button onClick={fetchMatches} disabled={loading} className="w-full gap-2">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                Fetch from ESPN
              </Button>
            </TabsContent>

            {/* RapidAPI Tab Content */}
            <TabsContent value="rapidapi" className="space-y-4 mt-4">
              {/* Series Selection - Like football_leagues */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-base font-medium">Step 1: Select Series</Label>
                  <div className="flex items-center gap-3">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={syncCricketSeries}
                      disabled={syncingSeries}
                      className="gap-1.5 text-xs"
                    >
                      {syncingSeries ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="w-3.5 h-3.5" />
                      )}
                      Sync Series
                    </Button>
                    <div className="flex items-center gap-2">
                      <Checkbox 
                        id="useCustomSeriesId" 
                        checked={useCustomSeriesId}
                        onCheckedChange={(checked) => setUseCustomSeriesId(checked === true)}
                      />
                      <Label htmlFor="useCustomSeriesId" className="text-xs text-muted-foreground cursor-pointer">
                        Custom ID
                      </Label>
                    </div>
                  </div>
                </div>

                {useCustomSeriesId ? (
                  <div className="space-y-2">
                    <Input
                      placeholder="Enter Cricbuzz Series ID (e.g., 7607)"
                      value={rapidApiCustomSeriesId}
                      onChange={(e) => setRapidApiCustomSeriesId(e.target.value)}
                      className="h-11"
                    />
                    <p className="text-xs text-muted-foreground">
                      Find from Cricbuzz URL: cricbuzz.com/cricket-series/<strong>SERIES_ID</strong>/...
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <Input
                        placeholder="Search series..."
                        value={seriesListSearch}
                        onChange={(e) => setSeriesListSearch(e.target.value)}
                        className="h-9 flex-1"
                      />
                    </div>
                    <div className="border rounded-lg max-h-[200px] overflow-y-auto">
                      {loadingSeries ? (
                        <div className="p-4 text-center text-muted-foreground text-sm">
                          <Loader2 className="w-4 h-4 animate-spin mx-auto mb-2" />
                          Loading series...
                        </div>
                      ) : (() => {
                        const filteredSeries = cricketSeries
                          .filter(s => 
                            seriesListSearch === '' || 
                            s.series_name.toLowerCase().includes(seriesListSearch.toLowerCase())
                          )
                          .sort((a, b) => a.series_name.localeCompare(b.series_name));
                        
                        if (filteredSeries.length === 0) {
                          return (
                            <div className="p-4 text-center text-muted-foreground text-sm space-y-2">
                              <p>No series found</p>
                              <p className="text-xs">Click "Sync Series" to fetch from RapidAPI</p>
                            </div>
                          );
                        }
                        
                        return filteredSeries.map(series => (
                          <div 
                            key={series.id}
                            className={`flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/50 border-b last:border-b-0 transition-colors ${
                              rapidApiSeriesId === series.id ? 'bg-primary/10 border-primary/30' : ''
                            }`}
                            onClick={() => setRapidApiSeriesId(series.id)}
                          >
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-sm truncate">{series.series_name}</div>
                              <div className="text-xs text-muted-foreground flex items-center gap-2">
                                {series.start_date && (
                                  <span>{format(new Date(series.start_date), 'MMM yyyy')}</span>
                                )}
                                <Badge variant="outline" className="text-[10px] px-1 py-0">
                                  ID: {series.series_id}
                                </Badge>
                                {series.match_count && series.match_count > 0 && (
                                  <span className="text-muted-foreground">
                                    {series.match_count} matches
                                  </span>
                                )}
                              </div>
                            </div>
                            {rapidApiSeriesId === series.id && (
                              <Badge className="bg-primary text-primary-foreground">Selected</Badge>
                            )}
                          </div>
                        ));
                      })()}
                    </div>
                  </div>
                )}
              </div>

              {/* Selected Series Info */}
              {rapidApiSeriesId && !useCustomSeriesId && (
                <div className="p-3 bg-muted/50 rounded-lg">
                  {(() => {
                    const selected = cricketSeries.find(s => s.id === rapidApiSeriesId);
                    return selected ? (
                      <div>
                        <div className="font-medium">{selected.series_name}</div>
                        <div className="text-xs text-muted-foreground">
                          Series ID: {selected.series_id}
                          {selected.match_count && ` • ${selected.match_count} matches`}
                        </div>
                      </div>
                    ) : null;
                  })()}
                </div>
              )}
              
              {/* Default Tournament for imported matches */}
              <div className="space-y-2">
                <Label className="text-sm">Default Tournament (for imported matches)</Label>
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
              
              <Button 
                onClick={fetchRapidApiMatches} 
                disabled={loading || (!useCustomSeriesId && !rapidApiSeriesId)} 
                className="w-full gap-2"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                Step 2: Fetch Matches
              </Button>
            </TabsContent>
          </Tabs>

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
                        : 'border-border hover:border-muted-foreground/50'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <Checkbox
                        checked={match.selected}
                        onCheckedChange={() => toggleMatchSelection(index)}
                        className="mt-1"
                      />
                      
                      <div className="flex-1 space-y-2">
                        {/* Match Header */}
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-2">
                            {match.homeTeamLogo && (
                              <img src={match.homeTeamLogo} alt="" className="w-5 h-5 object-contain" />
                            )}
                            <span className="font-medium">{match.homeTeam}</span>
                            <span className="text-muted-foreground">vs</span>
                            <span className="font-medium">{match.awayTeam}</span>
                            {match.awayTeamLogo && (
                              <img src={match.awayTeamLogo} alt="" className="w-5 h-5 object-contain" />
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge className={getFormatBadgeColor(match.matchFormat)}>
                              {match.matchFormat || 'T20'}
                            </Badge>
                            <Badge variant={match.status === 'Live' ? 'destructive' : 'secondary'}>
                              {match.status}
                            </Badge>
                          </div>
                        </div>
                        
                        {/* Match Info */}
                        <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                          {match.startTime && (
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {format(new Date(match.startTime), 'dd MMM, HH:mm')}
                            </span>
                          )}
                          {match.venue && (
                            <span className="truncate max-w-[200px]">{match.venue}</span>
                          )}
                          {match.seriesName && (
                            <span className="truncate max-w-[200px]">{match.seriesName}</span>
                          )}
                        </div>
                        
                        {/* Team Mapping */}
                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Home Team</Label>
                            <SearchableSelect
                              options={[
                                { value: 'auto', label: `🆕 ${match.homeTeam}`, sublabel: 'Create new' },
                                ...(teams?.map((t) => ({
                                  value: t.id,
                                  label: t.name,
                                  sublabel: t.short_name,
                                  imageUrl: t.logo_url,
                                })) || [])
                              ]}
                              value={match.teamAId || 'auto'}
                              onValueChange={(v) => updateMatchTeam(index, 'teamAId', v === 'auto' ? null : v)}
                              placeholder="Map team"
                              searchPlaceholder="Search..."
                              emptyText="No teams"
                            />
                          </div>
                          
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Away Team</Label>
                            <SearchableSelect
                              options={[
                                { value: 'auto', label: `🆕 ${match.awayTeam}`, sublabel: 'Create new' },
                                ...(teams?.map((t) => ({
                                  value: t.id,
                                  label: t.name,
                                  sublabel: t.short_name,
                                  imageUrl: t.logo_url,
                                })) || [])
                              ]}
                              value={match.teamBId || 'auto'}
                              onValueChange={(v) => updateMatchTeam(index, 'teamBId', v === 'auto' ? null : v)}
                              placeholder="Map team"
                              searchPlaceholder="Search..."
                              emptyText="No teams"
                            />
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
                            <Label className="text-xs text-muted-foreground">Match Number</Label>
                            <Input
                              value={match.matchNumber || ''}
                              onChange={(e) => updateMatchNumber(index, e.target.value)}
                              placeholder="e.g., Match 5, Final"
                              className="h-9"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Import Button */}
              <div className="pt-4 border-t">
                <Button 
                  onClick={importSelectedMatches} 
                  disabled={importing || selectedCount === 0}
                  className="w-full gap-2"
                >
                  {importing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Importing...
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4" />
                      Import {selectedCount} Match{selectedCount !== 1 ? 'es' : ''}
                      {unmatchedTeamsCount > 0 && ` (will create ${unmatchedTeamsCount} team${unmatchedTeamsCount !== 1 ? 's' : ''})`}
                    </>
                  )}
                </Button>
              </div>
            </>
          )}

          {apiMatches.length === 0 && !loading && (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              Select a series and click "Fetch Matches" to load matches
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
