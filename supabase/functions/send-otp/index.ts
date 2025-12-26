import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SendOTPRequest {
  email: string;
  userId: string;
}

const generateOTP = (): string => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { email, userId }: SendOTPRequest = await req.json();

    if (!email || !userId) {
      return new Response(
        JSON.stringify({ error: "Email and userId are required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Get SMTP settings from site_settings
    const { data: settings, error: settingsError } = await supabaseAdmin
      .from("site_settings")
      .select("smtp_host, smtp_port, smtp_user, smtp_password, smtp_from_email, smtp_from_name, smtp_enabled")
      .limit(1)
      .single();

    if (settingsError || !settings) {
      console.error("Failed to get SMTP settings:", settingsError);
      return new Response(
        JSON.stringify({ error: "SMTP not configured" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
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

    // Generate OTP
    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Delete any existing OTP for this user
    await supabaseAdmin
      .from("admin_otp_codes")
      .delete()
      .eq("user_id", userId);

    // Store OTP in database
    const { error: insertError } = await supabaseAdmin
      .from("admin_otp_codes")
      .insert({
        user_id: userId,
        otp_code: otp,
        expires_at: expiresAt.toISOString(),
        is_used: false,
      });

    if (insertError) {
      console.error("Failed to store OTP:", insertError);
      return new Response(
        JSON.stringify({ error: "Failed to generate OTP" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Send email using SMTP via Deno's built-in fetch to a mail service
    // For SMTP, we'll use a simple nodemailer-like approach via SMTPClient
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
      subject: "Your Login Verification Code",
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
              <h1 style="color: #fff; font-size: 24px; margin: 0 0 10px 0; font-weight: 600;">Verification Code</h1>
              <p style="color: #a0a0a0; font-size: 14px; margin: 0 0 30px 0;">Enter this code to complete your login</p>
              <div style="background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); border-radius: 12px; padding: 20px; margin-bottom: 25px;">
                <span style="font-size: 36px; font-weight: 700; letter-spacing: 8px; color: #f472b6; font-family: 'Courier New', monospace;">${otp}</span>
              </div>
              <p style="color: #888; font-size: 12px; margin: 0;">This code expires in 10 minutes.</p>
              <p style="color: #888; font-size: 12px; margin: 10px 0 0 0;">If you didn't request this, please ignore this email.</p>
            </div>
          </div>
        </body>
        </html>
      `,
    });

    await client.close();

    console.log("OTP sent successfully to:", email);

    return new Response(
      JSON.stringify({ success: true, message: "OTP sent successfully" }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error sending OTP:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Failed to send OTP" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
