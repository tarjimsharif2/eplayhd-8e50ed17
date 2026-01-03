import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SitemapUrl {
  loc: string;
  lastmod?: string;
  changefreq?: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
  priority?: number;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('Generating sitemap...');

    // Get site settings for canonical URL
    const { data: siteSettings } = await supabase
      .from('site_settings_public')
      .select('canonical_url')
      .single();

    const baseUrl = siteSettings?.canonical_url || 'https://example.com';
    const urls: SitemapUrl[] = [];

    // Add homepage
    urls.push({
      loc: baseUrl,
      changefreq: 'daily',
      priority: 1.0,
    });

    // Fetch active matches with slugs
    const { data: matches, error: matchesError } = await supabase
      .from('matches')
      .select('slug, updated_at, status, match_date')
      .eq('is_active', true)
      .not('slug', 'is', null)
      .order('match_date', { ascending: false });

    if (matchesError) {
      console.error('Error fetching matches:', matchesError);
    } else if (matches) {
      console.log(`Found ${matches.length} matches for sitemap`);
      for (const match of matches) {
        if (match.slug) {
          urls.push({
            loc: `${baseUrl}/match/${match.slug}`,
            lastmod: match.updated_at ? new Date(match.updated_at).toISOString().split('T')[0] : undefined,
            changefreq: match.status === 'live' ? 'always' : match.status === 'upcoming' ? 'daily' : 'weekly',
            priority: match.status === 'live' ? 0.9 : match.status === 'upcoming' ? 0.8 : 0.6,
          });
        }
      }
    }

    // Fetch active tournaments with slugs
    const { data: tournaments, error: tournamentsError } = await supabase
      .from('tournaments')
      .select('slug, updated_at, is_active')
      .eq('is_active', true)
      .not('slug', 'is', null);

    if (tournamentsError) {
      console.error('Error fetching tournaments:', tournamentsError);
    } else if (tournaments) {
      console.log(`Found ${tournaments.length} tournaments for sitemap`);
      for (const tournament of tournaments) {
        if (tournament.slug) {
          urls.push({
            loc: `${baseUrl}/tournament/${tournament.slug}`,
            lastmod: tournament.updated_at ? new Date(tournament.updated_at).toISOString().split('T')[0] : undefined,
            changefreq: 'daily',
            priority: 0.8,
          });
        }
      }
    }

    // Fetch active dynamic pages
    const { data: dynamicPages, error: pagesError } = await supabase
      .from('dynamic_pages')
      .select('slug, updated_at')
      .eq('is_active', true);

    if (pagesError) {
      console.error('Error fetching dynamic pages:', pagesError);
    } else if (dynamicPages) {
      console.log(`Found ${dynamicPages.length} dynamic pages for sitemap`);
      for (const page of dynamicPages) {
        urls.push({
          loc: `${baseUrl}/page/${page.slug}`,
          lastmod: page.updated_at ? new Date(page.updated_at).toISOString().split('T')[0] : undefined,
          changefreq: 'weekly',
          priority: 0.7,
        });
      }
    }

    // Generate XML
    const xml = generateSitemapXml(urls);
    
    console.log(`Sitemap generated with ${urls.length} URLs`);

    return new Response(xml, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/xml',
        'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
      },
    });
  } catch (error) {
    console.error('Error generating sitemap:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});

function generateSitemapXml(urls: SitemapUrl[]): string {
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

  for (const url of urls) {
    xml += '  <url>\n';
    xml += `    <loc>${escapeXml(url.loc)}</loc>\n`;
    
    if (url.lastmod) {
      xml += `    <lastmod>${url.lastmod}</lastmod>\n`;
    }
    
    if (url.changefreq) {
      xml += `    <changefreq>${url.changefreq}</changefreq>\n`;
    }
    
    if (url.priority !== undefined) {
      xml += `    <priority>${url.priority.toFixed(1)}</priority>\n`;
    }
    
    xml += '  </url>\n';
  }

  xml += '</urlset>';
  return xml;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
