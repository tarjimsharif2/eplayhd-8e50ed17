import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// SSRF Protection: Validate URLs to prevent attacks on internal networks
function isValidExternalUrl(urlString: string): { valid: boolean; reason?: string } {
  try {
    const url = new URL(urlString);
    
    // Only allow http and https protocols
    if (!['http:', 'https:'].includes(url.protocol)) {
      return { valid: false, reason: 'Invalid protocol. Only HTTP and HTTPS are allowed.' };
    }

    const hostname = url.hostname.toLowerCase();

    // Block localhost and loopback addresses
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '::1' ||
      hostname === '0.0.0.0' ||
      hostname.endsWith('.localhost') ||
      hostname.endsWith('.local')
    ) {
      return { valid: false, reason: 'Localhost/loopback addresses are not allowed.' };
    }

    // Block cloud metadata endpoints (AWS, GCP, Azure, etc.)
    const metadataHosts = [
      '169.254.169.254',
      'metadata.google.internal',
      'metadata.google.com',
      '100.100.100.200', // Alibaba Cloud
      'instance-data',
    ];
    if (metadataHosts.some(h => hostname === h || hostname.endsWith('.' + h))) {
      return { valid: false, reason: 'Cloud metadata endpoints are not allowed.' };
    }

    // Block private IP ranges
    const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
    const ipv4Match = hostname.match(ipv4Regex);
    
    if (ipv4Match) {
      const [, a, b, c, d] = ipv4Match.map(Number);
      
      // 10.0.0.0/8 - Private network
      if (a === 10) {
        return { valid: false, reason: 'Private IP range (10.x.x.x) is not allowed.' };
      }
      
      // 172.16.0.0/12 - Private network
      if (a === 172 && b >= 16 && b <= 31) {
        return { valid: false, reason: 'Private IP range (172.16-31.x.x) is not allowed.' };
      }
      
      // 192.168.0.0/16 - Private network
      if (a === 192 && b === 168) {
        return { valid: false, reason: 'Private IP range (192.168.x.x) is not allowed.' };
      }
      
      // 127.0.0.0/8 - Loopback
      if (a === 127) {
        return { valid: false, reason: 'Loopback IP range (127.x.x.x) is not allowed.' };
      }
      
      // 0.0.0.0/8 - Current network
      if (a === 0) {
        return { valid: false, reason: 'Zero IP range (0.x.x.x) is not allowed.' };
      }
      
      // 169.254.0.0/16 - Link-local
      if (a === 169 && b === 254) {
        return { valid: false, reason: 'Link-local IP range (169.254.x.x) is not allowed.' };
      }
      
      // 224.0.0.0/4 - Multicast
      if (a >= 224 && a <= 239) {
        return { valid: false, reason: 'Multicast IP range is not allowed.' };
      }
      
      // 240.0.0.0/4 - Reserved
      if (a >= 240) {
        return { valid: false, reason: 'Reserved IP range is not allowed.' };
      }
    }

    // Block URLs with credentials embedded (user:pass@host pattern)
    if (url.username || url.password) {
      return { valid: false, reason: 'URLs with embedded credentials are not allowed.' };
    }

    // Block common internal service ports that shouldn't be accessed
    const blockedPorts = [22, 23, 25, 3306, 5432, 6379, 27017, 11211];
    const port = url.port ? parseInt(url.port) : (url.protocol === 'https:' ? 443 : 80);
    if (blockedPorts.includes(port)) {
      return { valid: false, reason: `Port ${port} is not allowed for security reasons.` };
    }

    return { valid: true };
  } catch {
    return { valid: false, reason: 'Invalid URL format.' };
  }
}

// Rate limiting map (simple in-memory rate limiting)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW_MS = 60000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 100; // 100 requests per minute per IP

function checkRateLimit(clientIp: string): boolean {
  const now = Date.now();
  const clientData = rateLimitMap.get(clientIp);
  
  if (!clientData || now > clientData.resetTime) {
    rateLimitMap.set(clientIp, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  
  if (clientData.count >= RATE_LIMIT_MAX_REQUESTS) {
    return false;
  }
  
  clientData.count++;
  return true;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get client IP for rate limiting
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0] || 
                     req.headers.get('cf-connecting-ip') || 
                     'unknown';
    
    // Check rate limit
    if (!checkRateLimit(clientIp)) {
      console.warn('Rate limit exceeded for IP:', clientIp);
      return new Response(JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

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

    // SSRF Protection: Validate URL before fetching
    const validation = isValidExternalUrl(url);
    if (!validation.valid) {
      console.error('URL validation failed:', url, '-', validation.reason);
      return new Response(JSON.stringify({ error: `Invalid URL: ${validation.reason}` }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Proxying request to:', url);
    console.log('Custom headers:', Object.keys(headers).length > 0 ? 'present' : 'none');

    // Build request headers
    const requestHeaders: HeadersInit = {
      'Accept': '*/*',
    };

    if (headers?.referer) {
      requestHeaders['Referer'] = headers.referer;
    }

    if (headers?.origin) {
      requestHeaders['Origin'] = headers.origin;
    }

    if (headers?.cookie) {
      requestHeaders['Cookie'] = headers.cookie;
    }

    if (headers?.userAgent) {
      requestHeaders['User-Agent'] = headers.userAgent;
    } else {
      // Default user agent
      requestHeaders['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    }

    // Fetch the stream with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

    const response = await fetch(url, {
      method: 'GET',
      headers: requestHeaders,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

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
            // Validate the rewritten URL as well
            const uriValidation = isValidExternalUrl(absoluteUri);
            if (!uriValidation.valid) {
              console.warn('Blocked invalid URI in M3U8:', absoluteUri);
              return match; // Keep original if invalid
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
        
        // Validate the rewritten URL
        const urlValidation = isValidExternalUrl(absoluteUrl);
        if (!urlValidation.valid) {
          console.warn('Blocked invalid URL in M3U8:', absoluteUrl);
          return line; // Keep original if invalid
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
    
    if (errorMessage.includes('aborted')) {
      console.error('Request timeout for stream-proxy');
      return new Response(JSON.stringify({ error: 'Request timeout' }), {
        status: 504,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    console.error('Error in stream-proxy function:', errorMessage);
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
