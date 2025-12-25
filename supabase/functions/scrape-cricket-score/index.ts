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
    console.log(`Fetched HTML length: ${html.length} characters`);
    
    const scoreData = parseScoreFromHtml(html);
    
    console.log('Final result:', JSON.stringify(scoreData, null, 2));

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
    // Debug: Look for any JSON-like score data
    const scoreJsonMatch = html.match(/"score"\s*:\s*"(\d+\/\d+[^"]*)"/) ||
                           html.match(/score['"]\s*:\s*['"](\d+\/\d+[^'"]*)['"]/);
    if (scoreJsonMatch) {
      console.log('Found score in JSON:', scoreJsonMatch[1]);
    }

    // Look for status in JSON
    const statusJsonMatch = html.match(/"status"\s*:\s*"([^"]{10,100})"/);
    if (statusJsonMatch) {
      result.status = statusJsonMatch[1].replace(/\\n/g, ' ').trim();
      console.log('Found status:', result.status);
    }

    // Extract team names from JSON - more flexible pattern
    const teamJsonPattern = /"teamName"\s*:\s*"([^"]+)"/g;
    const teamMatches = [...html.matchAll(teamJsonPattern)];
    const uniqueTeams = [...new Set(teamMatches.map(m => m[1]))].slice(0, 2);
    
    console.log('Found teams:', uniqueTeams);
    
    if (uniqueTeams.length >= 1) {
      result.team1 = { name: uniqueTeams[0], score: '', overs: '' };
    }
    if (uniqueTeams.length >= 2) {
      result.team2 = { name: uniqueTeams[1], score: '', overs: '' };
    }

    // Look for innings data with score - search for multiple formats
    // Format: {"inngsId":1,"batTeamName":"Indonesia","batTeamId":566,"score":"177/5 (20.0 Ov)"
    const inningsPattern1 = /"batTeamName"\s*:\s*"([^"]+)"[^}]*?"score"\s*:\s*"([^"]+)"/g;
    const inningsPattern2 = /"score"\s*:\s*"([^"]+)"[^}]*?"batTeamName"\s*:\s*"([^"]+)"/g;
    
    let inningsMatches = [...html.matchAll(inningsPattern1)];
    console.log(`Pattern 1 found ${inningsMatches.length} innings`);
    
    if (inningsMatches.length === 0) {
      const pattern2Matches = [...html.matchAll(inningsPattern2)];
      console.log(`Pattern 2 found ${pattern2Matches.length} innings`);
      // Convert pattern 2 matches to same format (swap score and team)
      for (const m of pattern2Matches) {
        inningsMatches.push([m[0], m[2], m[1]] as unknown as RegExpExecArray);
      }
    }

    // Process innings matches
    const processedTeams: Record<string, { score: string; overs: string }> = {};
    
    for (const match of inningsMatches) {
      const teamName = match[1];
      const scoreText = match[2];
      
      // Parse score: "177/5 (20.0 Ov)" or "177/5"
      const scoreParts = scoreText.match(/(\d+)\/(\d+)(?:\s*\((\d+\.?\d*)\s*(?:Ov|ov))?/);
      
      if (scoreParts) {
        console.log(`Found innings: ${teamName} - ${scoreParts[1]}/${scoreParts[2]} (${scoreParts[3] || '-'} ov)`);
        processedTeams[teamName] = {
          score: `${scoreParts[1]}/${scoreParts[2]}`,
          overs: scoreParts[3] || '',
        };
      }
    }

    // Assign scores to teams
    const processedTeamNames = Object.keys(processedTeams);
    if (processedTeamNames.length >= 1) {
      result.team1 = {
        name: processedTeamNames[0],
        score: processedTeams[processedTeamNames[0]].score,
        overs: processedTeams[processedTeamNames[0]].overs,
      };
    }
    if (processedTeamNames.length >= 2) {
      result.team2 = {
        name: processedTeamNames[1],
        score: processedTeams[processedTeamNames[1]].score,
        overs: processedTeams[processedTeamNames[1]].overs,
      };
    }

    // Fallback: Look for simple score patterns in visible text
    if (!result.team1?.score) {
      // Remove scripts and find visible score
      const cleanHtml = html.replace(/<script[\s\S]*?<\/script>/gi, '');
      
      // Look for "TeamName 123/4 (20.0)" in text content
      const visibleScorePattern = />([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)\s+(\d{2,3})\/(\d{1,2})(?:\s*\((\d{1,2}\.?\d?)[^)]*\))?</g;
      const visibleMatches = [...cleanHtml.matchAll(visibleScorePattern)];
      
      console.log(`Found ${visibleMatches.length} visible score patterns`);
      
      for (const m of visibleMatches.slice(0, 2)) {
        console.log(`Visible score: ${m[1]} - ${m[2]}/${m[3]}`);
      }
    }

    // Last resort: extract from title
    if (!result.team1 && !result.team2) {
      const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
      if (titleMatch) {
        const teamsMatch = titleMatch[1].match(/([^|,]+?)\s+vs\s+([^|,]+?)(?:,|\s+\d|$)/i);
        if (teamsMatch) {
          result.team1 = { name: teamsMatch[1].replace(/^.*\|\s*/, '').trim(), score: '', overs: '' };
          result.team2 = { name: teamsMatch[2].trim(), score: '', overs: '' };
        }
      }
    }

  } catch (parseError) {
    console.error('Error parsing HTML:', parseError);
  }

  return result;
}
