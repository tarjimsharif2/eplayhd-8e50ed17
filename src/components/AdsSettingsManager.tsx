import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Save, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useSiteSettings, useUpdateSiteSettings, SiteSettings } from "@/hooks/useSiteSettings";

interface MatchPageAdPositions {
  before_player: boolean;
  after_player: boolean;
  sidebar: boolean;
  below_info: boolean;
}

const AdsSettingsManager = () => {
  const { toast } = useToast();
  const { data: siteSettings, isLoading } = useSiteSettings();
  const updateSiteSettings = useUpdateSiteSettings();

  const [form, setForm] = useState({
    ads_enabled: false,
    google_adsense_id: '',
    header_ad_code: '',
    sidebar_ad_code: '',
    footer_ad_code: '',
    in_article_ad_code: '',
    popup_ad_code: '',
    ads_txt_content: '',
    match_page_ad_positions: {
      before_player: true,
      after_player: true,
      sidebar: true,
      below_info: true,
    } as MatchPageAdPositions,
  });

  useEffect(() => {
    if (siteSettings) {
      const settings = siteSettings as any;
      setForm({
        ads_enabled: settings.ads_enabled || false,
        google_adsense_id: settings.google_adsense_id || '',
        header_ad_code: settings.header_ad_code || '',
        sidebar_ad_code: settings.sidebar_ad_code || '',
        footer_ad_code: settings.footer_ad_code || '',
        in_article_ad_code: settings.in_article_ad_code || '',
        popup_ad_code: settings.popup_ad_code || '',
        ads_txt_content: settings.ads_txt_content || '',
        match_page_ad_positions: settings.match_page_ad_positions || {
          before_player: true,
          after_player: true,
          sidebar: true,
          below_info: true,
        },
      });
    }
  }, [siteSettings]);

  const handleSave = async () => {
    if (!siteSettings?.id) {
      toast({
        title: "Error",
        description: "Site settings not found",
        variant: "destructive",
      });
      return;
    }

    try {
      await updateSiteSettings.mutateAsync({
        id: siteSettings.id,
        ads_enabled: form.ads_enabled,
        google_adsense_id: form.google_adsense_id || null,
        header_ad_code: form.header_ad_code || null,
        sidebar_ad_code: form.sidebar_ad_code || null,
        footer_ad_code: form.footer_ad_code || null,
        in_article_ad_code: form.in_article_ad_code || null,
        popup_ad_code: form.popup_ad_code || null,
        ads_txt_content: form.ads_txt_content || null,
        match_page_ad_positions: form.match_page_ad_positions,
      } as any);
      
      toast({ title: "Success", description: "Ads settings saved successfully" });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to save ads settings",
        variant: "destructive",
      });
    }
  };

  const updateAdPosition = (key: keyof MatchPageAdPositions, value: boolean) => {
    setForm({
      ...form,
      match_page_ad_positions: {
        ...form.match_page_ad_positions,
        [key]: value,
      },
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>General Ad Settings</CardTitle>
          <CardDescription>Configure global advertising settings</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="ads_enabled">Enable Ads</Label>
              <p className="text-sm text-muted-foreground">Turn on/off all advertisements</p>
            </div>
            <Switch
              id="ads_enabled"
              checked={form.ads_enabled}
              onCheckedChange={(checked) => setForm({ ...form, ads_enabled: checked })}
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="google_adsense_id">Google AdSense Publisher ID</Label>
            <Input
              id="google_adsense_id"
              value={form.google_adsense_id}
              onChange={(e) => setForm({ ...form, google_adsense_id: e.target.value })}
              placeholder="ca-pub-1234567890"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Match Page Ad Positions</CardTitle>
          <CardDescription>Select where ads should appear on match streaming pages</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4">
            <div className="flex items-center space-x-3">
              <Checkbox
                id="before_player"
                checked={form.match_page_ad_positions.before_player}
                onCheckedChange={(checked) => updateAdPosition('before_player', !!checked)}
              />
              <div>
                <Label htmlFor="before_player" className="cursor-pointer">Before Player</Label>
                <p className="text-sm text-muted-foreground">Display ad above the video player</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-3">
              <Checkbox
                id="after_player"
                checked={form.match_page_ad_positions.after_player}
                onCheckedChange={(checked) => updateAdPosition('after_player', !!checked)}
              />
              <div>
                <Label htmlFor="after_player" className="cursor-pointer">After Player</Label>
                <p className="text-sm text-muted-foreground">Display ad below the video player</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-3">
              <Checkbox
                id="sidebar"
                checked={form.match_page_ad_positions.sidebar}
                onCheckedChange={(checked) => updateAdPosition('sidebar', !!checked)}
              />
              <div>
                <Label htmlFor="sidebar" className="cursor-pointer">Sidebar</Label>
                <p className="text-sm text-muted-foreground">Display ad in the sidebar (desktop)</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-3">
              <Checkbox
                id="below_info"
                checked={form.match_page_ad_positions.below_info}
                onCheckedChange={(checked) => updateAdPosition('below_info', !!checked)}
              />
              <div>
                <Label htmlFor="below_info" className="cursor-pointer">Below Match Info</Label>
                <p className="text-sm text-muted-foreground">Display ad after match information section</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ad Code Slots</CardTitle>
          <CardDescription>Paste your ad code for each position</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="header_ad_code">Header Ad Code</Label>
            <Textarea
              id="header_ad_code"
              value={form.header_ad_code}
              onChange={(e) => setForm({ ...form, header_ad_code: e.target.value })}
              placeholder="Paste your header ad code here..."
              rows={4}
              className="font-mono text-sm"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="sidebar_ad_code">Sidebar Ad Code</Label>
            <Textarea
              id="sidebar_ad_code"
              value={form.sidebar_ad_code}
              onChange={(e) => setForm({ ...form, sidebar_ad_code: e.target.value })}
              placeholder="Paste your sidebar ad code here..."
              rows={4}
              className="font-mono text-sm"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="footer_ad_code">Footer Ad Code</Label>
            <Textarea
              id="footer_ad_code"
              value={form.footer_ad_code}
              onChange={(e) => setForm({ ...form, footer_ad_code: e.target.value })}
              placeholder="Paste your footer ad code here..."
              rows={4}
              className="font-mono text-sm"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="in_article_ad_code">In-Article Ad Code</Label>
            <Textarea
              id="in_article_ad_code"
              value={form.in_article_ad_code}
              onChange={(e) => setForm({ ...form, in_article_ad_code: e.target.value })}
              placeholder="Paste your in-article ad code here..."
              rows={4}
              className="font-mono text-sm"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="popup_ad_code">Popup Ad Code</Label>
            <Textarea
              id="popup_ad_code"
              value={form.popup_ad_code}
              onChange={(e) => setForm({ ...form, popup_ad_code: e.target.value })}
              placeholder="Paste your popup ad code here..."
              rows={4}
              className="font-mono text-sm"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ads.txt Content</CardTitle>
          <CardDescription>Configure your ads.txt file content for ad verification</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ads_txt_content">Ads.txt</Label>
            <Textarea
              id="ads_txt_content"
              value={form.ads_txt_content}
              onChange={(e) => setForm({ ...form, ads_txt_content: e.target.value })}
              placeholder="google.com, pub-1234567890, DIRECT, f08c47fec0942fa0"
              rows={6}
              className="font-mono text-sm"
            />
          </div>
        </CardContent>
      </Card>

      <Button 
        onClick={handleSave} 
        className="w-full" 
        disabled={updateSiteSettings.isPending}
      >
        {updateSiteSettings.isPending ? (
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
        ) : (
          <Save className="w-4 h-4 mr-2" />
        )}
        Save Ads Settings
      </Button>
    </div>
  );
};

export default AdsSettingsManager;
