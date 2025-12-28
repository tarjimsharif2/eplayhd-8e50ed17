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
  
  if (clientData.count >= 200) return false;
  clientData.count++;
  return true;
}

// Build proxy URL for a given URL
function buildProxyUrl(targetUrl: string, baseProxyUrl: string, referer?: string, origin?: string): string {
  const proxyUrl = new URL(baseProxyUrl);
  proxyUrl.searchParams.set('url', targetUrl);
  if (referer) proxyUrl.searchParams.set('referer', referer);
  if (origin) proxyUrl.searchParams.set('origin', origin);
  return proxyUrl.toString();
}

// Rewrite URLs in HTML to go through proxy
function rewriteHtmlUrls(html: string, baseUrl: URL, proxyBaseUrl: string, referer?: string, origin?: string): string {
  // Rewrite iframe src attributes
  html = html.replace(
    /(<iframe[^>]*\s+src\s*=\s*["'])([^"']+)(["'][^>]*>)/gi,
    (match, prefix, src, suffix) => {
      try {
        const absoluteUrl = new URL(src, baseUrl.href).href;
        const proxiedUrl = buildProxyUrl(absoluteUrl, proxyBaseUrl, referer, origin);
        return `${prefix}${proxiedUrl}${suffix}`;
      } catch {
        return match;
      }
    }
  );

  // Rewrite script src for external scripts (optional, for full proxy)
  // Skip this for now as it may break functionality

  return html;
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

    const reqUrl = new URL(req.url);
    let url: string | null = reqUrl.searchParams.get('url');
    
    // Get headers from query params
    const referer = reqUrl.searchParams.get('referer');
    const origin = reqUrl.searchParams.get('origin');
    const userAgent = reqUrl.searchParams.get('userAgent');
    const cookie = reqUrl.searchParams.get('cookie');
    const adBlock = reqUrl.searchParams.get('adBlock') === 'true';

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

    console.log('Iframe proxy fetching:', url, adBlock ? '(ad-block enabled)' : '');

    const requestHeaders: HeadersInit = {
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'User-Agent': userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    };

    if (referer) requestHeaders['Referer'] = referer;
    if (origin) requestHeaders['Origin'] = origin;
    if (cookie) requestHeaders['Cookie'] = cookie;

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
    
    // For HTML content, rewrite iframe URLs to go through proxy
    if (contentType.includes('text/html')) {
      let html = await response.text();
      const baseUrl = new URL(url);
      const baseHref = `${baseUrl.protocol}//${baseUrl.host}`;
      
      // Build the proxy base URL (same as current function)
      const proxyBaseUrl = `${reqUrl.protocol}//${reqUrl.host}${reqUrl.pathname}`;
      
      // Rewrite iframe URLs in the HTML to go through proxy
      html = rewriteHtmlUrls(html, baseUrl, proxyBaseUrl, referer || url, origin || undefined);
      
      // Inject base tag for relative URLs (scripts, css, images)
      if (!html.includes('<base')) {
        if (html.includes('<head>')) {
          html = html.replace('<head>', `<head><base href="${baseHref}/">`);
        } else if (html.includes('<head ')) {
          html = html.replace(/<head([^>]*)>/i, `<head$1><base href="${baseHref}/">`);
        } else if (html.includes('<html')) {
          html = html.replace(/<html([^>]*)>/i, `<html$1><head><base href="${baseHref}/"></head>`);
        }
      }
      
      // Inject ad-blocking CSS and scripts if enabled
      if (adBlock) {
        const adBlockStyles = `
          <style id="adblock-styles">
            /* Hide common ad containers */
            .ad, .ads, .advert, .advertisement, .ad-container, .ad-wrapper,
            [class*="ad-"], [class*="ads-"], [class*="advert"], [id*="ad-"], [id*="ads-"],
            .banner-ad, .top-ad, .bottom-ad, .sidebar-ad,
            .popup, .popunder, .overlay-ad, .interstitial,
            [class*="popup"], [class*="overlay"],
            iframe[src*="ads"], iframe[src*="doubleclick"], iframe[src*="googlesyndication"],
            iframe[src*="ad."], iframe[src*="adserver"],
            div[class*="sponsor"], div[id*="sponsor"],
            .sticky-ad, .fixed-ad, .floating-ad,
            [data-ad], [data-ad-unit], [data-advertisement],
            .close-button, .ad-close, [class*="close-btn"],
            /* Common popup and ad overlay selectors */
            .modal-backdrop, .modal-overlay,
            div[style*="z-index: 9999"], div[style*="z-index:9999"],
            div[style*="z-index: 99999"], div[style*="z-index:99999"],
            div[style*="position: fixed"][style*="z-index"],
            /* Hide specific ad networks */
            [class*="google-ad"], [class*="adsense"],
            [class*="taboola"], [class*="outbrain"],
            .vjs-ad-playing .vjs-ad-container { display: none !important; }
          </style>
          <script>
            (function() {
              // Block window.open for popups
              const originalOpen = window.open;
              window.open = function() { 
                console.log('Popup blocked by ad-block');
                return null; 
              };
              
              // Block common ad-related functions
              window.adsbygoogle = window.adsbygoogle || [];
              window.adsbygoogle.loaded = true;
              
              // Remove elements after load
              document.addEventListener('DOMContentLoaded', function() {
                const adSelectors = [
                  '.ad', '.ads', '.advert', '[class*="ad-"]', '[id*="ad-"]',
                  '.popup', '.overlay-ad', '[class*="popup"]', '.modal-backdrop'
                ];
                adSelectors.forEach(selector => {
                  document.querySelectorAll(selector).forEach(el => {
                    if (el.offsetWidth > 200 || el.offsetHeight > 200) {
                      el.style.display = 'none';
                    }
                  });
                });
              });
              
              // Observe and hide dynamically added ads
              const observer = new MutationObserver(function(mutations) {
                mutations.forEach(function(mutation) {
                  mutation.addedNodes.forEach(function(node) {
                    if (node.nodeType === 1) {
                      const className = (node.className || '').toString().toLowerCase();
                      const id = (node.id || '').toLowerCase();
                      if (className.includes('ad') || id.includes('ad') || 
                          className.includes('popup') || className.includes('overlay')) {
                        node.style.display = 'none';
                      }
                    }
                  });
                });
              });
              observer.observe(document.body || document.documentElement, { 
                childList: true, 
                subtree: true 
              });
            })();
          </script>
        `;
        
        // Inject ad-block code
        if (html.includes('</head>')) {
          html = html.replace('</head>', `${adBlockStyles}</head>`);
        } else if (html.includes('<body')) {
          html = html.replace(/<body([^>]*)>/i, `<head>${adBlockStyles}</head><body$1>`);
        }
        
        console.log('Ad-block styles injected');
      }
      
      console.log('Successfully proxied with iframe URL rewriting');
      
      return new Response(html, {
        headers: {
          ...corsHeaders,
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-cache',
          'X-Frame-Options': 'ALLOWALL',
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
