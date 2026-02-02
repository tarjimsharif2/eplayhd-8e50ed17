import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { Download, Loader2, RefreshCw, Clock, Trophy, Zap, Globe, ChevronDown, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import SearchableSelect from "@/components/SearchableSelect";
import { useTeams, useTournaments, useSports } from "@/hooks/useSportsData";
import { useQueryClient } from '@tanstack/react-query';
import { useIsMobile } from "@/hooks/use-mobile";

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
  const isMobile = useIsMobile();

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
          
          // Explicitly allow these statuses from RapidAPI
          const isUpcoming = status.includes('upcoming') || 
            status.includes('scheduled') || 
            status.includes('starts') || 
            status.includes('match starts') ||
            status.includes('preview') ||  // Cricbuzz "Preview" status
            status === '' ||
            !status;
            
          const isLive = status.includes('live') || 
            status.includes('in progress') || 
            status.includes('innings') ||
            status.includes('batting');
          
          // Return true if not completed OR explicitly upcoming/live
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
        
        // Generate clean SEO slug without date (e.g., team-a-vs-team-b-live)
        const baseSlug = `${teamAName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-vs-${teamBName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-live`
          .replace(/(^-|-$)/g, '');
        
        // Check for existing matches with same base slug
        const { data: existingMatches } = await supabase
          .from('matches')
          .select('id, slug, status, match_start_time')
          .ilike('slug', `${baseSlug}%`)
          .order('match_start_time', { ascending: true });
        
        let slug = baseSlug;
        if (existingMatches && existingMatches.length > 0) {
          // Find next available number
          const usedNumbers = existingMatches
            .map(m => {
              if (m.slug === baseSlug) return 1;
              const match = m.slug?.match(new RegExp(`^${baseSlug.replace(/[-]/g, '\\-')}-(\\d+)$`));
              return match ? parseInt(match[1]) : 0;
            })
            .filter(n => n > 0);
          
          if (usedNumbers.length > 0) {
            const nextNumber = Math.max(...usedNumbers) + 1;
            slug = `${baseSlug}-${nextNumber}`;
          }
        }

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
          page_type: 'seo_match_page',
          slug,
          seo_title: seoTitle,
          seo_description: seoDescription,
          seo_keywords: seoKeywords,
          auto_sync_enabled: status === 'live' || status === 'upcoming',
          match_start_time: match.startTime ? new Date(match.startTime).toISOString() : null,
          venue: match.venue || null,
          match_number: match.matchNumber || null,
          match_format: (match.matchFormat && match.matchFormat.trim()) || null,
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

  // Importer Content Component
  const ImporterContent = () => (
    <div className="space-y-3 sm:space-y-4 flex-1 overflow-hidden flex flex-col h-full">
      {/* Source Tabs */}
      <Tabs value={importSource} onValueChange={(v) => { setImportSource(v as 'espn' | 'rapidapi'); setApiMatches([]); }}>
        <TabsList className="grid w-full grid-cols-2 h-9">
          <TabsTrigger value="espn" className="gap-1.5 text-xs sm:text-sm">
            <Globe className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            ESPN
          </TabsTrigger>
          <TabsTrigger value="rapidapi" className="gap-1.5 text-xs sm:text-sm">
            <Zap className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            RapidAPI
          </TabsTrigger>
        </TabsList>

        {/* ESPN Tab Content */}
        <TabsContent value="espn" className="space-y-3 mt-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs sm:text-sm">Series/Source</Label>
              <Input
                placeholder="Search series..."
                value={seriesSearch}
                onChange={(e) => setSeriesSearch(e.target.value)}
                className="h-8 sm:h-9 text-sm"
              />
              <Select value={selectedSeries} onValueChange={setSelectedSeries}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-[200px]">
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
            
            {selectedSeries === 'custom' ? (
              <div className="space-y-1.5">
                <Label className="text-xs sm:text-sm">ESPN Series ID</Label>
                <Input
                  placeholder="e.g., 1477604"
                  value={customSeriesId}
                  onChange={(e) => setCustomSeriesId(e.target.value)}
                  className="h-9"
                />
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label className="text-xs sm:text-sm">Default Tournament</Label>
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
            <div className="space-y-1.5">
              <Label className="text-xs sm:text-sm">Default Tournament</Label>
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
          
          <Button onClick={fetchMatches} disabled={loading} className="w-full gap-2 h-9 sm:h-10">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />}
            Fetch from ESPN
          </Button>
        </TabsContent>

        {/* RapidAPI Tab Content */}
        <TabsContent value="rapidapi" className="space-y-3 mt-3">
          <Collapsible defaultOpen={apiMatches.length === 0}>
            <CollapsibleTrigger className="flex items-center justify-between w-full text-sm font-medium py-1">
              <span className="flex items-center gap-2">
                Step 1: Select Series
                {rapidApiSeriesId && !useCustomSeriesId && (
                  <Badge variant="secondary" className="text-[10px]">Selected</Badge>
                )}
              </span>
              <ChevronDown className="w-4 h-4" />
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-2 pt-2">
              <div className="flex items-center justify-between gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={syncCricketSeries}
                  disabled={syncingSeries}
                  className="gap-1.5 text-xs h-8"
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
                  <Label htmlFor="useCustomSeriesId" className="text-xs cursor-pointer">
                    Custom ID
                  </Label>
                </div>
              </div>

              {useCustomSeriesId ? (
                <Input
                  placeholder="Enter Cricbuzz Series ID"
                  value={rapidApiCustomSeriesId}
                  onChange={(e) => setRapidApiCustomSeriesId(e.target.value)}
                  className="h-9"
                />
              ) : (
                <div className="space-y-1.5">
                  <Input
                    placeholder="Search series..."
                    value={seriesListSearch}
                    onChange={(e) => setSeriesListSearch(e.target.value)}
                    className="h-8 text-sm"
                  />
                  <ScrollArea className="h-[120px] sm:h-[150px] border rounded-lg">
                    {loadingSeries ? (
                      <div className="p-3 text-center text-muted-foreground text-xs">
                        <Loader2 className="w-4 h-4 animate-spin mx-auto mb-1" />
                        Loading...
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
                          <div className="p-3 text-center text-muted-foreground text-xs">
                            <p>No series found</p>
                            <p className="text-[10px]">Click "Sync Series"</p>
                          </div>
                        );
                      }
                      
                      return filteredSeries.map(series => (
                        <div 
                          key={series.id}
                          className={`flex items-center gap-2 p-2 cursor-pointer hover:bg-muted/50 border-b last:border-b-0 transition-colors ${
                            rapidApiSeriesId === series.id ? 'bg-primary/10' : ''
                          }`}
                          onClick={() => setRapidApiSeriesId(series.id)}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-xs truncate">{series.series_name}</div>
                            <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                              {series.start_date && (
                                <span>{format(new Date(series.start_date), 'MMM yyyy')}</span>
                              )}
                              <Badge variant="outline" className="text-[9px] px-1 py-0 h-4">
                                ID: {series.series_id}
                              </Badge>
                            </div>
                          </div>
                          {rapidApiSeriesId === series.id && (
                            <Badge className="bg-primary text-primary-foreground text-[10px] h-5">✓</Badge>
                          )}
                        </div>
                      ));
                    })()}
                  </ScrollArea>
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>
          
          {/* Default Tournament */}
          <div className="space-y-1.5">
            <Label className="text-xs sm:text-sm">Default Tournament</Label>
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
            className="w-full gap-2 h-9 sm:h-10"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
            Step 2: Fetch Matches
          </Button>
        </TabsContent>
      </Tabs>

      {/* Match List */}
      {apiMatches.length > 0 && (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex items-center justify-between gap-2 py-2 border-t">
            <div className="flex gap-1.5">
              <Button variant="outline" size="sm" onClick={selectAllValid} className="h-7 text-xs px-2">
                Select All
              </Button>
              <Button variant="outline" size="sm" onClick={deselectAll} className="h-7 text-xs px-2">
                Deselect
              </Button>
            </div>
            <Badge variant="secondary" className="text-xs">
              {selectedCount} selected
            </Badge>
          </div>

          <ScrollArea className="flex-1 min-h-[200px] max-h-[300px] sm:max-h-[350px]">
            <div className="space-y-2 pr-2">
              {apiMatches.map((match, index) => (
                <div 
                  key={index} 
                  className={`p-2 rounded-lg border transition-colors ${
                    match.selected 
                      ? 'border-primary bg-primary/5' 
                      : 'border-border'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <Checkbox
                      checked={match.selected}
                      onCheckedChange={() => toggleMatchSelection(index)}
                      className="mt-0.5"
                    />
                    
                    <div className="flex-1 min-w-0 space-y-1">
                      {/* Match Header */}
                      <div className="flex items-center justify-between gap-1 flex-wrap">
                        <div className="text-xs sm:text-sm font-medium truncate flex-1">
                          {match.homeTeam} vs {match.awayTeam}
                        </div>
                        <div className="flex gap-1">
                          <Badge className={`${getFormatBadgeColor(match.matchFormat)} text-[9px] px-1 h-4`}>
                            {match.matchFormat || 'T20'}
                          </Badge>
                        </div>
                      </div>
                      
                      {/* Match Info */}
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground flex-wrap">
                        {match.startTime && (
                          <span className="flex items-center gap-0.5">
                            <Clock className="w-2.5 h-2.5" />
                            {format(new Date(match.startTime), 'dd MMM, HH:mm')}
                          </span>
                        )}
                        {match.venue && <span className="truncate max-w-[120px]">{match.venue}</span>}
                      </div>

                      {/* Team Mapping - Collapsible on mobile */}
                      <Collapsible>
                        <CollapsibleTrigger className="flex items-center gap-1 text-[10px] text-primary hover:underline w-full justify-center py-1 sm:hidden">
                          <ChevronDown className="w-3 h-3" />
                          Team Mapping
                        </CollapsibleTrigger>
                        <CollapsibleContent className="pt-1.5 sm:!block">
                          <div className="grid grid-cols-2 gap-1.5">
                            <SearchableSelect
                              options={[
                                { value: 'auto', label: `🆕 ${match.homeTeam}` },
                                ...(teams?.map((t) => ({
                                  value: t.id,
                                  label: t.name,
                                  sublabel: t.short_name,
                                  imageUrl: t.logo_url,
                                })) || [])
                              ]}
                              value={match.teamAId || 'auto'}
                              onValueChange={(v) => updateMatchTeam(index, 'teamAId', v === 'auto' ? null : v)}
                              placeholder="Home"
                              searchPlaceholder="Search..."
                              emptyText="No teams"
                            />
                            <SearchableSelect
                              options={[
                                { value: 'auto', label: `🆕 ${match.awayTeam}` },
                                ...(teams?.map((t) => ({
                                  value: t.id,
                                  label: t.name,
                                  sublabel: t.short_name,
                                  imageUrl: t.logo_url,
                                })) || [])
                              ]}
                              value={match.teamBId || 'auto'}
                              onValueChange={(v) => updateMatchTeam(index, 'teamBId', v === 'auto' ? null : v)}
                              placeholder="Away"
                              searchPlaceholder="Search..."
                              emptyText="No teams"
                            />
                          </div>
                        </CollapsibleContent>
                        {/* Always visible on desktop */}
                        <div className="hidden sm:grid grid-cols-2 gap-1.5 pt-1.5">
                          <SearchableSelect
                            options={[
                              { value: 'auto', label: `🆕 ${match.homeTeam}` },
                              ...(teams?.map((t) => ({
                                value: t.id,
                                label: t.name,
                                sublabel: t.short_name,
                                imageUrl: t.logo_url,
                              })) || [])
                            ]}
                            value={match.teamAId || 'auto'}
                            onValueChange={(v) => updateMatchTeam(index, 'teamAId', v === 'auto' ? null : v)}
                            placeholder="Home"
                            searchPlaceholder="Search..."
                            emptyText="No teams"
                          />
                          <SearchableSelect
                            options={[
                              { value: 'auto', label: `🆕 ${match.awayTeam}` },
                              ...(teams?.map((t) => ({
                                value: t.id,
                                label: t.name,
                                sublabel: t.short_name,
                                imageUrl: t.logo_url,
                              })) || [])
                            ]}
                            value={match.teamBId || 'auto'}
                            onValueChange={(v) => updateMatchTeam(index, 'teamBId', v === 'auto' ? null : v)}
                            placeholder="Away"
                            searchPlaceholder="Search..."
                            emptyText="No teams"
                          />
                        </div>
                      </Collapsible>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>

          {/* Import Button - Fixed at bottom */}
          <div className="pt-2 border-t mt-2">
            <Button 
              onClick={importSelectedMatches} 
              disabled={importing || selectedCount === 0}
              className="w-full gap-2 h-9 sm:h-10"
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
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {apiMatches.length === 0 && !loading && (
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm py-8">
          Select a series and click "Fetch Matches"
        </div>
      )}
    </div>
  );

  // Use Sheet on mobile for full-screen experience
  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2">
            <Download className="w-4 h-4" />
            Import Cricket
          </Button>
        </SheetTrigger>
        <SheetContent side="bottom" className="h-[95vh] flex flex-col p-4">
          <SheetHeader className="text-left pb-2">
            <SheetTitle className="flex items-center gap-2 text-base">
              <Trophy className="w-4 h-4" />
              Import Cricket Matches
            </SheetTitle>
          </SheetHeader>
          <ImporterContent />
        </SheetContent>
      </Sheet>
    );
  }

  // Use Dialog on desktop
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
        <ImporterContent />
      </DialogContent>
    </Dialog>
  );
}
