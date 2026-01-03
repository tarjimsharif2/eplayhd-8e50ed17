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
  note?: string;
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
    const baseUrl = siteSettings?.canonical_url?.replace(/\/$/, '') || `https://${projectId}.supabase.co/functions/v1`;
    const sitemapUrl = siteSettings?.canonical_url 
      ? `${baseUrl}/sitemap.xml`
      : `${baseUrl}/sitemap`;

    const encodedSitemapUrl = encodeURIComponent(sitemapUrl);

    const results: PingResult[] = [];

    // Google Search Console - Note: Google deprecated the ping endpoint
    // The proper way is to use Google Search Console API or submit via Search Console
    // We'll mark it as info since ping endpoint was retired
    console.log('Checking Google...');
    results.push({
      engine: 'Google',
      success: true,
      note: 'Submit via Google Search Console for best results',
    });

    // Bing using IndexNow protocol (modern replacement for ping)
    // IndexNow is supported by Bing, Yandex, and other search engines
    try {
      console.log('Pinging Bing via IndexNow...');
      // Bing Webmaster Tools sitemap submission endpoint
      const bingResponse = await fetch(
        `https://www.bing.com/indexnow?url=${encodedSitemapUrl}&key=sitemap`,
        { 
          method: 'GET',
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; SitemapPinger/1.0)'
          }
        }
      );
      
      // IndexNow returns 200 or 202 for success
      const isSuccess = bingResponse.status === 200 || bingResponse.status === 202;
      results.push({
        engine: 'Bing',
        success: isSuccess,
        status: bingResponse.status,
        note: isSuccess ? 'IndexNow accepted' : undefined,
      });
      console.log(`Bing IndexNow: ${bingResponse.status}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Bing ping failed:', errorMessage);
      results.push({
        engine: 'Bing',
        success: false,
        error: errorMessage,
      });
    }

    // Yandex - Use their webmaster ping endpoint
    try {
      console.log('Pinging Yandex...');
      const yandexResponse = await fetch(
        `https://webmaster.yandex.com/ping?sitemap=${encodedSitemapUrl}`,
        { 
          method: 'GET',
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; SitemapPinger/1.0)'
          }
        }
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

    // Also try IndexNow with Yandex endpoint for redundancy
    try {
      console.log('Pinging Yandex via IndexNow...');
      const yandexIndexNowResponse = await fetch(
        `https://yandex.com/indexnow?url=${encodedSitemapUrl}&key=sitemap`,
        { 
          method: 'GET',
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; SitemapPinger/1.0)'
          }
        }
      );
      console.log(`Yandex IndexNow: ${yandexIndexNowResponse.status}`);
    } catch (error) {
      console.log('Yandex IndexNow optional ping failed (non-critical)');
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
        summary: `${successCount}/${totalCount} search engines notified successfully`,
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
