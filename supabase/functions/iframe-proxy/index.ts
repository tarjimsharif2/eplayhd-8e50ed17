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
    let customHeaders: Record<string, string> = {};
    
    const urlParams = new URL(req.url).searchParams;
    url = urlParams.get('url');
    
    // Get headers from query params
    const referer = urlParams.get('referer');
    const origin = urlParams.get('origin');
    const userAgent = urlParams.get('userAgent');
    const cookie = urlParams.get('cookie');
    
    if (referer) customHeaders.referer = referer;
    if (origin) customHeaders.origin = origin;
    if (userAgent) customHeaders.userAgent = userAgent;
    if (cookie) customHeaders.cookie = cookie;

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
    console.log('With headers:', JSON.stringify(customHeaders));

    const requestHeaders: HeadersInit = {
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'User-Agent': customHeaders.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    };

    if (customHeaders.referer) requestHeaders['Referer'] = customHeaders.referer;
    if (customHeaders.origin) requestHeaders['Origin'] = customHeaders.origin;
    if (customHeaders.cookie) requestHeaders['Cookie'] = customHeaders.cookie;

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
    
    // For HTML content, we need to rewrite relative URLs and inject referrer policy
    if (contentType.includes('text/html')) {
      let html = await response.text();
      const baseUrl = new URL(url);
      const baseHref = `${baseUrl.protocol}//${baseUrl.host}`;
      
      // Build the injected head content
      let headInjection = '';
      
      // Add base tag if not present
      if (!html.includes('<base')) {
        headInjection += `<base href="${baseHref}/">`;
      }
      
      // Add referrer meta tag to set document referrer for all requests
      if (customHeaders.referer) {
        headInjection += `<meta name="referrer" content="unsafe-url">`;
      }
      
      // Inject script to modify fetch/XHR requests with custom headers
      if (customHeaders.referer || customHeaders.origin) {
        const headersJson = JSON.stringify({
          referer: customHeaders.referer || '',
          origin: customHeaders.origin || '',
        });
        
        headInjection += `
<script>
(function() {
  const customHeaders = ${headersJson};
  
  // Store original referrer
  if (customHeaders.referer) {
    Object.defineProperty(document, 'referrer', {
      get: function() { return customHeaders.referer; }
    });
  }
  
  // Override fetch to add headers
  const originalFetch = window.fetch;
  window.fetch = function(url, options = {}) {
    options.headers = options.headers || {};
    if (customHeaders.referer && !options.headers['Referer']) {
      options.headers['Referer'] = customHeaders.referer;
    }
    if (customHeaders.origin && !options.headers['Origin']) {
      options.headers['Origin'] = customHeaders.origin;
    }
    // Set referrerPolicy to allow sending referer
    options.referrerPolicy = 'unsafe-url';
    options.referrer = customHeaders.referer || document.location.href;
    return originalFetch.call(this, url, options);
  };
  
  // Override XMLHttpRequest to add headers
  const originalXHROpen = XMLHttpRequest.prototype.open;
  const originalXHRSend = XMLHttpRequest.prototype.send;
  
  XMLHttpRequest.prototype.open = function(method, url, ...args) {
    this._customUrl = url;
    return originalXHROpen.apply(this, [method, url, ...args]);
  };
  
  XMLHttpRequest.prototype.send = function(body) {
    if (customHeaders.referer) {
      try { this.setRequestHeader('Referer', customHeaders.referer); } catch(e) {}
    }
    if (customHeaders.origin) {
      try { this.setRequestHeader('Origin', customHeaders.origin); } catch(e) {}
    }
    return originalXHRSend.call(this, body);
  };
})();
</script>`;
      }
      
      // Inject into head
      if (headInjection) {
        if (html.includes('<head>')) {
          html = html.replace('<head>', '<head>' + headInjection);
        } else if (html.includes('<head ')) {
          html = html.replace(/<head([^>]*)>/i, '<head$1>' + headInjection);
        } else if (html.includes('<html')) {
          html = html.replace(/<html([^>]*)>/i, '<html$1><head>' + headInjection + '</head>');
        } else {
          html = headInjection + html;
        }
      }
      
      console.log('Successfully proxied iframe content with header injection');
      
      return new Response(html, {
        headers: {
          ...corsHeaders,
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-cache',
          'Referrer-Policy': 'unsafe-url',
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
