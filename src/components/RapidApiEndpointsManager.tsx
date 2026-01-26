import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Save, RefreshCcw, Globe, Link2 } from 'lucide-react';

interface RapidApiEndpoints {
  // Hosts
  cricbuzz_host: string;
  cricketapi_live_host: string;
  // Endpoints
  points_table_endpoint: string;
  squad_endpoint: string;
  scorecard_endpoint: string;
  live_matches_endpoint: string;
  match_squad_endpoint: string;
  match_info_endpoint?: string;
  match_commentary_endpoint?: string;
  team_squad_endpoint?: string;
  // New endpoints for sync-playing-xi
  recent_matches_endpoint?: string;
  schedule_endpoint?: string;
  series_squads_endpoint?: string;
  series_squad_endpoint?: string;
}

interface Props {
  value: RapidApiEndpoints | null;
  onChange: (endpoints: RapidApiEndpoints) => void;
}

const defaultEndpoints: RapidApiEndpoints = {
  cricbuzz_host: 'cricbuzz-cricket.p.rapidapi.com',
  cricketapi_live_host: 'cricketapi-live.p.rapidapi.com',
  points_table_endpoint: '/stats/v1/series/{series_id}/points-table',
  squad_endpoint: '/mcenter/v1/{match_id}/hsquad',
  scorecard_endpoint: '/mcenter/v1/{match_id}/scard',
  live_matches_endpoint: '/matches/v1/live',
  match_squad_endpoint: '/match/{match_id}/squad',
  match_info_endpoint: '/mcenter/v1/{match_id}',
  match_commentary_endpoint: '/mcenter/v1/{match_id}/comm',
  team_squad_endpoint: '/mcenter/v1/{match_id}/team/{team_num}',
  recent_matches_endpoint: '/matches/v1/recent',
  schedule_endpoint: '/schedule/v1/all',
  series_squads_endpoint: '/series/v1/{series_id}/squads',
  series_squad_endpoint: '/series/v1/{series_id}/squads/{squad_id}',
};

export default function RapidApiEndpointsManager({ value, onChange }: Props) {
  const [endpoints, setEndpoints] = useState<RapidApiEndpoints>(defaultEndpoints);

  useEffect(() => {
    if (value) {
      setEndpoints({ ...defaultEndpoints, ...value });
    }
  }, [value]);

  const handleChange = (key: keyof RapidApiEndpoints, newValue: string) => {
    const updated = { ...endpoints, [key]: newValue };
    setEndpoints(updated);
    onChange(updated);
  };

  const resetToDefaults = () => {
    setEndpoints(defaultEndpoints);
    onChange(defaultEndpoints);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Globe className="w-5 h-5 text-primary" />
          <h3 className="font-semibold">API Endpoints Configuration</h3>
        </div>
        <Button variant="outline" size="sm" onClick={resetToDefaults}>
          <RefreshCcw className="w-4 h-4 mr-2" />
          Reset to Defaults
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        Configure RapidAPI host URLs and endpoint paths. Use placeholders like {'{series_id}'}, {'{match_id}'}, {'{team_num}'} for dynamic values.
      </p>

      <Accordion type="single" collapsible className="w-full">
        {/* API Hosts */}
        <AccordionItem value="hosts">
          <AccordionTrigger className="hover:no-underline">
            <div className="flex items-center gap-2">
              <Link2 className="w-4 h-4" />
              <span>API Hosts</span>
              <Badge variant="secondary" className="ml-2">2</Badge>
            </div>
          </AccordionTrigger>
          <AccordionContent className="space-y-4 pt-4">
            <div className="grid gap-4">
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  Cricbuzz RapidAPI Host
                  <Badge variant="outline" className="text-xs">Primary</Badge>
                </Label>
                <Input
                  value={endpoints.cricbuzz_host}
                  onChange={(e) => handleChange('cricbuzz_host', e.target.value)}
                  placeholder="cricbuzz-cricket.p.rapidapi.com"
                />
                <p className="text-xs text-muted-foreground">
                  Used for: Points Table, Squad, Match Info
                </p>
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  Cricket API Live Host
                  <Badge variant="outline" className="text-xs">Secondary</Badge>
                </Label>
                <Input
                  value={endpoints.cricketapi_live_host}
                  onChange={(e) => handleChange('cricketapi_live_host', e.target.value)}
                  placeholder="cricketapi-live.p.rapidapi.com"
                />
                <p className="text-xs text-muted-foreground">
                  Used for: Live Matches, Squad scraping
                </p>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Cricbuzz Endpoints */}
        <AccordionItem value="cricbuzz">
          <AccordionTrigger className="hover:no-underline">
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-green-500" />
              <span>Cricbuzz Endpoints</span>
              <Badge variant="secondary" className="ml-2">10</Badge>
            </div>
          </AccordionTrigger>
          <AccordionContent className="space-y-4 pt-4">
            <div className="grid gap-4">
              <div className="space-y-2">
                <Label>Points Table Endpoint</Label>
                <Input
                  value={endpoints.points_table_endpoint}
                  onChange={(e) => handleChange('points_table_endpoint', e.target.value)}
                  placeholder="/stats/v1/series/{series_id}/points-table"
                />
                <p className="text-xs text-muted-foreground">
                  Placeholder: {'{series_id}'} → Tournament's Cricbuzz Series ID
                </p>
              </div>

              <div className="space-y-2">
                <Label>Squad (hsquad) Endpoint</Label>
                <Input
                  value={endpoints.squad_endpoint}
                  onChange={(e) => handleChange('squad_endpoint', e.target.value)}
                  placeholder="/mcenter/v1/{match_id}/hsquad"
                />
                <p className="text-xs text-muted-foreground">
                  Placeholder: {'{match_id}'} → Cricbuzz Match ID
                </p>
              </div>

              <div className="space-y-2">
                <Label>Scorecard Endpoint</Label>
                <Input
                  value={endpoints.scorecard_endpoint}
                  onChange={(e) => handleChange('scorecard_endpoint', e.target.value)}
                  placeholder="/mcenter/v1/{match_id}/scard"
                />
              </div>

              <div className="space-y-2">
                <Label>Match Info Endpoint</Label>
                <Input
                  value={endpoints.match_info_endpoint || ''}
                  onChange={(e) => handleChange('match_info_endpoint', e.target.value)}
                  placeholder="/mcenter/v1/{match_id}"
                />
              </div>

              <div className="space-y-2">
                <Label>Match Commentary Endpoint</Label>
                <Input
                  value={endpoints.match_commentary_endpoint || ''}
                  onChange={(e) => handleChange('match_commentary_endpoint', e.target.value)}
                  placeholder="/mcenter/v1/{match_id}/comm"
                />
              </div>

              <div className="space-y-2">
                <Label>Team Squad Endpoint</Label>
                <Input
                  value={endpoints.team_squad_endpoint || ''}
                  onChange={(e) => handleChange('team_squad_endpoint', e.target.value)}
                  placeholder="/mcenter/v1/{match_id}/team/{team_num}"
                />
                <p className="text-xs text-muted-foreground">
                  Placeholders: {'{match_id}'}, {'{team_num}'} (1 or 2)
                </p>
              </div>

              <div className="space-y-2">
                <Label>Recent Matches Endpoint</Label>
                <Input
                  value={endpoints.recent_matches_endpoint || ''}
                  onChange={(e) => handleChange('recent_matches_endpoint', e.target.value)}
                  placeholder="/matches/v1/recent"
                />
                <p className="text-xs text-muted-foreground">
                  Returns recently completed and upcoming matches
                </p>
              </div>

              <div className="space-y-2">
                <Label>Schedule Endpoint</Label>
                <Input
                  value={endpoints.schedule_endpoint || ''}
                  onChange={(e) => handleChange('schedule_endpoint', e.target.value)}
                  placeholder="/schedule/v1/all"
                />
                <p className="text-xs text-muted-foreground">
                  Returns full match schedule
                </p>
              </div>

              <div className="space-y-2">
                <Label>Series Squads List Endpoint</Label>
                <Input
                  value={endpoints.series_squads_endpoint || ''}
                  onChange={(e) => handleChange('series_squads_endpoint', e.target.value)}
                  placeholder="/series/v1/{series_id}/squads"
                />
                <p className="text-xs text-muted-foreground">
                  Placeholder: {'{series_id}'} → Series ID
                </p>
              </div>

              <div className="space-y-2">
                <Label>Series Squad Detail Endpoint</Label>
                <Input
                  value={endpoints.series_squad_endpoint || ''}
                  onChange={(e) => handleChange('series_squad_endpoint', e.target.value)}
                  placeholder="/series/v1/{series_id}/squads/{squad_id}"
                />
                <p className="text-xs text-muted-foreground">
                  Placeholders: {'{series_id}'}, {'{squad_id}'}
                </p>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Cricket API Live Endpoints */}
        <AccordionItem value="cricketapi">
          <AccordionTrigger className="hover:no-underline">
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-blue-500" />
              <span>Cricket API Live Endpoints</span>
              <Badge variant="secondary" className="ml-2">2</Badge>
            </div>
          </AccordionTrigger>
          <AccordionContent className="space-y-4 pt-4">
            <div className="grid gap-4">
              <div className="space-y-2">
                <Label>Live Matches Endpoint</Label>
                <Input
                  value={endpoints.live_matches_endpoint}
                  onChange={(e) => handleChange('live_matches_endpoint', e.target.value)}
                  placeholder="/matches/live"
                />
                <p className="text-xs text-muted-foreground">
                  Returns list of currently live matches
                </p>
              </div>

              <div className="space-y-2">
                <Label>Match Squad Endpoint</Label>
                <Input
                  value={endpoints.match_squad_endpoint}
                  onChange={(e) => handleChange('match_squad_endpoint', e.target.value)}
                  placeholder="/match/{match_id}/squad"
                />
                <p className="text-xs text-muted-foreground">
                  Placeholder: {'{match_id}'} → API Match ID
                </p>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <div className="p-3 rounded-lg bg-muted/50 border border-border/50">
        <p className="text-xs text-muted-foreground">
          <strong>Note:</strong> Changes will take effect after saving settings. Edge functions will use these configured endpoints for API calls.
        </p>
      </div>
    </div>
  );
}
