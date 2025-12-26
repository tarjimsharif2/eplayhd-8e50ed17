import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface VerifyOTPRequest {
  userId: string;
  otp: string;
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

    const { userId, otp }: VerifyOTPRequest = await req.json();

    if (!userId || !otp) {
      return new Response(
        JSON.stringify({ error: "User ID and OTP are required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Get OTP record
    const { data: otpRecord, error: fetchError } = await supabaseAdmin
      .from("admin_otp_codes")
      .select("*")
      .eq("user_id", userId)
      .eq("otp_code", otp)
      .eq("is_used", false)
      .single();

    if (fetchError || !otpRecord) {
      return new Response(
        JSON.stringify({ error: "Invalid verification code" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Check if expired
    const expiresAt = new Date(otpRecord.expires_at);
    if (new Date() > expiresAt) {
      // Delete expired OTP
      await supabaseAdmin
        .from("admin_otp_codes")
        .delete()
        .eq("id", otpRecord.id);

      return new Response(
        JSON.stringify({ error: "Verification code has expired" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Mark OTP as used
    await supabaseAdmin
      .from("admin_otp_codes")
      .update({ is_used: true })
      .eq("id", otpRecord.id);

    // Clean up old OTPs for this user
    await supabaseAdmin
      .from("admin_otp_codes")
      .delete()
      .eq("user_id", userId);

    console.log("OTP verified successfully for user:", userId);

    return new Response(
      JSON.stringify({ success: true, verified: true }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error verifying OTP:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Failed to verify OTP" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
