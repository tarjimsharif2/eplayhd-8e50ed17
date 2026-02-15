import { useState, useEffect } from "react";
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

const CricApiMatchBrowser = ({ open, onClose, onSelectMatch, teamAName, teamBName }: CricApiMatchBrowserProps) => {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'series' | 'matches'>('series');
  const [searchQuery, setSearchQuery] = useState('');
  
  const [seriesList, setSeriesList] = useState<CricApiSeries[]>([]);
  const [selectedSeries, setSelectedSeries] = useState<CricApiSeries | null>(null);
  const [matchesList, setMatchesList] = useState<CricApiMatch[]>([]);

  useEffect(() => {
    if (open) {
      setStep('series');
      setSearchQuery('');
      setSelectedSeries(null);
      setSeriesList([]);
      setMatchesList([]);
      fetchApiKey();
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
    }
  };

  const fetchSeries = async (key: string) => {
    setLoading(true);
    try {
      const allSeries: CricApiSeries[] = [];
      let offset = 0;
      const maxPages = 5; // Fetch up to 5 pages (125 series)
      
      for (let page = 0; page < maxPages; page++) {
        const res = await fetch(`https://api.cricapi.com/v1/series?apikey=${key}&offset=${offset}`);
        if (!res.ok) break;
        
        const data = await res.json();
        if (data.status === 'success' && data.data?.length > 0) {
          allSeries.push(...data.data);
          // CricAPI returns 25 per page, if less than 25 returned, no more pages
          if (data.data.length < 25) break;
          offset += 25;
        } else {
          break;
        }
      }
      
      setSeriesList(allSeries);
    } catch (e) {
      console.error('Failed to fetch series:', e);
    } finally {
      setLoading(false);
    }
  };

  const fetchSeriesMatches = async (seriesId: string) => {
    if (!apiKey) return;
    setLoading(true);
    try {
      const res = await fetch(`https://api.cricapi.com/v1/series_info?apikey=${apiKey}&id=${seriesId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.status === 'success' && data.data?.matchList?.length > 0) {
          setMatchesList(data.data.matchList);
          return;
        }
      }
      setMatchesList([]);
    } catch (e) {
      console.error('Failed to fetch series matches:', e);
      setMatchesList([]);
    } finally {
      setLoading(false);
    }
  };

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

  // Filter based on search query
  const q = searchQuery.toLowerCase().trim();
  const displayedSeries = q
    ? seriesList.filter(s => s.name.toLowerCase().includes(q))
    : seriesList;
  const displayedMatches = q
    ? matchesList.filter(m => 
        m.name?.toLowerCase().includes(q) || 
        m.teams?.some(t => t.toLowerCase().includes(q))
      )
    : matchesList;

  const getMatchStatusBadge = (match: CricApiMatch) => {
    if (match.matchStarted && !match.matchEnded) return { label: 'LIVE', variant: 'destructive' as const };
    if (match.matchEnded) return { label: 'Ended', variant: 'secondary' as const };
    return { label: 'Upcoming', variant: 'secondary' as const };
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
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder={step === 'series' ? 'Search tournament...' : 'Search match...'}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {step === 'series' 
              ? `Looking for: ${teamAName} vs ${teamBName}` 
              : `${displayedMatches.length} match${displayedMatches.length !== 1 ? 'es' : ''} found`
            }
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-6 pb-6 pt-2 min-h-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">Loading...</span>
            </div>
          ) : step === 'series' ? (
            <div className="space-y-2">
              {displayedSeries.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No tournaments found</p>
              ) : (
                displayedSeries.map((series) => (
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
              {displayedMatches.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No matches found in this series</p>
              ) : (
                displayedMatches.map((match) => {
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
                })
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CricApiMatchBrowser;
