import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { cricbuzzMatchId } = await req.json();

    if (!cricbuzzMatchId) {
      return new Response(
        JSON.stringify({ error: 'cricbuzzMatchId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Fetching score for Cricbuzz match ID: ${cricbuzzMatchId}`);

    // Fetch the Cricbuzz live score page
    const url = `https://www.cricbuzz.com/live-cricket-scores/${cricbuzzMatchId}`;
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
    });

    if (!response.ok) {
      console.error(`Failed to fetch Cricbuzz page: ${response.status}`);
      return new Response(
        JSON.stringify({ error: `Failed to fetch score: ${response.status}` }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const html = await response.text();
    
    // Parse the HTML to extract score data
    const scoreData = parseScoreFromHtml(html);
    
    console.log('Parsed score data:', scoreData);

    return new Response(
      JSON.stringify(scoreData),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error scraping cricket score:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function parseScoreFromHtml(html: string): {
  team1: { name: string; score: string; overs: string } | null;
  team2: { name: string; score: string; overs: string } | null;
  status: string;
  lastUpdated: string;
} {
  const result = {
    team1: null as { name: string; score: string; overs: string } | null,
    team2: null as { name: string; score: string; overs: string } | null,
    status: '',
    lastUpdated: new Date().toISOString(),
  };

  try {
    // Extract match status - look for the status text
    const statusMatch = html.match(/<div[^>]*class="[^"]*cb-text-complete[^"]*"[^>]*>([^<]+)<\/div>/i) ||
                        html.match(/<div[^>]*class="[^"]*cb-text-live[^"]*"[^>]*>([^<]+)<\/div>/i) ||
                        html.match(/<div[^>]*class="[^"]*cb-text-stumps[^"]*"[^>]*>([^<]+)<\/div>/i) ||
                        html.match(/<span[^>]*class="[^"]*cb-text-complete[^"]*"[^>]*>([^<]+)<\/span>/i);
    
    if (statusMatch) {
      result.status = statusMatch[1].trim();
    }

    // Try to extract team scores using multiple patterns
    // Pattern 1: Look for score blocks with team name and score
    const scoreBlockPattern = /<div[^>]*class="[^"]*cb-min-bat-rw[^"]*"[^>]*>[\s\S]*?<div[^>]*class="[^"]*cb-hmscg-bwl-txt[^"]*"[^>]*>([^<]+)<\/div>[\s\S]*?<div[^>]*class="[^"]*cb-hmscg-bat-txt[^"]*"[^>]*>([^<]+)<\/div>[\s\S]*?<\/div>/gi;
    
    const matches = [...html.matchAll(scoreBlockPattern)];
    
    if (matches.length >= 1) {
      result.team1 = {
        name: matches[0][1]?.trim() || 'Team 1',
        score: matches[0][2]?.trim() || '',
        overs: '',
      };
    }
    if (matches.length >= 2) {
      result.team2 = {
        name: matches[1][1]?.trim() || 'Team 2',
        score: matches[1][2]?.trim() || '',
        overs: '',
      };
    }

    // Alternative pattern: Look for miniscore container
    if (!result.team1) {
      // Try finding team names in the title or header
      const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
      if (titleMatch) {
        const title = titleMatch[1];
        // Title format: "Team1 vs Team2 Live Score"
        const teamsMatch = title.match(/(.+?)\s+vs\s+(.+?)\s+(?:Live|Score|Match)/i);
        if (teamsMatch) {
          result.team1 = { name: teamsMatch[1].trim(), score: '', overs: '' };
          result.team2 = { name: teamsMatch[2].trim(), score: '', overs: '' };
        }
      }

      // Try to extract scores from various score patterns
      const scorePatterns = [
        /(\d+)\/(\d+)\s*\((\d+\.?\d*)\s*ov(?:ers?)?\)/gi,  // 150/5 (20.3 overs)
        /(\d+)-(\d+)\s*\((\d+\.?\d*)\)/gi,                   // 150-5 (20.3)
        /(\d+)\/(\d+)/gi,                                     // 150/5
      ];

      for (const pattern of scorePatterns) {
        const scoreMatches = [...html.matchAll(pattern)];
        if (scoreMatches.length >= 1 && result.team1) {
          result.team1.score = `${scoreMatches[0][1]}/${scoreMatches[0][2]}`;
          result.team1.overs = scoreMatches[0][3] || '';
        }
        if (scoreMatches.length >= 2 && result.team2) {
          result.team2.score = `${scoreMatches[1][1]}/${scoreMatches[1][2]}`;
          result.team2.overs = scoreMatches[1][3] || '';
        }
        if (result.team1?.score) break;
      }
    }

    // Extract overs if not already found
    const oversPattern = /\((\d+\.?\d*)\s*ov(?:ers?)?\)/gi;
    const oversMatches = [...html.matchAll(oversPattern)];
    if (oversMatches.length >= 1 && result.team1 && !result.team1.overs) {
      result.team1.overs = oversMatches[0][1];
    }
    if (oversMatches.length >= 2 && result.team2 && !result.team2.overs) {
      result.team2.overs = oversMatches[1][1];
    }

  } catch (parseError) {
    console.error('Error parsing HTML:', parseError);
  }

  return result;
}
