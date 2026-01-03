import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { RefreshCw, ExternalLink, Copy, Loader2, FileText, Globe, CheckCircle2, Bell, Send, Layers, History, Clock } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format } from "date-fns";

interface SitemapStats {
  totalUrls: number;
  matchUrls: number;
  tournamentUrls: number;
  pageUrls: number;
}

interface PingResult {
  engine: string;
  success: boolean;
  status?: number;
  error?: string;
}

interface PingHistoryItem {
  id: string;
  ping_type: string;
  triggered_by: string | null;
  sitemap_url: string;
  results: PingResult[];
  success_count: number;
  total_count: number;
  created_at: string;
}

const SitemapManager = () => {
  const { toast } = useToast();
  const [sitemapContent, setSitemapContent] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [isPinging, setIsPinging] = useState(false);
  const [stats, setStats] = useState<SitemapStats | null>(null);
  const [canonicalUrl, setCanonicalUrl] = useState<string>('');
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [pingResults, setPingResults] = useState<PingResult[] | null>(null);
  const [pingHistory, setPingHistory] = useState<PingHistoryItem[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  const projectId = 'doqteforumjdugifxryl';
  const sitemapUrl = `https://${projectId}.supabase.co/functions/v1/sitemap`;
  const sitemapIndexUrl = `https://${projectId}.supabase.co/functions/v1/sitemap?type=index`;

  useEffect(() => {
    // Fetch canonical URL from site settings
    const fetchCanonicalUrl = async () => {
      const { data } = await supabase
        .from('site_settings_public')
        .select('canonical_url')
        .single();
      
      if (data?.canonical_url) {
        setCanonicalUrl(data.canonical_url);
      }
    };
    fetchCanonicalUrl();
    fetchPingHistory();
  }, []);

  const fetchPingHistory = async () => {
    setIsLoadingHistory(true);
    try {
      const { data, error } = await supabase
        .from('sitemap_ping_history')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);
      
      if (error) throw error;
      // Transform the data to match our interface
      const transformedData: PingHistoryItem[] = (data || []).map(item => ({
        ...item,
        results: (item.results as unknown as PingResult[]) || [],
        success_count: item.success_count ?? 0,
        total_count: item.total_count ?? 0,
      }));
      setPingHistory(transformedData);
    } catch (error) {
      console.error('Error fetching ping history:', error);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const fetchSitemap = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(sitemapUrl);
      
      if (!response.ok) {
        throw new Error('Failed to fetch sitemap');
      }
      
      const xml = await response.text();
      setSitemapContent(xml);
      setLastRefreshed(new Date());
      
      // Parse stats from XML
      const urlMatches = xml.match(/<url>/g);
      const matchUrls = xml.match(/\/match\//g);
      const tournamentUrls = xml.match(/\/tournament\//g);
      const pageUrls = xml.match(/\/page\//g);
      
      setStats({
        totalUrls: urlMatches?.length || 0,
        matchUrls: matchUrls?.length || 0,
        tournamentUrls: tournamentUrls?.length || 0,
        pageUrls: pageUrls?.length || 0,
      });
      
      toast({
        title: "Sitemap refreshed",
        description: `Found ${urlMatches?.length || 0} URLs in sitemap`,
      });
    } catch (error) {
      console.error('Error fetching sitemap:', error);
      toast({
        title: "Error",
        description: "Failed to fetch sitemap. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const pingSearchEngines = async () => {
    setIsPinging(true);
    setPingResults(null);
    try {
      const { data, error } = await supabase.functions.invoke('sitemap-ping', {
        body: { ping_type: 'manual', triggered_by: 'admin_panel' }
      });
      
      if (error) throw error;
      
      setPingResults(data.results);
      
      const successCount = data.results?.filter((r: PingResult) => r.success).length || 0;
      const totalCount = data.results?.length || 0;
      
      toast({
        title: "Search engines pinged",
        description: data.summary || `${successCount}/${totalCount} search engines notified`,
      });

      // Refresh history after ping
      fetchPingHistory();
    } catch (error) {
      console.error('Error pinging search engines:', error);
      toast({
        title: "Error",
        description: "Failed to ping search engines. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsPinging(false);
    }
  };

  const copySitemapUrl = () => {
    navigator.clipboard.writeText(sitemapUrl);
    toast({
      title: "Copied!",
      description: "Sitemap URL copied to clipboard",
    });
  };

  const copySitemapIndexUrl = () => {
    navigator.clipboard.writeText(sitemapIndexUrl);
    toast({
      title: "Copied!",
      description: "Sitemap index URL copied to clipboard",
    });
  };

  const copySearchConsoleUrl = () => {
    const searchConsoleUrl = canonicalUrl 
      ? `${canonicalUrl.replace(/\/$/, '')}/sitemap.xml`
      : sitemapUrl;
    navigator.clipboard.writeText(searchConsoleUrl);
    toast({
      title: "Copied!",
      description: "Search console URL copied to clipboard",
    });
  };

  const robotsTxtContent = canonicalUrl 
    ? `User-agent: *\nAllow: /\n\nSitemap: ${canonicalUrl.replace(/\/$/, '')}/sitemap.xml`
    : `User-agent: *\nAllow: /\n\nSitemap: ${sitemapUrl}`;

  const copyRobotsTxt = () => {
    navigator.clipboard.writeText(robotsTxtContent);
    toast({
      title: "Copied!",
      description: "robots.txt content copied to clipboard",
    });
  };

  const getPingTypeLabel = (type: string) => {
    switch (type) {
      case 'auto_match': return 'Match Save';
      case 'auto_tournament': return 'Tournament Save';
      case 'auto_page': return 'Page Save';
      case 'manual': return 'Manual';
      default: return type;
    }
  };

  const getPingTypeBadgeVariant = (type: string): "default" | "secondary" | "outline" => {
    switch (type) {
      case 'auto_match': return 'default';
      case 'auto_tournament': return 'secondary';
      case 'auto_page': return 'outline';
      default: return 'outline';
    }
  };

  return (
    <div className="space-y-6">
      {/* Ping Search Engines Card */}
      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-primary" />
            Notify Search Engines
          </CardTitle>
          <CardDescription>
            Ping Google, Bing, and Yandex when you publish new content
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
            <Button 
              variant="gradient" 
              onClick={pingSearchEngines}
              disabled={isPinging}
              className="w-full sm:w-auto"
            >
              {isPinging ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Send className="w-4 h-4 mr-2" />
              )}
              Ping Search Engines
            </Button>
          </div>

          {pingResults && (
            <div className="flex flex-wrap gap-2">
              {pingResults.map((result) => (
                <Badge 
                  key={result.engine}
                  variant={result.success ? "default" : "destructive"}
                  className="text-xs"
                >
                  {result.engine}: {result.success ? `✓ ${result.status}` : `✗ ${result.error || 'Failed'}`}
                </Badge>
              ))}
            </div>
          )}

          <div className="p-3 rounded-lg bg-muted/50 border border-border/50">
            <p className="text-xs text-muted-foreground">
              <strong>Auto-ping enabled:</strong> Search engines are automatically notified when you save matches or tournaments with page type enabled.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Ping History Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <History className="w-5 h-5 text-primary" />
              Indexing Ping History
            </div>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={fetchPingHistory}
              disabled={isLoadingHistory}
            >
              {isLoadingHistory ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
            </Button>
          </CardTitle>
          <CardDescription>
            Track when search engines were notified about sitemap updates
          </CardDescription>
        </CardHeader>
        <CardContent>
          {pingHistory.length > 0 ? (
            <ScrollArea className="h-64">
              <div className="space-y-2">
                {pingHistory.map((item) => (
                  <div 
                    key={item.id} 
                    className="p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Badge variant={getPingTypeBadgeVariant(item.ping_type)} className="text-xs">
                          {getPingTypeLabel(item.ping_type)}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {item.success_count}/{item.total_count} successful
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="w-3 h-3" />
                        {format(new Date(item.created_at), 'MMM d, HH:mm')}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {(item.results as PingResult[]).map((result) => (
                        <span 
                          key={result.engine}
                          className={`text-xs px-1.5 py-0.5 rounded ${
                            result.success 
                              ? 'bg-green-500/10 text-green-600 dark:text-green-400' 
                              : 'bg-red-500/10 text-red-600 dark:text-red-400'
                          }`}
                        >
                          {result.engine} {result.success ? '✓' : '✗'}
                        </span>
                      ))}
                    </div>
                    {item.triggered_by && (
                      <p className="text-xs text-muted-foreground mt-1 truncate">
                        Triggered by: {item.triggered_by}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <History className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No ping history yet</p>
              <p className="text-xs mt-1">Click "Ping Search Engines" to get started</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sitemap URLs Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="w-5 h-5 text-primary" />
            Sitemap URLs
          </CardTitle>
          <CardDescription>
            Use these URLs for Google Search Console and other search engines
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Combined Sitemap URL (Recommended for smaller sites)</Label>
            <div className="flex gap-2">
              <Input 
                value={sitemapUrl} 
                readOnly 
                className="font-mono text-xs"
              />
              <Button variant="outline" size="icon" onClick={copySitemapUrl}>
                <Copy className="w-4 h-4" />
              </Button>
              <Button variant="outline" size="icon" asChild>
                <a href={sitemapUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="w-4 h-4" />
                </a>
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Layers className="w-4 h-4" />
              Sitemap Index URL (Recommended for large sites)
            </Label>
            <div className="flex gap-2">
              <Input 
                value={sitemapIndexUrl} 
                readOnly 
                className="font-mono text-xs"
              />
              <Button variant="outline" size="icon" onClick={copySitemapIndexUrl}>
                <Copy className="w-4 h-4" />
              </Button>
              <Button variant="outline" size="icon" asChild>
                <a href={sitemapIndexUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="w-4 h-4" />
                </a>
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Sitemap index splits URLs into separate files for better performance with 1000+ URLs
            </p>
          </div>

          <div className="space-y-2">
            <Label>Search Console URL (for submission)</Label>
            <div className="flex gap-2">
              <Input 
                value={canonicalUrl ? `${canonicalUrl.replace(/\/$/, '')}/sitemap.xml` : sitemapUrl} 
                readOnly 
                className="font-mono text-xs"
              />
              <Button variant="outline" size="icon" onClick={copySearchConsoleUrl}>
                <Copy className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {!canonicalUrl && (
            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <p className="text-xs text-amber-600 dark:text-amber-400">
                <strong>Note:</strong> Set your Canonical URL in Settings for proper sitemap URL generation
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Individual Sitemap Files Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-primary" />
            Individual Sitemap Files
          </CardTitle>
          <CardDescription>
            Access individual sitemap files for specific content types
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="p-3 rounded-lg border bg-card">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Matches</span>
                <Button variant="ghost" size="sm" asChild className="h-7 px-2">
                  <a href={`${sitemapUrl}?type=matches`} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </Button>
              </div>
              <p className="text-xs text-muted-foreground truncate font-mono">
                ?type=matches
              </p>
            </div>
            <div className="p-3 rounded-lg border bg-card">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Tournaments</span>
                <Button variant="ghost" size="sm" asChild className="h-7 px-2">
                  <a href={`${sitemapUrl}?type=tournaments`} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </Button>
              </div>
              <p className="text-xs text-muted-foreground truncate font-mono">
                ?type=tournaments
              </p>
            </div>
            <div className="p-3 rounded-lg border bg-card">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Pages</span>
                <Button variant="ghost" size="sm" asChild className="h-7 px-2">
                  <a href={`${sitemapUrl}?type=pages`} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </Button>
              </div>
              <p className="text-xs text-muted-foreground truncate font-mono">
                ?type=pages
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Robots.txt Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            robots.txt Configuration
          </CardTitle>
          <CardDescription>
            Add this sitemap reference to your robots.txt file
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Recommended robots.txt content</Label>
            <Textarea 
              value={robotsTxtContent}
              readOnly
              className="font-mono text-xs h-24"
            />
            <div className="flex justify-end">
              <Button variant="outline" size="sm" onClick={copyRobotsTxt}>
                <Copy className="w-4 h-4 mr-2" />
                Copy robots.txt
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Sitemap Preview Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" />
              Sitemap Preview
            </div>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={fetchSitemap}
              disabled={isLoading}
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-2" />
              )}
              Refresh
            </Button>
          </CardTitle>
          <CardDescription>
            Preview the auto-generated sitemap content
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {stats && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-3 rounded-lg bg-primary/10 text-center">
                <div className="text-2xl font-bold text-primary">{stats.totalUrls}</div>
                <div className="text-xs text-muted-foreground">Total URLs</div>
              </div>
              <div className="p-3 rounded-lg bg-green-500/10 text-center">
                <div className="text-2xl font-bold text-green-600 dark:text-green-400">{stats.matchUrls}</div>
                <div className="text-xs text-muted-foreground">Match Pages</div>
              </div>
              <div className="p-3 rounded-lg bg-blue-500/10 text-center">
                <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{stats.tournamentUrls}</div>
                <div className="text-xs text-muted-foreground">Tournament Pages</div>
              </div>
              <div className="p-3 rounded-lg bg-purple-500/10 text-center">
                <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">{stats.pageUrls}</div>
                <div className="text-xs text-muted-foreground">Dynamic Pages</div>
              </div>
            </div>
          )}

          {lastRefreshed && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <CheckCircle2 className="w-3 h-3 text-green-500" />
              Last refreshed: {lastRefreshed.toLocaleString()}
            </div>
          )}

          {sitemapContent ? (
            <Textarea 
              value={sitemapContent}
              readOnly
              className="font-mono text-xs h-64"
            />
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>Click "Refresh" to load and preview the sitemap</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Search Console Setup Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="w-5 h-5 text-primary" />
            Search Console Setup Guide
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[
            { title: 'Google Search Console', url: 'https://search.google.com/search-console', desc: 'Sitemaps → Add your sitemap URL' },
            { title: 'Bing Webmaster Tools', url: 'https://www.bing.com/webmasters', desc: 'Sitemaps → Submit Sitemap' },
            { title: 'Auto-ping on Save', desc: 'Matches & tournaments auto-ping when saved' },
            { title: 'Automatic Discovery', desc: 'Search engines find sitemap via robots.txt' },
          ].map((item, i) => (
            <div key={i} className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold shrink-0">{i + 1}</div>
              <div>
                <p className="font-medium text-sm">{item.title}</p>
                <p className="text-xs text-muted-foreground">
                  {item.url ? (
                    <>Go to <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{item.title}</a> → {item.desc}</>
                  ) : item.desc}
                </p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
};

export default SitemapManager;
