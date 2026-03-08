import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Shield } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Save, Loader2, Plus, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useSiteSettings, useUpdateSiteSettings } from "@/hooks/useSiteSettings";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface AdPositions {
  before_player: boolean;
  after_player: boolean;
  sidebar: boolean;
  below_info: boolean;
  after_servers: boolean;
  after_score: boolean;
  before_scoreboard: boolean;
  after_scoreboard: boolean;
  before_playingxi: boolean;
  after_playingxi: boolean;
}

interface TournamentAdPositions {
  before_matches: boolean;
  after_matches: boolean;
  sidebar: boolean;
  before_points_table: boolean;
  after_points_table: boolean;
  before_teams: boolean;
  after_teams: boolean;
  before_about: boolean;
  after_about: boolean;
  between_sections: boolean;
}

interface AdCodeSlot {
  id: string;
  name: string;
  code: string;
  enabled: boolean;
}

interface MultipleAdCodes {
  header: AdCodeSlot[];
  sidebar: AdCodeSlot[];
  footer: AdCodeSlot[];
  in_article: AdCodeSlot[];
  popup: AdCodeSlot[];
  match_before_player: AdCodeSlot[];
  match_after_player: AdCodeSlot[];
  match_sidebar: AdCodeSlot[];
  match_below_info: AdCodeSlot[];
  match_after_servers: AdCodeSlot[];
  match_after_score: AdCodeSlot[];
  match_before_scoreboard: AdCodeSlot[];
  match_after_scoreboard: AdCodeSlot[];
  match_before_playingxi: AdCodeSlot[];
  match_after_playingxi: AdCodeSlot[];
  tournament_before_matches: AdCodeSlot[];
  tournament_after_matches: AdCodeSlot[];
  tournament_sidebar: AdCodeSlot[];
  tournament_before_points: AdCodeSlot[];
  tournament_after_points: AdCodeSlot[];
  tournament_before_teams: AdCodeSlot[];
  tournament_after_teams: AdCodeSlot[];
  tournament_before_about: AdCodeSlot[];
  tournament_after_about: AdCodeSlot[];
  tournament_between_sections: AdCodeSlot[];
}

const generateId = () => Math.random().toString(36).substr(2, 9);

const defaultMultipleAdCodes: MultipleAdCodes = {
  header: [],
  sidebar: [],
  footer: [],
  in_article: [],
  popup: [],
  match_before_player: [],
  match_after_player: [],
  match_sidebar: [],
  match_below_info: [],
  match_after_servers: [],
  match_after_score: [],
  match_before_scoreboard: [],
  match_after_scoreboard: [],
  match_before_playingxi: [],
  match_after_playingxi: [],
  tournament_before_matches: [],
  tournament_after_matches: [],
  tournament_sidebar: [],
  tournament_before_points: [],
  tournament_after_points: [],
  tournament_before_teams: [],
  tournament_after_teams: [],
  tournament_before_about: [],
  tournament_after_about: [],
  tournament_between_sections: [],
};

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
    ad_click_protection: {
      enabled: false,
      max_clicks: 10,
      time_window_days: 1,
      block_duration_hours: 24,
    },
    match_page_ad_positions: {
      before_player: true,
      after_player: true,
      sidebar: true,
      below_info: true,
      after_servers: true,
      after_score: true,
      before_scoreboard: true,
      after_scoreboard: true,
      before_playingxi: true,
      after_playingxi: true,
    } as AdPositions,
    tournament_page_ad_positions: {
      before_matches: true,
      after_matches: true,
      sidebar: true,
      before_points_table: true,
      after_points_table: true,
      before_teams: true,
      after_teams: true,
      before_about: true,
      after_about: true,
      between_sections: true,
    } as TournamentAdPositions,
    multiple_ad_codes: defaultMultipleAdCodes,
  });

  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});

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
        ad_click_protection: settings.ad_click_protection || {
          enabled: false,
          max_clicks: 10,
          time_window_days: 1,
          block_duration_hours: 24,
        },
        match_page_ad_positions: settings.match_page_ad_positions || {
          before_player: true,
          after_player: true,
          sidebar: true,
          below_info: true,
          after_servers: true,
          after_score: true,
          before_scoreboard: true,
          after_scoreboard: true,
          before_playingxi: true,
          after_playingxi: true,
        },
        tournament_page_ad_positions: settings.tournament_page_ad_positions || {
          before_matches: true,
          after_matches: true,
          sidebar: true,
          before_points_table: true,
          after_points_table: true,
          before_teams: true,
          after_teams: true,
          before_about: true,
          after_about: true,
          between_sections: true,
        },
        multiple_ad_codes: settings.multiple_ad_codes || defaultMultipleAdCodes,
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
        ad_click_protection: form.ad_click_protection,
        match_page_ad_positions: form.match_page_ad_positions,
        tournament_page_ad_positions: form.tournament_page_ad_positions,
        multiple_ad_codes: form.multiple_ad_codes,
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

  const updateMatchAdPosition = (key: keyof AdPositions, value: boolean) => {
    setForm({
      ...form,
      match_page_ad_positions: {
        ...form.match_page_ad_positions,
        [key]: value,
      },
    });
  };

  const updateTournamentAdPosition = (key: keyof TournamentAdPositions, value: boolean) => {
    setForm({
      ...form,
      tournament_page_ad_positions: {
        ...form.tournament_page_ad_positions,
        [key]: value,
      },
    });
  };

  const addAdSlot = (position: keyof MultipleAdCodes) => {
    const newSlot: AdCodeSlot = {
      id: generateId(),
      name: `Ad Slot ${(form.multiple_ad_codes[position]?.length || 0) + 1}`,
      code: '',
      enabled: true,
    };
    setForm({
      ...form,
      multiple_ad_codes: {
        ...form.multiple_ad_codes,
        [position]: [...(form.multiple_ad_codes[position] || []), newSlot],
      },
    });
  };

  const updateAdSlot = (position: keyof MultipleAdCodes, slotId: string, updates: Partial<AdCodeSlot>) => {
    setForm({
      ...form,
      multiple_ad_codes: {
        ...form.multiple_ad_codes,
        [position]: form.multiple_ad_codes[position].map((slot) =>
          slot.id === slotId ? { ...slot, ...updates } : slot
        ),
      },
    });
  };

  const removeAdSlot = (position: keyof MultipleAdCodes, slotId: string) => {
    setForm({
      ...form,
      multiple_ad_codes: {
        ...form.multiple_ad_codes,
        [position]: form.multiple_ad_codes[position].filter((slot) => slot.id !== slotId),
      },
    });
  };

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const renderAdSlots = (position: keyof MultipleAdCodes, label: string) => {
    const slots = form.multiple_ad_codes[position] || [];
    const isExpanded = expandedSections[position];

    return (
      <Collapsible open={isExpanded} onOpenChange={() => toggleSection(position)}>
        <div className="border rounded-lg p-4 space-y-3">
          <CollapsibleTrigger asChild>
            <div className="flex items-center justify-between cursor-pointer">
              <div className="flex items-center gap-2">
                <h4 className="font-medium">{label}</h4>
                <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
                  {slots.length} slot{slots.length !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    addAdSlot(position);
                    setExpandedSections((prev) => ({ ...prev, [position]: true }));
                  }}
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Add Slot
                </Button>
                {isExpanded ? (
                  <ChevronUp className="w-4 h-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                )}
              </div>
            </div>
          </CollapsibleTrigger>

          <CollapsibleContent className="space-y-3">
            {slots.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No ad slots configured. Click "Add Slot" to add an ad code.
              </p>
            ) : (
              slots.map((slot, index) => (
                <div key={slot.id} className="border border-border/50 rounded-lg p-3 space-y-2 bg-muted/30">
                  <div className="flex items-center gap-2">
                    <Input
                      value={slot.name}
                      onChange={(e) => updateAdSlot(position, slot.id, { name: e.target.value })}
                      placeholder={`Slot ${index + 1} name`}
                      className="flex-1 h-8"
                    />
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={slot.enabled}
                        onCheckedChange={(checked) => updateAdSlot(position, slot.id, { enabled: checked })}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => removeAdSlot(position, slot.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                  <Textarea
                    value={slot.code}
                    onChange={(e) => updateAdSlot(position, slot.id, { code: e.target.value })}
                    placeholder="Paste your ad code here (HTML/JavaScript)..."
                    rows={4}
                    className="font-mono text-xs"
                  />
                </div>
              ))
            )}
          </CollapsibleContent>
        </div>
      </Collapsible>
    );
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
      {/* General Settings */}
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

      {/* Page-specific Settings Tabs */}
      <Tabs defaultValue="global" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="global">Global Ads</TabsTrigger>
          <TabsTrigger value="match">Match Page</TabsTrigger>
          <TabsTrigger value="tournament">Tournament Page</TabsTrigger>
        </TabsList>

        {/* Global Ads Tab */}
        <TabsContent value="global" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Global Ad Slots</CardTitle>
              <CardDescription>These ads appear across all pages (header, footer, sidebar)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {renderAdSlots('header', 'Header Ads')}
              {renderAdSlots('sidebar', 'Sidebar Ads')}
              {renderAdSlots('footer', 'Footer Ads')}
              {renderAdSlots('in_article', 'In-Article Ads')}
              {renderAdSlots('popup', 'Popup Ads')}
            </CardContent>
          </Card>

          {/* Legacy single ad codes (for backward compatibility) */}
          <Card>
            <CardHeader>
              <CardTitle>Legacy Ad Codes (Single)</CardTitle>
              <CardDescription>Fallback ad codes if no multiple slots are configured</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="header_ad_code">Header Ad Code</Label>
                <Textarea
                  id="header_ad_code"
                  value={form.header_ad_code}
                  onChange={(e) => setForm({ ...form, header_ad_code: e.target.value })}
                  placeholder="Paste your header ad code here..."
                  rows={3}
                  className="font-mono text-xs"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="sidebar_ad_code">Sidebar Ad Code</Label>
                <Textarea
                  id="sidebar_ad_code"
                  value={form.sidebar_ad_code}
                  onChange={(e) => setForm({ ...form, sidebar_ad_code: e.target.value })}
                  placeholder="Paste your sidebar ad code here..."
                  rows={3}
                  className="font-mono text-xs"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="footer_ad_code">Footer Ad Code</Label>
                <Textarea
                  id="footer_ad_code"
                  value={form.footer_ad_code}
                  onChange={(e) => setForm({ ...form, footer_ad_code: e.target.value })}
                  placeholder="Paste your footer ad code here..."
                  rows={3}
                  className="font-mono text-xs"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="in_article_ad_code">In-Article Ad Code</Label>
                <Textarea
                  id="in_article_ad_code"
                  value={form.in_article_ad_code}
                  onChange={(e) => setForm({ ...form, in_article_ad_code: e.target.value })}
                  placeholder="Paste your in-article ad code here..."
                  rows={3}
                  className="font-mono text-xs"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="popup_ad_code">Popup Ad Code</Label>
                <Textarea
                  id="popup_ad_code"
                  value={form.popup_ad_code}
                  onChange={(e) => setForm({ ...form, popup_ad_code: e.target.value })}
                  placeholder="Paste your popup ad code here..."
                  rows={3}
                  className="font-mono text-xs"
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Match Page Tab */}
        <TabsContent value="match" className="space-y-4">
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
                    onCheckedChange={(checked) => updateMatchAdPosition('before_player', !!checked)}
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
                    onCheckedChange={(checked) => updateMatchAdPosition('after_player', !!checked)}
                  />
                  <div>
                    <Label htmlFor="after_player" className="cursor-pointer">After Player</Label>
                    <p className="text-sm text-muted-foreground">Display ad below the video player</p>
                  </div>
                </div>
                
                <div className="flex items-center space-x-3">
                  <Checkbox
                    id="match_sidebar"
                    checked={form.match_page_ad_positions.sidebar}
                    onCheckedChange={(checked) => updateMatchAdPosition('sidebar', !!checked)}
                  />
                  <div>
                    <Label htmlFor="match_sidebar" className="cursor-pointer">Sidebar</Label>
                    <p className="text-sm text-muted-foreground">Display ad in the sidebar (desktop)</p>
                  </div>
                </div>
                
                <div className="flex items-center space-x-3">
                  <Checkbox
                    id="below_info"
                    checked={form.match_page_ad_positions.below_info}
                    onCheckedChange={(checked) => updateMatchAdPosition('below_info', !!checked)}
                  />
                  <div>
                    <Label htmlFor="below_info" className="cursor-pointer">Below Match Info</Label>
                    <p className="text-sm text-muted-foreground">Display ad after match information section</p>
                  </div>
                </div>
                
                <div className="flex items-center space-x-3">
                  <Checkbox
                    id="after_servers"
                    checked={form.match_page_ad_positions.after_servers}
                    onCheckedChange={(checked) => updateMatchAdPosition('after_servers', !!checked)}
                  />
                  <div>
                    <Label htmlFor="after_servers" className="cursor-pointer">After Servers</Label>
                    <p className="text-sm text-muted-foreground">Display ad after server selection buttons</p>
                  </div>
                </div>
                
                <div className="flex items-center space-x-3">
                  <Checkbox
                    id="after_score"
                    checked={form.match_page_ad_positions.after_score}
                    onCheckedChange={(checked) => updateMatchAdPosition('after_score', !!checked)}
                  />
                  <div>
                    <Label htmlFor="after_score" className="cursor-pointer">After Live Score</Label>
                    <p className="text-sm text-muted-foreground">Display ad after live score section</p>
                  </div>
                </div>
                
                <div className="flex items-center space-x-3">
                  <Checkbox
                    id="before_scoreboard"
                    checked={form.match_page_ad_positions.before_scoreboard}
                    onCheckedChange={(checked) => updateMatchAdPosition('before_scoreboard', !!checked)}
                  />
                  <div>
                    <Label htmlFor="before_scoreboard" className="cursor-pointer">Before Scoreboard</Label>
                    <p className="text-sm text-muted-foreground">Display ad before full scoreboard</p>
                  </div>
                </div>
                
                <div className="flex items-center space-x-3">
                  <Checkbox
                    id="after_scoreboard"
                    checked={form.match_page_ad_positions.after_scoreboard}
                    onCheckedChange={(checked) => updateMatchAdPosition('after_scoreboard', !!checked)}
                  />
                  <div>
                    <Label htmlFor="after_scoreboard" className="cursor-pointer">After Scoreboard</Label>
                    <p className="text-sm text-muted-foreground">Display ad after full scoreboard</p>
                  </div>
                </div>
                
                <div className="flex items-center space-x-3">
                  <Checkbox
                    id="before_playingxi"
                    checked={form.match_page_ad_positions.before_playingxi}
                    onCheckedChange={(checked) => updateMatchAdPosition('before_playingxi', !!checked)}
                  />
                  <div>
                    <Label htmlFor="before_playingxi" className="cursor-pointer">Before Playing XI</Label>
                    <p className="text-sm text-muted-foreground">Display ad before playing XI section</p>
                  </div>
                </div>
                
                <div className="flex items-center space-x-3">
                  <Checkbox
                    id="after_playingxi"
                    checked={form.match_page_ad_positions.after_playingxi}
                    onCheckedChange={(checked) => updateMatchAdPosition('after_playingxi', !!checked)}
                  />
                  <div>
                    <Label htmlFor="after_playingxi" className="cursor-pointer">After Playing XI</Label>
                    <p className="text-sm text-muted-foreground">Display ad after playing XI section</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Match Page Ad Codes</CardTitle>
              <CardDescription>Configure multiple ad codes for each match page position</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {renderAdSlots('match_before_player', 'Before Player Ads')}
              {renderAdSlots('match_after_player', 'After Player Ads')}
              {renderAdSlots('match_sidebar', 'Sidebar Ads (Match)')}
              {renderAdSlots('match_below_info', 'Below Match Info Ads')}
              {renderAdSlots('match_after_servers', 'After Servers Ads')}
              {renderAdSlots('match_after_score', 'After Live Score Ads')}
              {renderAdSlots('match_before_scoreboard', 'Before Scoreboard Ads')}
              {renderAdSlots('match_after_scoreboard', 'After Scoreboard Ads')}
              {renderAdSlots('match_before_playingxi', 'Before Playing XI Ads')}
              {renderAdSlots('match_after_playingxi', 'After Playing XI Ads')}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tournament Page Tab */}
        <TabsContent value="tournament" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Tournament Page Ad Positions</CardTitle>
              <CardDescription>Select where ads should appear on tournament pages</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4">
                <div className="flex items-center space-x-3">
                  <Checkbox
                    id="before_matches"
                    checked={form.tournament_page_ad_positions.before_matches}
                    onCheckedChange={(checked) => updateTournamentAdPosition('before_matches', !!checked)}
                  />
                  <div>
                    <Label htmlFor="before_matches" className="cursor-pointer">Before Matches</Label>
                    <p className="text-sm text-muted-foreground">Display ad above the match list</p>
                  </div>
                </div>
                
                <div className="flex items-center space-x-3">
                  <Checkbox
                    id="after_matches"
                    checked={form.tournament_page_ad_positions.after_matches}
                    onCheckedChange={(checked) => updateTournamentAdPosition('after_matches', !!checked)}
                  />
                  <div>
                    <Label htmlFor="after_matches" className="cursor-pointer">After Matches</Label>
                    <p className="text-sm text-muted-foreground">Display ad below the match list</p>
                  </div>
                </div>
                
                <div className="flex items-center space-x-3">
                  <Checkbox
                    id="tournament_sidebar"
                    checked={form.tournament_page_ad_positions.sidebar}
                    onCheckedChange={(checked) => updateTournamentAdPosition('sidebar', !!checked)}
                  />
                  <div>
                    <Label htmlFor="tournament_sidebar" className="cursor-pointer">Sidebar</Label>
                    <p className="text-sm text-muted-foreground">Display ad in the sidebar (desktop)</p>
                  </div>
                </div>
                
                <div className="flex items-center space-x-3">
                  <Checkbox
                    id="before_points_table"
                    checked={form.tournament_page_ad_positions.before_points_table}
                    onCheckedChange={(checked) => updateTournamentAdPosition('before_points_table', !!checked)}
                  />
                  <div>
                    <Label htmlFor="before_points_table" className="cursor-pointer">Before Points Table</Label>
                    <p className="text-sm text-muted-foreground">Display ad above the points table</p>
                  </div>
                </div>
                
                <div className="flex items-center space-x-3">
                  <Checkbox
                    id="after_points_table"
                    checked={form.tournament_page_ad_positions.after_points_table}
                    onCheckedChange={(checked) => updateTournamentAdPosition('after_points_table', !!checked)}
                  />
                  <div>
                    <Label htmlFor="after_points_table" className="cursor-pointer">After Points Table</Label>
                    <p className="text-sm text-muted-foreground">Display ad below the points table</p>
                  </div>
                </div>
                
                <div className="flex items-center space-x-3">
                  <Checkbox
                    id="before_teams"
                    checked={form.tournament_page_ad_positions.before_teams}
                    onCheckedChange={(checked) => updateTournamentAdPosition('before_teams', !!checked)}
                  />
                  <div>
                    <Label htmlFor="before_teams" className="cursor-pointer">Before Teams</Label>
                    <p className="text-sm text-muted-foreground">Display ad before participating teams</p>
                  </div>
                </div>
                
                <div className="flex items-center space-x-3">
                  <Checkbox
                    id="after_teams"
                    checked={form.tournament_page_ad_positions.after_teams}
                    onCheckedChange={(checked) => updateTournamentAdPosition('after_teams', !!checked)}
                  />
                  <div>
                    <Label htmlFor="after_teams" className="cursor-pointer">After Teams</Label>
                    <p className="text-sm text-muted-foreground">Display ad after participating teams</p>
                  </div>
                </div>
                
                <div className="flex items-center space-x-3">
                  <Checkbox
                    id="before_about"
                    checked={form.tournament_page_ad_positions.before_about}
                    onCheckedChange={(checked) => updateTournamentAdPosition('before_about', !!checked)}
                  />
                  <div>
                    <Label htmlFor="before_about" className="cursor-pointer">Before About</Label>
                    <p className="text-sm text-muted-foreground">Display ad before about tournament</p>
                  </div>
                </div>
                
                <div className="flex items-center space-x-3">
                  <Checkbox
                    id="after_about"
                    checked={form.tournament_page_ad_positions.after_about}
                    onCheckedChange={(checked) => updateTournamentAdPosition('after_about', !!checked)}
                  />
                  <div>
                    <Label htmlFor="after_about" className="cursor-pointer">After About</Label>
                    <p className="text-sm text-muted-foreground">Display ad after about tournament</p>
                  </div>
                </div>
                
                <div className="flex items-center space-x-3">
                  <Checkbox
                    id="between_sections"
                    checked={form.tournament_page_ad_positions.between_sections}
                    onCheckedChange={(checked) => updateTournamentAdPosition('between_sections', !!checked)}
                  />
                  <div>
                    <Label htmlFor="between_sections" className="cursor-pointer">Between Sections</Label>
                    <p className="text-sm text-muted-foreground">Display ads between major sections</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Tournament Page Ad Codes</CardTitle>
              <CardDescription>Configure multiple ad codes for each tournament page position</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {renderAdSlots('tournament_before_matches', 'Before Matches Ads')}
              {renderAdSlots('tournament_after_matches', 'After Matches Ads')}
              {renderAdSlots('tournament_sidebar', 'Sidebar Ads (Tournament)')}
              {renderAdSlots('tournament_before_points', 'Before Points Table Ads')}
              {renderAdSlots('tournament_after_points', 'After Points Table Ads')}
              {renderAdSlots('tournament_before_teams', 'Before Teams Ads')}
              {renderAdSlots('tournament_after_teams', 'After Teams Ads')}
              {renderAdSlots('tournament_before_about', 'Before About Ads')}
              {renderAdSlots('tournament_after_about', 'After About Ads')}
              {renderAdSlots('tournament_between_sections', 'Between Sections Ads')}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Ads.txt */}
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
