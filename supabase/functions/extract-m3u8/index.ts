import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Patterns to find M3U8 URLs in HTML/JS
const m3u8Patterns = [
  // Direct .m3u8 URLs
  /["'](https?:\/\/[^"'\s]+\.m3u8[^"'\s]*)["']/gi,
  // HLS source patterns
  /source\s*:\s*["'](https?:\/\/[^"'\s]+\.m3u8[^"'\s]*)["']/gi,
  /src\s*[=:]\s*["'](https?:\/\/[^"'\s]+\.m3u8[^"'\s]*)["']/gi,
  /file\s*:\s*["'](https?:\/\/[^"'\s]+\.m3u8[^"'\s]*)["']/gi,
  /url\s*:\s*["'](https?:\/\/[^"'\s]+\.m3u8[^"'\s]*)["']/gi,
  // Player configurations
  /hlsUrl\s*[=:]\s*["'](https?:\/\/[^"'\s]+)["']/gi,
  /streamUrl\s*[=:]\s*["'](https?:\/\/[^"'\s]+)["']/gi,
  /videoUrl\s*[=:]\s*["'](https?:\/\/[^"'\s]+)["']/gi,
  /playbackUrl\s*[=:]\s*["'](https?:\/\/[^"'\s]+)["']/gi,
  // atob/base64 encoded URLs (common obfuscation)
  /atob\s*\(\s*["']([A-Za-z0-9+/=]+)["']\s*\)/gi,
];

// Validate URL
function isValidUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

// Try to decode base64 and check if it's a URL
function tryDecodeBase64(encoded: string): string | null {
  try {
    const decoded = atob(encoded);
    if (isValidUrl(decoded) && (decoded.includes('.m3u8') || decoded.includes('/hls/') || decoded.includes('/live/'))) {
      return decoded;
    }
  } catch {}
  return null;
}

// Extract all potential stream URLs from content
function extractStreamUrls(content: string): string[] {
  const urls = new Set<string>();
  
  for (const pattern of m3u8Patterns) {
    let match;
    pattern.lastIndex = 0; // Reset regex
    while ((match = pattern.exec(content)) !== null) {
      const url = match[1];
      
      // Check if it's base64 (for atob pattern)
      if (pattern.source.includes('atob')) {
        const decoded = tryDecodeBase64(url);
        if (decoded) {
          urls.add(decoded);
        }
      } else if (isValidUrl(url)) {
        urls.add(url);
      }
    }
  }
  
  // Filter to prioritize .m3u8 URLs
  const m3u8Urls = Array.from(urls).filter(url => url.includes('.m3u8'));
  const otherUrls = Array.from(urls).filter(url => !url.includes('.m3u8') && 
    (url.includes('/hls/') || url.includes('/live/') || url.includes('/stream/')));
  
  return [...m3u8Urls, ...otherUrls];
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const targetUrl = url.searchParams.get('url');
    const referer = url.searchParams.get('referer');
    const origin = url.searchParams.get('origin');
    const userAgent = url.searchParams.get('userAgent');
    const cookie = url.searchParams.get('cookie');

    if (!targetUrl) {
      return new Response(
        JSON.stringify({ error: 'Missing url parameter' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!isValidUrl(targetUrl)) {
      return new Response(
        JSON.stringify({ error: 'Invalid URL' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Extracting M3U8 from: ${targetUrl}`);

    // Build headers for the request
    const headers: HeadersInit = {
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
    };

    if (referer) headers['Referer'] = referer;
    if (origin) headers['Origin'] = origin;
    if (userAgent) {
      headers['User-Agent'] = userAgent;
    } else {
      headers['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    }
    if (cookie) headers['Cookie'] = cookie;

    // Fetch the page
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(targetUrl, {
      headers,
      signal: controller.signal,
      redirect: 'follow',
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return new Response(
        JSON.stringify({ error: `Failed to fetch page: ${response.status}` }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const content = await response.text();
    console.log(`Fetched ${content.length} bytes`);

    // Extract stream URLs
    const streamUrls = extractStreamUrls(content);
    console.log(`Found ${streamUrls.length} potential stream URLs`);

    // Also check for embedded iframes that might contain the stream
    const iframeMatches = content.match(/<iframe[^>]+src=["']([^"']+)["'][^>]*>/gi) || [];
    const iframeSrcs = iframeMatches.map(match => {
      const srcMatch = match.match(/src=["']([^"']+)["']/i);
      return srcMatch ? srcMatch[1] : null;
    }).filter(Boolean) as string[];

    return new Response(
      JSON.stringify({
        success: true,
        streamUrls,
        iframeSrcs,
        sourceUrl: targetUrl,
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error: unknown) {
    console.error('Extract M3U8 error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
