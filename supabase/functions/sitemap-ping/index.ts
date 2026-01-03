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

interface ServiceAccountCredentials {
  client_email: string;
  private_key: string;
  project_id?: string;
}

// Create JWT for Google API authentication
async function createGoogleJWT(credentials: ServiceAccountCredentials): Promise<string> {
  const header = {
    alg: 'RS256',
    typ: 'JWT',
  };

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: credentials.client_email,
    scope: 'https://www.googleapis.com/auth/indexing',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };

  const encoder = new TextEncoder();
  const headerB64 = btoa(JSON.stringify(header)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const payloadB64 = btoa(JSON.stringify(payload)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  
  const signatureInput = `${headerB64}.${payloadB64}`;
  
  // Import the private key
  const pemContents = credentials.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\n/g, '');
  
  const binaryKey = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));
  
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    binaryKey,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    encoder.encode(signatureInput)
  );
  
  const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  
  return `${signatureInput}.${signatureB64}`;
}

// Get access token from Google
async function getGoogleAccessToken(credentials: ServiceAccountCredentials): Promise<string> {
  const jwt = await createGoogleJWT(credentials);
  
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get access token: ${error}`);
  }
  
  const data = await response.json();
  return data.access_token;
}

// Submit URL to Google Indexing API
async function submitToGoogleIndexing(url: string, accessToken: string, type: 'URL_UPDATED' | 'URL_DELETED' = 'URL_UPDATED'): Promise<{ success: boolean; status: number; error?: string }> {
  const response = await fetch('https://indexing.googleapis.com/v3/urlNotifications:publish', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      url: url,
      type: type,
    }),
  });
  
  if (!response.ok) {
    const error = await response.text();
    return { success: false, status: response.status, error };
  }
  
  return { success: true, status: response.status };
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
    let specificUrl: string | null = null;
    
    try {
      const body = await req.json();
      pingType = body.ping_type || 'manual';
      triggeredBy = body.triggered_by || null;
      specificUrl = body.url || null;
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
    
    // Use specific URL if provided, otherwise use sitemap URL
    const urlToSubmit = specificUrl || sitemapUrl;
    const encodedSitemapUrl = encodeURIComponent(sitemapUrl);

    const results: PingResult[] = [];

    // Google Indexing API
    const googleServiceAccount = Deno.env.get('GOOGLE_INDEXING_SERVICE_ACCOUNT');
    if (googleServiceAccount) {
      try {
        console.log('Submitting to Google Indexing API...');
        const credentials: ServiceAccountCredentials = JSON.parse(googleServiceAccount);
        const accessToken = await getGoogleAccessToken(credentials);
        
        // Submit the URL (sitemap or specific page)
        const googleResult = await submitToGoogleIndexing(urlToSubmit, accessToken);
        
        results.push({
          engine: 'Google',
          success: googleResult.success,
          status: googleResult.status,
          note: googleResult.success ? 'Indexing API accepted' : googleResult.error,
        });
        console.log(`Google Indexing API: ${googleResult.status} - ${googleResult.success ? 'Success' : googleResult.error}`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('Google Indexing API failed:', errorMessage);
        results.push({
          engine: 'Google',
          success: false,
          error: errorMessage,
        });
      }
    } else {
      console.log('Google Indexing API: No service account configured');
      results.push({
        engine: 'Google',
        success: false,
        note: 'Service account not configured. Add GOOGLE_INDEXING_SERVICE_ACCOUNT secret.',
      });
    }

    // Bing using IndexNow protocol
    try {
      console.log('Pinging Bing via IndexNow...');
      const bingResponse = await fetch(
        `https://www.bing.com/indexnow?url=${encodeURIComponent(urlToSubmit)}&key=sitemap`,
        { 
          method: 'GET',
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; SitemapPinger/1.0)'
          }
        }
      );
      
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

    // Yandex webmaster ping
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

    const successCount = results.filter(r => r.success).length;
    const totalCount = results.length;

    // Log ping to history table
    const { error: insertError } = await supabase
      .from('sitemap_ping_history')
      .insert({
        ping_type: pingType,
        triggered_by: triggeredBy,
        sitemap_url: urlToSubmit,
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
        sitemapUrl: urlToSubmit,
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
