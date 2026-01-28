import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { Loader2, Save, Eye, AlertTriangle, Clock, Settings2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import MaintenancePage from "@/pages/MaintenancePage";

export default function MaintenanceModeManager() {
  const { toast } = useToast();
  const { data: settings, refetch } = useSiteSettings();
  
  const [saving, setSaving] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  
  // Form state
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [maintenanceTitle, setMaintenanceTitle] = useState("We'll Be Right Back");
  const [maintenanceSubtitle, setMaintenanceSubtitle] = useState("Our site is currently undergoing scheduled maintenance.");
  const [maintenanceDescription, setMaintenanceDescription] = useState("We're working hard to improve your experience. Thank you for your patience.");
  const [maintenanceEstimatedTime, setMaintenanceEstimatedTime] = useState("");
  const [maintenanceShowCountdown, setMaintenanceShowCountdown] = useState(false);
  const [maintenanceEndTime, setMaintenanceEndTime] = useState("");
  const [maintenanceContactEmail, setMaintenanceContactEmail] = useState("");
  const [maintenanceSocialMessage, setMaintenanceSocialMessage] = useState("Follow us for updates");

  // Load settings
  useEffect(() => {
    if (settings) {
      setMaintenanceMode(settings.maintenance_mode ?? false);
      setMaintenanceTitle(settings.maintenance_title ?? "We'll Be Right Back");
      setMaintenanceSubtitle(settings.maintenance_subtitle ?? "Our site is currently undergoing scheduled maintenance.");
      setMaintenanceDescription(settings.maintenance_description ?? "We're working hard to improve your experience. Thank you for your patience.");
      setMaintenanceEstimatedTime(settings.maintenance_estimated_time ?? "");
      setMaintenanceShowCountdown(settings.maintenance_show_countdown ?? false);
      setMaintenanceEndTime(settings.maintenance_end_time ? new Date(settings.maintenance_end_time).toISOString().slice(0, 16) : "");
      setMaintenanceContactEmail(settings.maintenance_contact_email ?? "");
      setMaintenanceSocialMessage(settings.maintenance_social_message ?? "Follow us for updates");
    }
  }, [settings]);

  const handleSave = async () => {
    if (!settings?.id) return;
    
    setSaving(true);
    try {
      const { error } = await supabase
        .from('site_settings')
        .update({
          maintenance_mode: maintenanceMode,
          maintenance_title: maintenanceTitle,
          maintenance_subtitle: maintenanceSubtitle,
          maintenance_description: maintenanceDescription,
          maintenance_estimated_time: maintenanceEstimatedTime || null,
          maintenance_show_countdown: maintenanceShowCountdown,
          maintenance_end_time: maintenanceEndTime ? new Date(maintenanceEndTime).toISOString() : null,
          maintenance_contact_email: maintenanceContactEmail || null,
          maintenance_social_message: maintenanceSocialMessage,
        })
        .eq('id', settings.id);

      if (error) throw error;

      toast({
        title: "Settings saved",
        description: maintenanceMode 
          ? "Maintenance mode is now ACTIVE. Only admins can access the site." 
          : "Maintenance mode is disabled.",
      });
      
      refetch();
    } catch (error: any) {
      toast({
        title: "Error saving settings",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  // Quick toggle maintenance mode
  const toggleMaintenanceMode = async () => {
    if (!settings?.id) return;
    
    const newValue = !maintenanceMode;
    setMaintenanceMode(newValue);
    
    try {
      const { error } = await supabase
        .from('site_settings')
        .update({ maintenance_mode: newValue })
        .eq('id', settings.id);

      if (error) throw error;

      toast({
        title: newValue ? "Maintenance Mode Enabled" : "Maintenance Mode Disabled",
        description: newValue 
          ? "The site is now in maintenance mode. Only admins can access."
          : "The site is now accessible to everyone.",
        variant: newValue ? "default" : "default",
      });
      
      refetch();
    } catch (error: any) {
      setMaintenanceMode(!newValue); // Revert on error
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const previewSettings = {
    maintenance_title: maintenanceTitle,
    maintenance_subtitle: maintenanceSubtitle,
    maintenance_description: maintenanceDescription,
    maintenance_estimated_time: maintenanceEstimatedTime,
    maintenance_show_countdown: maintenanceShowCountdown,
    maintenance_end_time: maintenanceEndTime,
    maintenance_contact_email: maintenanceContactEmail,
    maintenance_social_message: maintenanceSocialMessage,
    logo_url: settings?.logo_url,
    site_name: settings?.site_name,
    twitter_handle: settings?.twitter_handle,
    facebook_app_id: settings?.facebook_app_id,
    telegram_link: settings?.telegram_link,
  };

  return (
    <div className="space-y-6">
      {/* Quick Toggle Card */}
      <Card className={maintenanceMode ? "border-destructive/50 bg-destructive/5" : ""}>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${maintenanceMode ? 'bg-destructive/20' : 'bg-muted'}`}>
                <Settings2 className={`h-5 w-5 ${maintenanceMode ? 'text-destructive' : 'text-muted-foreground'}`} />
              </div>
              <div>
                <CardTitle className="flex items-center gap-2">
                  Maintenance Mode
                  {maintenanceMode && (
                    <Badge variant="destructive" className="animate-pulse">
                      ACTIVE
                    </Badge>
                  )}
                </CardTitle>
                <CardDescription>
                  {maintenanceMode 
                    ? "Site is currently in maintenance mode. Only admins can access."
                    : "Enable to show a maintenance page to visitors."}
                </CardDescription>
              </div>
            </div>
            <Switch
              checked={maintenanceMode}
              onCheckedChange={toggleMaintenanceMode}
            />
          </div>
        </CardHeader>
        
        {maintenanceMode && (
          <CardContent className="pt-0">
            <div className="flex items-center gap-2 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4" />
              <span>Warning: Regular users cannot access the site while maintenance mode is active.</span>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Page Content Settings */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Maintenance Page Content</CardTitle>
              <CardDescription>Customize the text shown on the maintenance page</CardDescription>
            </div>
            <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <Eye className="h-4 w-4 mr-2" />
                  Preview
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-6xl h-[90vh] p-0 overflow-hidden">
                <DialogHeader className="sr-only">
                  <DialogTitle>Maintenance Page Preview</DialogTitle>
                </DialogHeader>
                <MaintenancePage settings={previewSettings} />
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Title & Subtitle */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={maintenanceTitle}
                onChange={(e) => setMaintenanceTitle(e.target.value)}
                placeholder="We'll Be Right Back"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="subtitle">Subtitle</Label>
              <Input
                id="subtitle"
                value={maintenanceSubtitle}
                onChange={(e) => setMaintenanceSubtitle(e.target.value)}
                placeholder="Our site is currently undergoing scheduled maintenance."
              />
            </div>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={maintenanceDescription}
              onChange={(e) => setMaintenanceDescription(e.target.value)}
              placeholder="We're working hard to improve your experience..."
              rows={3}
            />
          </div>

          <Separator />

          {/* Countdown Settings */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Show Countdown Timer</Label>
                <p className="text-sm text-muted-foreground">Display a countdown to the expected end time</p>
              </div>
              <Switch
                checked={maintenanceShowCountdown}
                onCheckedChange={setMaintenanceShowCountdown}
              />
            </div>

            {maintenanceShowCountdown && (
              <div className="space-y-2 pl-4 border-l-2 border-primary/20">
                <Label htmlFor="endTime" className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  End Time
                </Label>
                <Input
                  id="endTime"
                  type="datetime-local"
                  value={maintenanceEndTime}
                  onChange={(e) => setMaintenanceEndTime(e.target.value)}
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="estimatedTime">Estimated Time (Text)</Label>
              <Input
                id="estimatedTime"
                value={maintenanceEstimatedTime}
                onChange={(e) => setMaintenanceEstimatedTime(e.target.value)}
                placeholder="e.g., 2-3 hours, Tomorrow morning"
              />
              <p className="text-xs text-muted-foreground">Shown below the countdown or as standalone text</p>
            </div>
          </div>

          <Separator />

          {/* Contact & Social */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="contactEmail">Contact Email</Label>
              <Input
                id="contactEmail"
                type="email"
                value={maintenanceContactEmail}
                onChange={(e) => setMaintenanceContactEmail(e.target.value)}
                placeholder="support@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="socialMessage">Social Media Message</Label>
              <Input
                id="socialMessage"
                value={maintenanceSocialMessage}
                onChange={(e) => setMaintenanceSocialMessage(e.target.value)}
                placeholder="Follow us for updates"
              />
            </div>
          </div>

          {/* Save Button */}
          <div className="flex justify-end pt-4">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Save Changes
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
