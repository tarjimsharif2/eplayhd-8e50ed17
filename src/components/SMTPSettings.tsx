import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Loader2, Mail, Send, Eye, EyeOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface SMTPSettingsProps {
  settings: {
    smtp_host: string;
    smtp_port: number;
    smtp_user: string;
    smtp_password: string;
    smtp_from_email: string;
    smtp_from_name: string;
    smtp_enabled: boolean;
  };
  onSettingsChange: (settings: Partial<SMTPSettingsProps["settings"]>) => void;
}

const SMTPSettings = ({ settings, onSettingsChange }: SMTPSettingsProps) => {
  const { toast } = useToast();
  const [showPassword, setShowPassword] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testEmail, setTestEmail] = useState("");

  const handleTestEmail = async () => {
    if (!testEmail) {
      toast({
        title: "Error",
        description: "Please enter a test email address",
        variant: "destructive",
      });
      return;
    }

    if (!settings.smtp_enabled || !settings.smtp_host || !settings.smtp_user || !settings.smtp_password) {
      toast({
        title: "Error",
        description: "Please configure and enable SMTP settings first",
        variant: "destructive",
      });
      return;
    }

    setIsTesting(true);
    try {
      const { error } = await supabase.functions.invoke("send-otp", {
        body: { 
          email: testEmail, 
          userId: "test-" + Date.now() 
        },
      });

      if (error) throw error;

      toast({
        title: "Test email sent!",
        description: `A test email was sent to ${testEmail}`,
      });
    } catch (error: any) {
      toast({
        title: "Failed to send test email",
        description: error.message || "Check your SMTP settings and try again",
        variant: "destructive",
      });
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="w-5 h-5" />
          SMTP Settings
        </CardTitle>
        <CardDescription>
          Configure email server for 2FA verification codes and password reset
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between rounded-lg border p-4 shadow-sm">
          <div className="space-y-0.5">
            <Label className="text-base font-medium">Enable SMTP</Label>
            <p className="text-sm text-muted-foreground">
              Enable email sending via custom SMTP server
            </p>
          </div>
          <Switch
            checked={settings.smtp_enabled}
            onCheckedChange={(checked) => onSettingsChange({ smtp_enabled: checked })}
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>SMTP Host</Label>
            <Input
              placeholder="smtp.gmail.com"
              value={settings.smtp_host}
              onChange={(e) => onSettingsChange({ smtp_host: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>SMTP Port</Label>
            <Input
              type="number"
              placeholder="587"
              value={settings.smtp_port || ""}
              onChange={(e) => onSettingsChange({ smtp_port: parseInt(e.target.value) || 587 })}
            />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>SMTP Username</Label>
            <Input
              placeholder="your-email@gmail.com"
              value={settings.smtp_user}
              onChange={(e) => onSettingsChange({ smtp_user: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>SMTP Password</Label>
            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                value={settings.smtp_password}
                onChange={(e) => onSettingsChange({ smtp_password: e.target.value })}
                className="pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0 h-full px-3"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              For Gmail, use an App Password
            </p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>From Email</Label>
            <Input
              type="email"
              placeholder="noreply@yourdomain.com"
              value={settings.smtp_from_email}
              onChange={(e) => onSettingsChange({ smtp_from_email: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>From Name</Label>
            <Input
              placeholder="Admin Panel"
              value={settings.smtp_from_name}
              onChange={(e) => onSettingsChange({ smtp_from_name: e.target.value })}
            />
          </div>
        </div>

        <div className="rounded-lg border p-4 space-y-4">
          <Label className="text-sm font-medium">Test SMTP Configuration</Label>
          <div className="flex gap-2">
            <Input
              type="email"
              placeholder="Enter test email address"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              className="flex-1"
            />
            <Button
              variant="outline"
              onClick={handleTestEmail}
              disabled={isTesting || !settings.smtp_enabled}
            >
              {isTesting ? (
                <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Sending...</>
              ) : (
                <><Send className="w-4 h-4 mr-2" /> Send Test</>
              )}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default SMTPSettings;
