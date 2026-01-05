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

// Verify admin authentication
async function verifyAdminAuth(req: Request): Promise<{ authorized: boolean; error?: string; userId?: string }> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return { authorized: false, error: 'Missing authorization header' };
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  
  const token = authHeader.replace('Bearer ', '');
  const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey);
  
  const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token);
  
  if (authError || !user) {
    return { authorized: false, error: 'Invalid or expired token' };
  }

  // Check if user is admin using service role client
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const { data: roles } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .eq('role', 'admin')
    .single();

  if (!roles) {
    return { authorized: false, error: 'Admin access required' };
  }

  return { authorized: true, userId: user.id };
}

// Create JWT for Google API authentication
async function createGoogleJWT(credentials: ServiceAccountCredentials): Promise<string> {
  const header = { alg: 'RS256', typ: 'JWT' };
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

async function submitToGoogleIndexing(url: string, accessToken: string, type: 'URL_UPDATED' | 'URL_DELETED' = 'URL_UPDATED'): Promise<{ success: boolean; status: number; error?: string }> {
  const response = await fetch('https://indexing.googleapis.com/v3/urlNotifications:publish', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ url, type }),
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
    // Verify admin authentication
    const authResult = await verifyAdminAuth(req);
    if (!authResult.authorized) {
      console.log(`[sitemap-ping] Auth failed: ${authResult.error}`);
      return new Response(
        JSON.stringify({ success: false, error: authResult.error }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    let pingType = 'manual';
    let triggeredBy: string | null = authResult.userId || null;
    let specificUrl: string | null = null;
    
    try {
      const body = await req.json();
      pingType = body.ping_type || 'manual';
      specificUrl = body.url || null;
    } catch {
      // No body or invalid JSON, use defaults
    }

    console.log(`Pinging search engines (type: ${pingType}, triggered_by: ${triggeredBy})...`);

    const { data: siteSettings } = await supabase
      .from('site_settings_public')
      .select('canonical_url')
      .single();

    const projectId = 'doqteforumjdugifxryl';
    const baseUrl = siteSettings?.canonical_url?.replace(/\/$/, '') || `https://${projectId}.supabase.co/functions/v1`;
    const sitemapUrl = siteSettings?.canonical_url 
      ? `${baseUrl}/sitemap.xml`
      : `${baseUrl}/sitemap`;
    
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
        const googleResult = await submitToGoogleIndexing(urlToSubmit, accessToken);
        
        results.push({
          engine: 'Google',
          success: googleResult.success,
          status: googleResult.status,
          note: googleResult.success ? 'Indexing API accepted' : googleResult.error,
        });
        console.log(`Google Indexing API: ${googleResult.status}`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('Google Indexing API failed:', errorMessage);
        results.push({ engine: 'Google', success: false, error: errorMessage });
      }
    } else {
      results.push({
        engine: 'Google',
        success: false,
        note: 'Service account not configured',
      });
    }

    // Bing via IndexNow
    try {
      const bingResponse = await fetch(
        `https://www.bing.com/indexnow?url=${encodeURIComponent(urlToSubmit)}&key=sitemap`,
        { method: 'GET', headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SitemapPinger/1.0)' } }
      );
      
      const isSuccess = bingResponse.status === 200 || bingResponse.status === 202;
      results.push({
        engine: 'Bing',
        success: isSuccess,
        status: bingResponse.status,
        note: isSuccess ? 'IndexNow accepted' : undefined,
      });
    } catch (error) {
      results.push({ engine: 'Bing', success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }

    // Yandex
    try {
      const yandexResponse = await fetch(
        `https://webmaster.yandex.com/ping?sitemap=${encodedSitemapUrl}`,
        { method: 'GET', headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SitemapPinger/1.0)' } }
      );
      results.push({ engine: 'Yandex', success: yandexResponse.ok, status: yandexResponse.status });
    } catch (error) {
      results.push({ engine: 'Yandex', success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }

    const successCount = results.filter(r => r.success).length;

    await supabase
      .from('sitemap_ping_history')
      .insert({
        ping_type: pingType,
        triggered_by: triggeredBy,
        sitemap_url: urlToSubmit,
        results,
        success_count: successCount,
        total_count: results.length,
      });

    return new Response(
      JSON.stringify({
        success: true,
        sitemapUrl: urlToSubmit,
        results,
        summary: `${successCount}/${results.length} search engines notified successfully`,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error pinging search engines:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
