import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface TestSMTPRequest {
  email: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { email }: TestSMTPRequest = await req.json();

    if (!email) {
      return new Response(
        JSON.stringify({ error: "Email is required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Get SMTP settings from site_settings
    const { data: settings, error: settingsError } = await supabaseAdmin
      .from("site_settings")
      .select("smtp_host, smtp_port, smtp_user, smtp_password, smtp_from_email, smtp_from_name, smtp_enabled")
      .limit(1)
      .maybeSingle();

    if (settingsError) {
      console.error("Failed to get SMTP settings:", settingsError);
      return new Response(
        JSON.stringify({ error: "Failed to get SMTP settings" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    if (!settings) {
      return new Response(
        JSON.stringify({ error: "SMTP settings not found. Please save settings first." }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    if (!settings.smtp_enabled) {
      return new Response(
        JSON.stringify({ error: "SMTP is disabled" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    if (!settings.smtp_host || !settings.smtp_user || !settings.smtp_password) {
      return new Response(
        JSON.stringify({ error: "SMTP settings incomplete" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Send test email using SMTP
    const { SMTPClient } = await import("https://deno.land/x/denomailer@1.6.0/mod.ts");

    const client = new SMTPClient({
      connection: {
        hostname: settings.smtp_host,
        port: settings.smtp_port || 587,
        tls: true,
        auth: {
          username: settings.smtp_user,
          password: settings.smtp_password,
        },
      },
    });

    const fromName = settings.smtp_from_name || "Admin Panel";
    const fromEmail = settings.smtp_from_email || settings.smtp_user;

    await client.send({
      from: `${fromName} <${fromEmail}>`,
      to: email,
      subject: "SMTP Test - Configuration Successful",
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5; margin: 0; padding: 20px;">
          <div style="max-width: 400px; margin: 0 auto; background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); border-radius: 16px; overflow: hidden; box-shadow: 0 20px 40px rgba(0,0,0,0.3);">
            <div style="padding: 40px 30px; text-align: center;">
              <h1 style="color: #22c55e; font-size: 24px; margin: 0 0 10px 0; font-weight: 600;">✓ SMTP Test Successful</h1>
              <p style="color: #a0a0a0; font-size: 14px; margin: 0 0 20px 0;">Your email configuration is working correctly!</p>
              <p style="color: #888; font-size: 12px; margin: 0;">Sent at: ${new Date().toISOString()}</p>
            </div>
          </div>
        </body>
        </html>
      `,
    });

    await client.close();

    console.log("Test email sent successfully to:", email);

    return new Response(
      JSON.stringify({ success: true, message: "Test email sent successfully" }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error sending test email:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Failed to send test email" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
