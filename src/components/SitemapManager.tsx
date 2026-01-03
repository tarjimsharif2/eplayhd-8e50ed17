import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { RefreshCw, ExternalLink, Copy, Loader2, FileText, Globe, CheckCircle2 } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";

interface SitemapStats {
  totalUrls: number;
  matchUrls: number;
  tournamentUrls: number;
  pageUrls: number;
}

const SitemapManager = () => {
  const { toast } = useToast();
  const [sitemapContent, setSitemapContent] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [stats, setStats] = useState<SitemapStats | null>(null);
  const [canonicalUrl, setCanonicalUrl] = useState<string>('');
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const projectId = 'doqteforumjdugifxryl';
  const sitemapUrl = `https://${projectId}.supabase.co/functions/v1/sitemap`;

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
  }, []);

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

  const copySitemapUrl = () => {
    navigator.clipboard.writeText(sitemapUrl);
    toast({
      title: "Copied!",
      description: "Sitemap URL copied to clipboard",
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

  return (
    <div className="space-y-6">
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
            <Label>Direct Sitemap URL (Edge Function)</Label>
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
            <p className="text-xs text-muted-foreground">
              Submit this URL to Google Search Console, Bing Webmaster Tools, etc.
            </p>
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
          
          <div className="p-3 rounded-lg bg-muted/50 border border-border/50">
            <p className="text-xs text-muted-foreground">
              <strong>Tip:</strong> The sitemap URL in robots.txt helps search engine crawlers discover your sitemap automatically.
            </p>
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
            <div className="space-y-2">
              <Textarea 
                value={sitemapContent}
                readOnly
                className="font-mono text-xs h-64"
              />
            </div>
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
          <CardDescription>
            How to submit your sitemap to search engines
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold shrink-0">1</div>
              <div>
                <p className="font-medium text-sm">Google Search Console</p>
                <p className="text-xs text-muted-foreground">
                  Go to <a href="https://search.google.com/search-console" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Search Console</a> → Sitemaps → Add your sitemap URL
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold shrink-0">2</div>
              <div>
                <p className="font-medium text-sm">Bing Webmaster Tools</p>
                <p className="text-xs text-muted-foreground">
                  Go to <a href="https://www.bing.com/webmasters" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Bing Webmaster</a> → Sitemaps → Submit Sitemap
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold shrink-0">3</div>
              <div>
                <p className="font-medium text-sm">Automatic Discovery</p>
                <p className="text-xs text-muted-foreground">
                  Search engines will also find your sitemap via robots.txt reference
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default SitemapManager;
