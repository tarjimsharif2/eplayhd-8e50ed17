import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface FootballMatch {
  homeTeam: string;
  awayTeam: string;
  homeScore: string | null;
  awayScore: string | null;
  status: string;
  minute: string | null;
  competition: string | null;
  matchUrl: string | null;
}

// Extract text content from HTML, removing tags
function extractText(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

// Decode HTML entities
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

// Parse football scores from Footballdatabase.eu HTML
function parseFootballDatabaseScores(html: string): FootballMatch[] {
  const matches: FootballMatch[] = [];
  
  try {
    console.log('Parsing Footballdatabase.eu HTML...');
    
    // Pattern 1: Look for match rows in tables (common structure)
    const rowPatterns = [
      /<tr[^>]*>([\s\S]*?)<\/tr>/gi,
      /<div[^>]*class="[^"]*(?:match|game|fixture|result)[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
      /<li[^>]*class="[^"]*(?:match|game|fixture)[^"]*"[^>]*>([\s\S]*?)<\/li>/gi,
    ];

    const potentialMatches: string[] = [];
    for (const pattern of rowPatterns) {
      let match;
      pattern.lastIndex = 0;
      while ((match = pattern.exec(html)) !== null) {
        potentialMatches.push(match[1]);
      }
    }

    console.log(`Found ${potentialMatches.length} potential match containers`);

    for (const matchHtml of potentialMatches) {
      if (matchHtml.length < 50) continue;
      
      const linkPattern = /<a[^>]*href="([^"]*)"[^>]*>([^<]+)<\/a>/gi;
      const links: { href: string; text: string }[] = [];
      let linkMatch;
      while ((linkMatch = linkPattern.exec(matchHtml)) !== null) {
        const text = decodeHtmlEntities(extractText(linkMatch[2]));
        if (text.length > 2 && text.length < 50) {
          links.push({ href: linkMatch[1], text });
        }
      }
      
      const numbers = matchHtml.match(/>(\d+)</g)?.map(n => n.replace(/[><]/g, '')) || [];
      
      const teamLinks = links.filter(l => 
        l.href.includes('/club/') || 
        l.href.includes('/team/') || 
        l.href.includes('/en/club/') ||
        l.href.includes('/en/team/')
      );
      
      if (teamLinks.length >= 2) {
        const homeTeam = teamLinks[0].text;
        const awayTeam = teamLinks[1].text;
        
        let homeScore: string | null = null;
        let awayScore: string | null = null;
        
        const scorePattern = /(\d+)\s*[-–:]\s*(\d+)/;
        const scoreMatch = matchHtml.match(scorePattern);
        if (scoreMatch) {
          homeScore = scoreMatch[1];
          awayScore = scoreMatch[2];
        } else if (numbers.length >= 2) {
          homeScore = numbers[0];
          awayScore = numbers[1];
        }
        
        let status = 'Scheduled';
        let minute: string | null = null;
        
        if (matchHtml.toLowerCase().includes('live') || 
            matchHtml.includes("'") ||
            matchHtml.toLowerCase().includes('in progress')) {
          status = 'Live';
        }
        
        const minuteMatch = matchHtml.match(/(\d+(?:\+\d+)?)'|(\d+)\s*min/i);
        if (minuteMatch) {
          minute = (minuteMatch[1] || minuteMatch[2]) + "'";
          status = 'Live';
        }
        
        if (matchHtml.includes('FT') || matchHtml.toLowerCase().includes('full time')) {
          status = 'Completed';
        } else if (matchHtml.includes('HT') || matchHtml.toLowerCase().includes('half time')) {
          status = 'Half Time';
          minute = "45'";
        }
        
        const exists = matches.some(m => 
          m.homeTeam.toLowerCase() === homeTeam.toLowerCase() && 
          m.awayTeam.toLowerCase() === awayTeam.toLowerCase()
        );
        
        if (!exists && homeTeam !== awayTeam) {
          matches.push({
            homeTeam,
            awayTeam,
            homeScore,
            awayScore,
            status,
            minute,
            competition: null,
            matchUrl: teamLinks[0].href.split('/club/')[0] || null,
          });
        }
      }
    }
    
    if (matches.length === 0) {
      console.log('Trying fallback score pattern...');
      
      const directPattern = /([A-Za-zÀ-ÿ\s\-\.]+?)\s*(\d+)\s*[-–:]\s*(\d+)\s*([A-Za-zÀ-ÿ\s\-\.]+)/g;
      let directMatch;
      while ((directMatch = directPattern.exec(html)) !== null) {
        const homeTeam = directMatch[1].trim();
        const awayTeam = directMatch[4].trim();
        
        if (homeTeam.length >= 3 && homeTeam.length <= 40 &&
            awayTeam.length >= 3 && awayTeam.length <= 40 &&
            homeTeam !== awayTeam) {
          
          const exists = matches.some(m => 
            m.homeTeam.toLowerCase() === homeTeam.toLowerCase() && 
            m.awayTeam.toLowerCase() === awayTeam.toLowerCase()
          );
          
          if (!exists) {
            matches.push({
              homeTeam: decodeHtmlEntities(homeTeam),
              awayTeam: decodeHtmlEntities(awayTeam),
              homeScore: directMatch[2],
              awayScore: directMatch[3],
              status: 'Found',
              minute: null,
              competition: null,
              matchUrl: null,
            });
          }
        }
      }
    }
    
    if (matches.length === 0) {
      console.log('No matches found. HTML sample:', html.substring(0, 2000));
    }
    
  } catch (error) {
    console.error('Error parsing scores:', error);
  }
  
  return matches;
}

// Generic parser for other football sites
function parseGenericScores(html: string): FootballMatch[] {
  const matches: FootballMatch[] = [];
  
  try {
    const jsonLdPattern = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
    let jsonMatch;
    while ((jsonMatch = jsonLdPattern.exec(html)) !== null) {
      try {
        const jsonData = JSON.parse(jsonMatch[1]);
        if (jsonData['@type'] === 'SportsEvent' || 
            jsonData['@type']?.includes?.('SportsEvent')) {
          const homeTeam = jsonData.homeTeam?.name || jsonData.competitor?.[0]?.name;
          const awayTeam = jsonData.awayTeam?.name || jsonData.competitor?.[1]?.name;
          
          if (homeTeam && awayTeam) {
            matches.push({
              homeTeam,
              awayTeam,
              homeScore: jsonData.homeTeam?.score?.toString() || null,
              awayScore: jsonData.awayTeam?.score?.toString() || null,
              status: jsonData.eventStatus || 'Scheduled',
              minute: null,
              competition: jsonData.name || null,
              matchUrl: null,
            });
          }
        }
      } catch {
        // Not valid JSON, skip
      }
    }
  } catch (error) {
    console.error('Error parsing generic scores:', error);
  }
  
  return matches;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url, matchId, debug } = await req.json();

    if (!url) {
      return new Response(
        JSON.stringify({ error: 'URL is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Scraping football scores from: ${url}`);

    const headers: HeadersInit = {
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Cache-Control': 'no-cache',
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);

    const response = await fetch(url, {
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

    const html = await response.text();
    console.log(`Fetched ${html.length} bytes`);

    let matches: FootballMatch[] = [];
    
    if (url.includes('footballdatabase.eu')) {
      matches = parseFootballDatabaseScores(html);
    } else {
      matches = parseGenericScores(html);
    }
    
    if (matches.length === 0) {
      matches = parseGenericScores(html);
    }

    console.log(`Found ${matches.length} matches`);

    const responseData: Record<string, unknown> = {
      success: true,
      matches,
      sourceUrl: url,
      scrapedAt: new Date().toISOString(),
      matchId: matchId || null,
      totalMatches: matches.length,
    };
    
    if (debug) {
      responseData.htmlSample = html.substring(0, 5000);
      responseData.htmlLength = html.length;
    }

    return new Response(
      JSON.stringify(responseData),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error: unknown) {
    console.error('Scrape football scores error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
