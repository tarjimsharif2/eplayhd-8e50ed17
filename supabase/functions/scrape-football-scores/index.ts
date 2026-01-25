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
  date: string | null;
}

// Extract text content from HTML, removing tags
function extractText(html: string): string {
  return html.replace(/<[^>]*>/g, '').trim();
}

// Parse football scores from Footballdatabase.eu HTML
function parseFootballDatabaseScores(html: string): FootballMatch[] {
  const matches: FootballMatch[] = [];
  
  try {
    // Pattern for match rows - adjust based on actual HTML structure
    // This is a generic pattern that may need adjustment based on the actual site structure
    
    // Look for match containers
    const matchPatterns = [
      // Pattern 1: Common table-based structure
      /<tr[^>]*class="[^"]*match[^"]*"[^>]*>([\s\S]*?)<\/tr>/gi,
      // Pattern 2: Div-based structure
      /<div[^>]*class="[^"]*match[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
      // Pattern 3: Article/section based
      /<article[^>]*class="[^"]*fixture[^"]*"[^>]*>([\s\S]*?)<\/article>/gi,
    ];

    for (const pattern of matchPatterns) {
      let match;
      pattern.lastIndex = 0;
      while ((match = pattern.exec(html)) !== null) {
        const matchHtml = match[1];
        
        // Try to extract team names
        const teamPattern = /<(?:span|div|td)[^>]*class="[^"]*(?:team|club|name)[^"]*"[^>]*>([^<]+)<\//gi;
        const teams: string[] = [];
        let teamMatch;
        while ((teamMatch = teamPattern.exec(matchHtml)) !== null) {
          teams.push(extractText(teamMatch[1]));
        }
        
        // Try to extract scores
        const scorePattern = /<(?:span|div|td)[^>]*class="[^"]*(?:score|result|goals)[^"]*"[^>]*>(\d+)<\//gi;
        const scores: string[] = [];
        let scoreMatch;
        while ((scoreMatch = scorePattern.exec(matchHtml)) !== null) {
          scores.push(scoreMatch[1]);
        }
        
        // Try to extract match status/minute
        const statusPattern = /<(?:span|div)[^>]*class="[^"]*(?:status|minute|time|live)[^"]*"[^>]*>([^<]+)<\//gi;
        const statusMatch = statusPattern.exec(matchHtml);
        const status = statusMatch ? extractText(statusMatch[1]) : 'Unknown';
        
        if (teams.length >= 2) {
          matches.push({
            homeTeam: teams[0],
            awayTeam: teams[1],
            homeScore: scores[0] || null,
            awayScore: scores[1] || null,
            status: status,
            minute: status.includes("'") ? status : null,
            competition: null,
            date: null,
          });
        }
      }
    }
    
    // Alternative: Look for score patterns like "Team A 2 - 1 Team B"
    const scoreLinePattern = /([A-Za-z\s]+)\s+(\d+)\s*[-–:]\s*(\d+)\s+([A-Za-z\s]+)/gi;
    let lineMatch;
    while ((lineMatch = scoreLinePattern.exec(html)) !== null) {
      const homeTeam = lineMatch[1].trim();
      const awayTeam = lineMatch[4].trim();
      
      // Skip if already found or if team names are too short
      if (homeTeam.length < 3 || awayTeam.length < 3) continue;
      
      const exists = matches.some(m => 
        m.homeTeam.toLowerCase() === homeTeam.toLowerCase() && 
        m.awayTeam.toLowerCase() === awayTeam.toLowerCase()
      );
      
      if (!exists) {
        matches.push({
          homeTeam,
          awayTeam,
          homeScore: lineMatch[2],
          awayScore: lineMatch[3],
          status: 'Found',
          minute: null,
          competition: null,
          date: null,
        });
      }
    }
    
  } catch (error) {
    console.error('Error parsing scores:', error);
  }
  
  return matches;
}

// Parse scores from generic football websites
function parseGenericFootballScores(html: string, url: string): FootballMatch[] {
  const matches: FootballMatch[] = [];
  
  try {
    // JSON-LD structured data (many sites use this)
    const jsonLdPattern = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
    let jsonMatch;
    while ((jsonMatch = jsonLdPattern.exec(html)) !== null) {
      try {
        const jsonData = JSON.parse(jsonMatch[1]);
        if (jsonData['@type'] === 'SportsEvent' || jsonData['@type']?.includes('SportsEvent')) {
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
              date: jsonData.startDate || null,
            });
          }
        }
      } catch (e) {
        // Not valid JSON, skip
      }
    }
    
    // Microdata patterns
    const microdataPattern = /itemprop="(?:homeTeam|awayTeam|competitor)"[^>]*>([^<]+)</gi;
    const competitors: string[] = [];
    let mdMatch;
    while ((mdMatch = microdataPattern.exec(html)) !== null) {
      competitors.push(extractText(mdMatch[1]));
    }
    
    // Group competitors into pairs
    for (let i = 0; i < competitors.length - 1; i += 2) {
      if (!matches.some(m => m.homeTeam === competitors[i])) {
        matches.push({
          homeTeam: competitors[i],
          awayTeam: competitors[i + 1],
          homeScore: null,
          awayScore: null,
          status: 'Found',
          minute: null,
          competition: null,
          date: null,
        });
      }
    }
    
  } catch (error) {
    console.error('Error parsing generic scores:', error);
  }
  
  return matches;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url, matchId } = await req.json();

    if (!url) {
      return new Response(
        JSON.stringify({ error: 'URL is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Scraping football scores from: ${url}`);

    // Build headers for the request
    const headers: HeadersInit = {
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    };

    // Fetch the page with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

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

    // Parse scores based on the URL
    let matches: FootballMatch[] = [];
    
    if (url.includes('footballdatabase.eu')) {
      matches = parseFootballDatabaseScores(html);
    } else {
      matches = parseGenericFootballScores(html, url);
    }
    
    // If no structured matches found, try generic parsing
    if (matches.length === 0) {
      matches = parseFootballDatabaseScores(html);
    }

    console.log(`Found ${matches.length} matches`);

    return new Response(
      JSON.stringify({
        success: true,
        matches,
        sourceUrl: url,
        scrapedAt: new Date().toISOString(),
        matchId: matchId || null,
      }),
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
