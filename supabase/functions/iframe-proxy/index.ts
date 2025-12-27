import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// SSRF Protection: Validate URLs
function isValidExternalUrl(urlString: string): { valid: boolean; reason?: string } {
  try {
    const url = new URL(urlString);
    
    if (!['http:', 'https:'].includes(url.protocol)) {
      return { valid: false, reason: 'Invalid protocol' };
    }

    const hostname = url.hostname.toLowerCase();

    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '0.0.0.0') {
      return { valid: false, reason: 'Localhost not allowed' };
    }

    // Block private IPs
    const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
    const ipv4Match = hostname.match(ipv4Regex);
    
    if (ipv4Match) {
      const [, a, b] = ipv4Match.map(Number);
      if (a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a === 127) {
        return { valid: false, reason: 'Private IP not allowed' };
      }
    }

    if (url.username || url.password) {
      return { valid: false, reason: 'Credentials not allowed' };
    }

    return { valid: true };
  } catch {
    return { valid: false, reason: 'Invalid URL format' };
  }
}

// Rate limiting
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

function checkRateLimit(clientIp: string): boolean {
  const now = Date.now();
  const clientData = rateLimitMap.get(clientIp);
  
  if (!clientData || now > clientData.resetTime) {
    rateLimitMap.set(clientIp, { count: 1, resetTime: now + 60000 });
    return true;
  }
  
  if (clientData.count >= 100) return false;
  clientData.count++;
  return true;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
    
    if (!checkRateLimit(clientIp)) {
      return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let url: string | null = null;
    let headers: Record<string, string> = {};
    
    const urlParams = new URL(req.url).searchParams;
    url = urlParams.get('url');
    
    // Get headers from query params
    const referer = urlParams.get('referer');
    const origin = urlParams.get('origin');
    const userAgent = urlParams.get('userAgent');
    const cookie = urlParams.get('cookie');
    
    if (referer) headers.referer = referer;
    if (origin) headers.origin = origin;
    if (userAgent) headers.userAgent = userAgent;
    if (cookie) headers.cookie = cookie;

    if (!url) {
      return new Response(JSON.stringify({ error: 'URL is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const validation = isValidExternalUrl(url);
    if (!validation.valid) {
      return new Response(JSON.stringify({ error: `Invalid URL: ${validation.reason}` }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Iframe proxy fetching:', url);
    console.log('With headers:', JSON.stringify(headers));

    const requestHeaders: HeadersInit = {
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'User-Agent': headers.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    };

    if (headers.referer) requestHeaders['Referer'] = headers.referer;
    if (headers.origin) requestHeaders['Origin'] = headers.origin;
    if (headers.cookie) requestHeaders['Cookie'] = headers.cookie;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    const response = await fetch(url, {
      method: 'GET',
      headers: requestHeaders,
      signal: controller.signal,
      redirect: 'follow',
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.error('Upstream error:', response.status);
      return new Response(JSON.stringify({ error: `Upstream error: ${response.status}` }), {
        status: response.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const contentType = response.headers.get('content-type') || 'text/html';
    
    // For HTML content, we need to rewrite relative URLs
    if (contentType.includes('text/html')) {
      let html = await response.text();
      const baseUrl = new URL(url);
      const baseHref = `${baseUrl.protocol}//${baseUrl.host}`;
      
      // Inject a base tag to handle relative URLs
      if (!html.includes('<base')) {
        html = html.replace(/<head([^>]*)>/i, `<head$1><base href="${baseHref}/">`);
      }
      
      // Remove X-Frame-Options restrictions
      console.log('Successfully proxied iframe content');
      
      return new Response(html, {
        headers: {
          ...corsHeaders,
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-cache',
        },
      });
    }
    
    // For other content types, pass through
    const arrayBuffer = await response.arrayBuffer();
    return new Response(arrayBuffer, {
      headers: {
        ...corsHeaders,
        'Content-Type': contentType,
      },
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Iframe proxy error:', errorMessage);
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
