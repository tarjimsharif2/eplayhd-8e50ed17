import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Support both POST body and GET query parameter
    let url: string | null = null;
    let headers: any = {};
    
    const urlParams = new URL(req.url).searchParams;
    const queryUrl = urlParams.get('url');
    
    if (queryUrl) {
      // GET request with URL in query string (for segments)
      url = queryUrl;
    } else if (req.method === 'POST') {
      // POST request with URL in body (for initial playlist)
      const body = await req.json();
      url = body.url;
      headers = body.headers || {};
    }

    if (!url) {
      console.error('No URL provided');
      return new Response(JSON.stringify({ error: 'URL is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Proxying request to:', url);
    console.log('Custom headers:', headers);

    // Build request headers
    const requestHeaders: HeadersInit = {
      'Accept': '*/*',
    };

    if (headers?.referer) {
      requestHeaders['Referer'] = headers.referer;
      console.log('Setting Referer:', headers.referer);
    }

    if (headers?.origin) {
      requestHeaders['Origin'] = headers.origin;
      console.log('Setting Origin:', headers.origin);
    }

    if (headers?.cookie) {
      requestHeaders['Cookie'] = headers.cookie;
      console.log('Setting Cookie:', headers.cookie);
    }

    if (headers?.userAgent) {
      requestHeaders['User-Agent'] = headers.userAgent;
      console.log('Setting User-Agent:', headers.userAgent);
    } else {
      // Default user agent
      requestHeaders['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    }

    // Fetch the stream
    const response = await fetch(url, {
      method: 'GET',
      headers: requestHeaders,
    });

    if (!response.ok) {
      console.error('Upstream error:', response.status, response.statusText);
      return new Response(JSON.stringify({ 
        error: `Upstream error: ${response.status} ${response.statusText}` 
      }), {
        status: response.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    
    // For binary content (ts segments, etc.), return as-is
    const isM3u8 = url.endsWith('.m3u8') || contentType.includes('mpegurl') || contentType.includes('x-mpegURL');
    
    if (!isM3u8) {
      // Return binary content directly for segments
      const arrayBuffer = await response.arrayBuffer();
      console.log('Successfully fetched binary content, length:', arrayBuffer.byteLength);
      
      return new Response(arrayBuffer, {
        headers: {
          ...corsHeaders,
          'Content-Type': contentType,
          'Cache-Control': 'max-age=3600',
        },
      });
    }
    
    const content = await response.text();
    console.log('Successfully fetched M3U8 content, length:', content.length);

    // For M3U8 playlists, we need to rewrite URLs to go through the proxy
    let processedContent = content;
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const proxyBaseUrl = `${supabaseUrl}/functions/v1/stream-proxy`;
    
    if (url.endsWith('.m3u8') || contentType.includes('mpegurl') || contentType.includes('x-mpegURL')) {
      const baseUrl = url.substring(0, url.lastIndexOf('/') + 1);
      
      // Rewrite all URLs to go through the proxy
      processedContent = content.split('\n').map(line => {
        const trimmedLine = line.trim();
        
        // Skip empty lines and tags (but check for URI in tags)
        if (!trimmedLine) {
          return line;
        }
        
        // Handle #EXT-X-KEY and similar tags with URI attribute
        if (trimmedLine.startsWith('#') && trimmedLine.includes('URI="')) {
          return line.replace(/URI="([^"]+)"/g, (match, uri) => {
            let absoluteUri = uri;
            if (!uri.startsWith('http://') && !uri.startsWith('https://')) {
              absoluteUri = baseUrl + uri;
            }
            // Encode the URL for proxy
            const proxyUrl = `${proxyBaseUrl}?url=${encodeURIComponent(absoluteUri)}`;
            return `URI="${proxyUrl}"`;
          });
        }
        
        // Skip other comments/tags
        if (trimmedLine.startsWith('#')) {
          return line;
        }
        
        // Convert relative URL to absolute
        let absoluteUrl = trimmedLine;
        if (!trimmedLine.startsWith('http://') && !trimmedLine.startsWith('https://')) {
          absoluteUrl = baseUrl + trimmedLine;
        }
        
        // For .ts segments and other M3U8 files, route through proxy
        return `${proxyBaseUrl}?url=${encodeURIComponent(absoluteUrl)}`;
      }).join('\n');
    }

    return new Response(processedContent, {
      headers: {
        ...corsHeaders,
        'Content-Type': contentType,
        'Cache-Control': 'no-cache',
      },
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    console.error('Error in stream-proxy function:', errorMessage);
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});