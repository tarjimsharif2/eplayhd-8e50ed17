import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PingResult {
  engine: string;
  success: boolean;
  status?: number;
  error?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Parse request body for ping type and trigger info
    let pingType = 'manual';
    let triggeredBy: string | null = null;
    
    try {
      const body = await req.json();
      pingType = body.ping_type || 'manual';
      triggeredBy = body.triggered_by || null;
    } catch {
      // No body or invalid JSON, use defaults
    }

    console.log(`Pinging search engines (type: ${pingType}, triggered_by: ${triggeredBy})...`);

    // Get site settings for canonical URL
    const { data: siteSettings } = await supabase
      .from('site_settings_public')
      .select('canonical_url')
      .single();

    const projectId = 'doqteforumjdugifxryl';
    const sitemapUrl = siteSettings?.canonical_url 
      ? `${siteSettings.canonical_url.replace(/\/$/, '')}/sitemap.xml`
      : `https://${projectId}.supabase.co/functions/v1/sitemap`;

    const encodedSitemapUrl = encodeURIComponent(sitemapUrl);

    const results: PingResult[] = [];

    // Ping Google
    try {
      console.log('Pinging Google...');
      const googleResponse = await fetch(
        `https://www.google.com/ping?sitemap=${encodedSitemapUrl}`,
        { method: 'GET' }
      );
      results.push({
        engine: 'Google',
        success: googleResponse.ok,
        status: googleResponse.status,
      });
      console.log(`Google ping: ${googleResponse.status}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Google ping failed:', errorMessage);
      results.push({
        engine: 'Google',
        success: false,
        error: errorMessage,
      });
    }

    // Ping Bing
    try {
      console.log('Pinging Bing...');
      const bingResponse = await fetch(
        `https://www.bing.com/ping?sitemap=${encodedSitemapUrl}`,
        { method: 'GET' }
      );
      results.push({
        engine: 'Bing',
        success: bingResponse.ok,
        status: bingResponse.status,
      });
      console.log(`Bing ping: ${bingResponse.status}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Bing ping failed:', errorMessage);
      results.push({
        engine: 'Bing',
        success: false,
        error: errorMessage,
      });
    }

    // Ping Yandex
    try {
      console.log('Pinging Yandex...');
      const yandexResponse = await fetch(
        `https://webmaster.yandex.com/ping?sitemap=${encodedSitemapUrl}`,
        { method: 'GET' }
      );
      results.push({
        engine: 'Yandex',
        success: yandexResponse.ok,
        status: yandexResponse.status,
      });
      console.log(`Yandex ping: ${yandexResponse.status}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Yandex ping failed:', errorMessage);
      results.push({
        engine: 'Yandex',
        success: false,
        error: errorMessage,
      });
    }

    const successCount = results.filter(r => r.success).length;
    const totalCount = results.length;

    // Log ping to history table
    const { error: insertError } = await supabase
      .from('sitemap_ping_history')
      .insert({
        ping_type: pingType,
        triggered_by: triggeredBy,
        sitemap_url: sitemapUrl,
        results: results,
        success_count: successCount,
        total_count: totalCount,
      });

    if (insertError) {
      console.error('Error logging ping history:', insertError);
    } else {
      console.log('Ping history logged successfully');
    }

    console.log(`Ping complete: ${successCount}/${totalCount} successful`);

    return new Response(
      JSON.stringify({
        success: true,
        sitemapUrl,
        results,
        summary: `${successCount}/${totalCount} search engines pinged successfully`,
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  } catch (error) {
    console.error('Error pinging search engines:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
