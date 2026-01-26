import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { matchId, cricbuzzMatchId, teamAId, teamBId } = await req.json();

    if (!matchId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Match ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[scrape-playing-xi] Starting for match: ${matchId}, cricbuzz: ${cricbuzzMatchId}`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get match data if not provided
    let matchCricbuzzId = cricbuzzMatchId;
    let teamA = teamAId;
    let teamB = teamBId;
    let teamAName = '';
    let teamBName = '';

    if (!matchCricbuzzId || !teamA || !teamB) {
      const { data: matchData, error: matchError } = await supabase
        .from('matches')
        .select(`
          cricbuzz_match_id,
          team_a_id,
          team_b_id,
          team_a:teams!matches_team_a_id_fkey(id, name, short_name),
          team_b:teams!matches_team_b_id_fkey(id, name, short_name)
        `)
        .eq('id', matchId)
        .single();

      if (matchError || !matchData) {
        return new Response(
          JSON.stringify({ success: false, error: 'Match not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      matchCricbuzzId = matchData.cricbuzz_match_id;
      teamA = matchData.team_a_id;
      teamB = matchData.team_b_id;
      teamAName = (matchData.team_a as any)?.name || '';
      teamBName = (matchData.team_b as any)?.name || '';
    }

    if (!matchCricbuzzId) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Cricbuzz Match ID not set. Please set it in match settings first.',
          playersAdded: 0
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[scrape-playing-xi] Fetching Cricbuzz page for match: ${matchCricbuzzId}`);

    // Try multiple URL patterns for Cricbuzz
    const urlPatterns = [
      `https://www.cricbuzz.com/live-cricket-scores/${matchCricbuzzId}`,
      `https://www.cricbuzz.com/cricket-match-squads/${matchCricbuzzId}`,
      `https://m.cricbuzz.com/live-cricket-scores/${matchCricbuzzId}`,
    ];

    let pageHtml = '';
    let successUrl = '';

    for (const url of urlPatterns) {
      try {
        console.log(`[scrape-playing-xi] Trying URL: ${url}`);
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Cache-Control': 'no-cache',
          },
        });

        if (response.ok) {
          pageHtml = await response.text();
          successUrl = url;
          console.log(`[scrape-playing-xi] Successfully fetched: ${url}, length: ${pageHtml.length}`);
          break;
        }
      } catch (e) {
        console.log(`[scrape-playing-xi] Failed to fetch ${url}: ${e}`);
      }
    }

    if (!pageHtml) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Could not fetch Cricbuzz page. Check if Cricbuzz Match ID is correct.',
          playersAdded: 0
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse players from HTML
    const playersToAdd: any[] = [];

    // Method 1: Look for Playing XI section patterns
    // Pattern: Player names in squads/playing XI sections
    const playerPatterns = [
      // Pattern for player names with roles
      /<a[^>]*class="[^"]*cb-text-link[^"]*"[^>]*>([^<]+)<\/a>\s*(?:<span[^>]*>\s*\((c|wk|c & wk)\)\s*<\/span>)?/gi,
      // Pattern for player list items
      /<div[^>]*class="[^"]*cb-col[^"]*cb-col-50[^"]*"[^>]*>\s*<a[^>]*>([^<]+)<\/a>/gi,
      // Mobile pattern
      /<span[^>]*class="[^"]*ui-player-name[^"]*"[^>]*>([^<]+)<\/span>/gi,
    ];

    // Extract team sections
    const teamSectionPatterns = [
      // Look for team name followed by player list
      new RegExp(`${escapeRegex(teamAName)}[\\s\\S]*?(?=(?:${escapeRegex(teamBName)}|$))`, 'i'),
      new RegExp(`${escapeRegex(teamBName)}[\\s\\S]*?$`, 'i'),
    ];

    // Try to find Playing XI section
    const playingXIMatch = pageHtml.match(/playing\s*xi|playing\s*11|line[- ]?up/i);
    let relevantSection = pageHtml;
    
    if (playingXIMatch) {
      const startIdx = playingXIMatch.index || 0;
      relevantSection = pageHtml.substring(startIdx, startIdx + 10000);
    }

    // Extract all player-like names
    const allNames: string[] = [];
    
    // Pattern 1: Links with player names
    const linkPattern = /<a[^>]*href="[^"]*(?:player|profiles)[^"]*"[^>]*>([^<]+)<\/a>/gi;
    let match;
    while ((match = linkPattern.exec(relevantSection)) !== null) {
      const name = match[1].trim();
      if (isValidPlayerName(name)) {
        allNames.push(name);
      }
    }

    // Pattern 2: Direct text extraction from squad divs
    const squadDivPattern = /<div[^>]*class="[^"]*(?:cb-player|squad|team-player|player-name)[^"]*"[^>]*>([^<]+)<\/div>/gi;
    while ((match = squadDivPattern.exec(relevantSection)) !== null) {
      const name = match[1].trim();
      if (isValidPlayerName(name)) {
        allNames.push(name);
      }
    }

    // Pattern 3: List items with player data
    const liPattern = /<li[^>]*>(?:<[^>]*>)*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)(?:<[^>]*>)*<\/li>/gi;
    while ((match = liPattern.exec(relevantSection)) !== null) {
      const name = match[1].trim();
      if (isValidPlayerName(name)) {
        allNames.push(name);
      }
    }

    // Pattern 4: JSON data in script tags
    const jsonPattern = /"(?:name|fullName|playerName)"\s*:\s*"([^"]+)"/gi;
    while ((match = jsonPattern.exec(pageHtml)) !== null) {
      const name = match[1].trim();
      if (isValidPlayerName(name)) {
        allNames.push(name);
      }
    }

    // Remove duplicates
    const uniqueNames = [...new Set(allNames)];
    console.log(`[scrape-playing-xi] Found ${uniqueNames.length} unique player names`);

    if (uniqueNames.length < 11) {
      // Try API endpoint as fallback
      const apiUrl = `https://www.cricbuzz.com/api/html/cricket-scorecard/${matchCricbuzzId}`;
      try {
        const apiResponse = await fetch(apiUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          },
        });
        if (apiResponse.ok) {
          const apiHtml = await apiResponse.text();
          // Extract from API response
          const apiNamePattern = /<a[^>]*>([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)<\/a>/gi;
          while ((match = apiNamePattern.exec(apiHtml)) !== null) {
            const name = match[1].trim();
            if (isValidPlayerName(name) && !uniqueNames.includes(name)) {
              uniqueNames.push(name);
            }
          }
        }
      } catch (e) {
        console.log(`[scrape-playing-xi] API fallback failed: ${e}`);
      }
    }

    console.log(`[scrape-playing-xi] Final player count: ${uniqueNames.length}`);
    console.log(`[scrape-playing-xi] Players found: ${uniqueNames.slice(0, 22).join(', ')}`);

    if (uniqueNames.length < 11) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Only found ${uniqueNames.length} players. Playing XI may not be announced yet, or try manual entry.`,
          playersFound: uniqueNames,
          playersAdded: 0
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Split players between teams (first 11 for team A, next 11 for team B)
    const teamAPlayers = uniqueNames.slice(0, 11);
    const teamBPlayers = uniqueNames.slice(11, 22);

    // Delete existing playing XI for this match
    await supabase
      .from('match_playing_xi')
      .delete()
      .eq('match_id', matchId);

    // Add team A players
    for (let i = 0; i < teamAPlayers.length; i++) {
      const name = teamAPlayers[i];
      const isCaptain = name.includes('(c)') || name.includes('(C)') || (i === 0);
      const isWK = name.includes('(wk)') || name.includes('(WK)');
      const cleanName = name.replace(/\s*\([^)]*\)\s*/g, '').trim();

      playersToAdd.push({
        match_id: matchId,
        team_id: teamA,
        player_name: cleanName,
        batting_order: i + 1,
        is_captain: isCaptain && i === 0,
        is_wicket_keeper: isWK,
        player_role: null,
      });
    }

    // Add team B players
    for (let i = 0; i < teamBPlayers.length; i++) {
      const name = teamBPlayers[i];
      const isCaptain = name.includes('(c)') || name.includes('(C)') || (i === 0);
      const isWK = name.includes('(wk)') || name.includes('(WK)');
      const cleanName = name.replace(/\s*\([^)]*\)\s*/g, '').trim();

      playersToAdd.push({
        match_id: matchId,
        team_id: teamB,
        player_name: cleanName,
        batting_order: i + 1,
        is_captain: isCaptain && i === 0,
        is_wicket_keeper: isWK,
        player_role: null,
      });
    }

    if (playersToAdd.length > 0) {
      const { error: insertError } = await supabase
        .from('match_playing_xi')
        .insert(playersToAdd);

      if (insertError) {
        console.error(`[scrape-playing-xi] Insert error:`, insertError);
        return new Response(
          JSON.stringify({ success: false, error: insertError.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    console.log(`[scrape-playing-xi] Successfully added ${playersToAdd.length} players`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        playersAdded: playersToAdd.length,
        teamAPlayers: teamAPlayers.length,
        teamBPlayers: teamBPlayers.length,
        message: `Added ${playersToAdd.length} players from Cricbuzz scrape`
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('[scrape-playing-xi] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isValidPlayerName(name: string): boolean {
  if (!name || name.length < 3 || name.length > 50) return false;
  
  // Must contain at least one letter
  if (!/[a-zA-Z]/.test(name)) return false;
  
  // Should not be common non-player text
  const excludePatterns = [
    /^(home|away|team|squad|playing|match|live|score|cricket|vs|and|the|for)$/i,
    /^(wickets?|runs?|overs?|balls?|extras?|total|innings?)$/i,
    /^\d+$/,
    /^[A-Z]{2,4}$/,  // Team abbreviations like IND, AUS
    /cricbuzz/i,
    /espn/i,
  ];
  
  for (const pattern of excludePatterns) {
    if (pattern.test(name.trim())) return false;
  }
  
  // Should look like a name (at least 2 parts or one longer name)
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1 && name.length < 5) return false;
  
  return true;
}
