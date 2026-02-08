import { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Search, ChevronRight, ArrowLeft, Trophy, Calendar } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface CricApiSeries {
  id: string;
  name: string;
  startDate?: string;
  endDate?: string;
  odi?: number;
  t20?: number;
  test?: number;
  squads?: number;
  matches?: number;
}

interface CricApiMatch {
  id: string;
  name: string;
  status: string;
  venue?: string;
  date?: string;
  dateTimeGMT?: string;
  matchType?: string;
  teams?: string[];
  teamInfo?: { name: string; shortname: string; img: string }[];
  matchStarted?: boolean;
  matchEnded?: boolean;
}

interface CricApiMatchBrowserProps {
  open: boolean;
  onClose: () => void;
  onSelectMatch: (matchId: string, matchName: string) => void;
  teamAName: string;
  teamBName: string;
}

const isSeriesCompleted = (series: CricApiSeries): boolean => {
  if (!series.endDate) return false;
  
  // endDate can be full "2026-09-15" or short "Sep 27"
  let endDate = new Date(series.endDate);
  
  // If short format like "Sep 27", derive year from startDate
  if (isNaN(endDate.getTime()) && series.startDate) {
    const year = new Date(series.startDate).getFullYear();
    endDate = new Date(`${series.endDate} ${year}`);
  }
  
  if (isNaN(endDate.getTime())) return false;
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return endDate < today;
};

const CricApiMatchBrowser = ({ open, onClose, onSelectMatch, teamAName, teamBName }: CricApiMatchBrowserProps) => {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'series' | 'matches'>('series');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Series state
  const [seriesList, setSeriesList] = useState<CricApiSeries[]>([]);
  const [filteredSeries, setFilteredSeries] = useState<CricApiSeries[]>([]);
  const [selectedSeries, setSelectedSeries] = useState<CricApiSeries | null>(null);
  
  // Matches state
  const [matchesList, setMatchesList] = useState<CricApiMatch[]>([]);
  const [filteredMatches, setFilteredMatches] = useState<CricApiMatch[]>([]);
  const [allMatches, setAllMatches] = useState<CricApiMatch[]>([]);

  // Fetch API key on open
  useEffect(() => {
    if (open) {
      fetchApiKey();
      setStep('series');
      setSearchQuery('');
      setSelectedSeries(null);
      setSeriesList([]);
      setMatchesList([]);
      setAllMatches([]);
    }
  }, [open]);

  const fetchApiKey = async () => {
    const { data } = await supabase
      .from('site_settings')
      .select('cricket_api_key')
      .limit(1)
      .maybeSingle();
    
    if (data?.cricket_api_key) {
      setApiKey(data.cricket_api_key);
      fetchSeries(data.cricket_api_key);
      fetchAllMatches(data.cricket_api_key);
    }
  };

  const fetchSeries = async (key: string) => {
    setLoading(true);
    try {
      const res = await fetch(`https://api.cricapi.com/v1/series?apikey=${key}&offset=0`);
      if (res.ok) {
        const data = await res.json();
        if (data.status === 'success' && data.data) {
          // Filter out completed tournaments
          const activeSeries = data.data.filter((s: CricApiSeries) => !isSeriesCompleted(s));
          setSeriesList(activeSeries);
          setFilteredSeries(activeSeries);
        }
      }
    } catch (e) {
      console.error('Failed to fetch series:', e);
    } finally {
      setLoading(false);
    }
  };

  const fetchAllMatches = async (key: string) => {
    const all: CricApiMatch[] = [];
    for (let offset = 0; offset <= 75; offset += 25) {
      try {
        const res = await fetch(`https://api.cricapi.com/v1/matches?apikey=${key}&offset=${offset}`);
        if (res.ok) {
          const data = await res.json();
          if (data.status === 'success' && data.data?.length > 0) {
            all.push(...data.data);
            if (data.data.length < 25) break;
          } else break;
        }
      } catch { break; }
    }
    setAllMatches(all);
  };

  const fetchSeriesMatches = async (seriesId: string) => {
    if (!apiKey) return;
    setLoading(true);
    try {
      // Try series_info endpoint first for complete match list
      const res = await fetch(`https://api.cricapi.com/v1/series_info?apikey=${apiKey}&id=${seriesId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.status === 'success' && data.data?.matchList?.length > 0) {
          setMatchesList(data.data.matchList);
          setFilteredMatches(data.data.matchList);
          setLoading(false);
          return;
        }
      }

      // Fallback: filter from all matches
      const seriesMatches = allMatches.filter(m => (m as any).series_id === seriesId);
      setMatchesList(seriesMatches);
      setFilteredMatches(seriesMatches);
    } catch (e) {
      console.error('Failed to fetch series matches:', e);
    } finally {
      setLoading(false);
    }
  };

  // Filter series based on search
  useEffect(() => {
    if (step === 'series') {
      const q = searchQuery.toLowerCase().trim();
      if (!q) {
        setFilteredSeries(seriesList);
      } else {
        setFilteredSeries(seriesList.filter(s => s.name.toLowerCase().includes(q)));
      }
    } else {
      const q = searchQuery.toLowerCase().trim();
      if (!q) {
        setFilteredMatches(matchesList);
      } else {
        setFilteredMatches(matchesList.filter(m => 
          m.name?.toLowerCase().includes(q) || 
          m.teams?.some(t => t.toLowerCase().includes(q))
        ));
      }
    }
  }, [searchQuery, seriesList, matchesList, step]);

  const handleSelectSeries = (series: CricApiSeries) => {
    setSelectedSeries(series);
    setStep('matches');
    setSearchQuery('');
    fetchSeriesMatches(series.id);
  };

  const handleBack = () => {
    setStep('series');
    setSearchQuery('');
    setMatchesList([]);
  };

  const handleSelectMatch = (match: CricApiMatch) => {
    onSelectMatch(match.id, match.name);
    onClose();
  };

  // Also search all matches directly (not just series-filtered)
  const handleSearchAllMatches = useCallback(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q || !allMatches.length) return [];
    return allMatches.filter(m =>
      m.name?.toLowerCase().includes(q) ||
      m.teams?.some(t => t.toLowerCase().includes(q))
    );
  }, [searchQuery, allMatches]);

  const directMatchResults = step === 'series' && searchQuery.length >= 2 ? handleSearchAllMatches() : [];

  const getMatchStatusBadge = (match: CricApiMatch) => {
    if (match.matchStarted && !match.matchEnded) return { label: 'LIVE', variant: 'destructive' as const };
    if (match.matchEnded) return { label: 'Ended', variant: 'secondary' as const };
    return { label: 'Upcoming', variant: 'secondary' as const };
  };

  const renderMatchCard = (match: CricApiMatch) => {
    const badge = getMatchStatusBadge(match);
    return (
      <Card
        key={match.id}
        className="cursor-pointer hover:border-primary/50 transition-colors"
        onClick={() => handleSelectMatch(match)}
      >
        <CardContent className="p-3">
          <div className="flex items-start gap-2">
            <Calendar className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium leading-tight">{match.name}</p>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className="text-xs text-muted-foreground">{match.date || match.dateTimeGMT}</span>
                <Badge variant={badge.variant} className="text-[9px] px-1.5 py-0">
                  {badge.label}
                </Badge>
                {match.matchType && (
                  <Badge variant="outline" className="text-[9px] px-1.5 py-0">{match.matchType.toUpperCase()}</Badge>
                )}
              </div>
              {match.venue && <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{match.venue}</p>}
              {match.teamInfo && match.teamInfo.length >= 2 && (
                <div className="flex items-center gap-3 mt-1.5">
                  {match.teamInfo.map((t, i) => (
                    <div key={i} className="flex items-center gap-1">
                      <img src={t.img} alt={t.shortname} className="w-4 h-4 object-contain" 
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      <span className="text-[11px] font-medium">{t.shortname}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] p-0 flex flex-col overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-0 shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            {step === 'matches' && (
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleBack}>
                <ArrowLeft className="w-4 h-4" />
              </Button>
            )}
            {step === 'series' ? 'CricAPI: Browse Tournaments' : selectedSeries?.name || 'Select Match'}
          </DialogTitle>
        </DialogHeader>

        <div className="px-6 pt-3 shrink-0 space-y-2">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder={step === 'series' ? 'Search tournament or match...' : 'Search match...'}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
              autoFocus
            />
          </div>

          {/* Info hint */}
          <p className="text-xs text-muted-foreground">
            {step === 'series' 
              ? `Looking for: ${teamAName} vs ${teamBName}` 
              : `${filteredMatches.length} match${filteredMatches.length !== 1 ? 'es' : ''} found`
            }
          </p>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-6 pb-6 pt-2 min-h-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">Loading...</span>
            </div>
          ) : step === 'series' ? (
            <div className="space-y-2">
              {/* Direct match results when searching */}
              {directMatchResults.length > 0 && (
                <div className="space-y-2 mb-4">
                  <p className="text-xs font-semibold text-primary px-1">🎯 Direct Matches ({directMatchResults.length})</p>
                  {directMatchResults.slice(0, 10).map(renderMatchCard)}
                  {directMatchResults.length > 10 && (
                    <p className="text-xs text-muted-foreground text-center">{directMatchResults.length - 10} more match(es)...</p>
                  )}
                </div>
              )}

              {/* Series list */}
              {directMatchResults.length > 0 && filteredSeries.length > 0 && (
                <p className="text-xs font-semibold text-primary px-1 pt-2 border-t">🏆 Tournaments ({filteredSeries.length})</p>
              )}
              {filteredSeries.length === 0 && directMatchResults.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No tournaments found</p>
              ) : (
                filteredSeries.map((series) => (
                  <Card
                    key={series.id}
                    className="cursor-pointer hover:border-primary/50 transition-colors"
                    onClick={() => handleSelectSeries(series)}
                  >
                    <CardContent className="p-3 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <Trophy className="w-4 h-4 text-primary shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium leading-tight truncate">{series.name}</p>
                          <div className="flex gap-2 mt-0.5 flex-wrap">
                            {series.startDate && (
                              <span className="text-[11px] text-muted-foreground">{series.startDate}</span>
                            )}
                            {(series.odi || series.t20 || series.test) && (
                              <span className="text-[11px] text-muted-foreground">
                                {[
                                  series.test && `${series.test} Test`,
                                  series.odi && `${series.odi} ODI`,
                                  series.t20 && `${series.t20} T20`,
                                ].filter(Boolean).join(', ')}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredMatches.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No matches found in this series</p>
              ) : (
                filteredMatches.map(renderMatchCard)
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CricApiMatchBrowser;
