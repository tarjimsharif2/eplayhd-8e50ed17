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

    // Get match data
    let matchCricbuzzId = cricbuzzMatchId;
    let teamA = teamAId;
    let teamB = teamBId;
    let teamAName = '';
    let teamBName = '';

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

    matchCricbuzzId = cricbuzzMatchId || matchData.cricbuzz_match_id;
    teamA = teamAId || matchData.team_a_id;
    teamB = teamBId || matchData.team_b_id;
    teamAName = (matchData.team_a as any)?.name || '';
    teamBName = (matchData.team_b as any)?.name || '';

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

    console.log(`[scrape-playing-xi] Teams: ${teamAName} vs ${teamBName}`);

    const playersToAdd: any[] = [];
    let teamAPlayers: string[] = [];
    let teamBPlayers: string[] = [];

    // Try Cricbuzz's internal JSON APIs
    const apiUrls = [
      // Mini scorecard JSON
      `https://www.cricbuzz.com/api/cricket-match/mini-scorecard/${matchCricbuzzId}`,
      // Match scorecard
      `https://www.cricbuzz.com/api/html/cricket-scorecard/${matchCricbuzzId}`,
      // Commentary JSON (contains player info)
      `https://www.cricbuzz.com/api/cricket-match/${matchCricbuzzId}/commentary`,
      // Match info
      `https://www.cricbuzz.com/api/cricket-match/${matchCricbuzzId}/info`,
    ];

    for (const apiUrl of apiUrls) {
      if (teamAPlayers.length >= 11 && teamBPlayers.length >= 11) break;
      
      try {
        console.log(`[scrape-playing-xi] Trying: ${apiUrl}`);
        const response = await fetch(apiUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'application/json, text/html, */*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Referer': `https://www.cricbuzz.com/live-cricket-scores/${matchCricbuzzId}`,
          },
        });

        console.log(`[scrape-playing-xi] Response status: ${response.status}`);
        
        if (response.ok) {
          const text = await response.text();
          console.log(`[scrape-playing-xi] Response length: ${text.length}`);
          
          // Try JSON parse
          try {
            const json = JSON.parse(text);
            console.log(`[scrape-playing-xi] JSON keys: ${Object.keys(json).slice(0, 10).join(', ')}`);
            
            const players = extractFromCricbuzzJson(json, teamAName, teamBName);
            if (players.teamA.length > teamAPlayers.length) teamAPlayers = players.teamA;
            if (players.teamB.length > teamBPlayers.length) teamBPlayers = players.teamB;
            
            console.log(`[scrape-playing-xi] After JSON: Team A ${teamAPlayers.length}, Team B ${teamBPlayers.length}`);
          } catch {
            // Try HTML parsing
            const players = extractFromHtml(text, teamAName, teamBName);
            if (players.teamA.length > teamAPlayers.length) teamAPlayers = players.teamA;
            if (players.teamB.length > teamBPlayers.length) teamBPlayers = players.teamB;
            
            console.log(`[scrape-playing-xi] After HTML: Team A ${teamAPlayers.length}, Team B ${teamBPlayers.length}`);
          }
        }
      } catch (e) {
        console.log(`[scrape-playing-xi] Failed: ${e}`);
      }
    }

    // Log what we found
    console.log(`[scrape-playing-xi] Final: Team A ${teamAPlayers.length}, Team B ${teamBPlayers.length}`);
    if (teamAPlayers.length > 0) {
      console.log(`[scrape-playing-xi] Team A sample: ${teamAPlayers.slice(0, 3).join(', ')}`);
    }
    if (teamBPlayers.length > 0) {
      console.log(`[scrape-playing-xi] Team B sample: ${teamBPlayers.slice(0, 3).join(', ')}`);
    }

    const totalPlayers = teamAPlayers.length + teamBPlayers.length;

    if (totalPlayers < 11) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Only found ${totalPlayers} players. Cricbuzz APIs may not be accessible or Playing XI not announced. Use Bulk Add instead.`,
          teamAPlayers: teamAPlayers,
          teamBPlayers: teamBPlayers,
          playersAdded: 0
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Delete existing
    await supabase
      .from('match_playing_xi')
      .delete()
      .eq('match_id', matchId);

    // Add team A players
    for (let i = 0; i < Math.min(teamAPlayers.length, 11); i++) {
      const { cleanName, isCaptain, isWK } = parsePlayer(teamAPlayers[i]);
      playersToAdd.push({
        match_id: matchId,
        team_id: teamA,
        player_name: cleanName,
        batting_order: i + 1,
        is_captain: isCaptain,
        is_wicket_keeper: isWK,
        player_role: null,
      });
    }

    // Add team B players
    for (let i = 0; i < Math.min(teamBPlayers.length, 11); i++) {
      const { cleanName, isCaptain, isWK } = parsePlayer(teamBPlayers[i]);
      playersToAdd.push({
        match_id: matchId,
        team_id: teamB,
        player_name: cleanName,
        batting_order: i + 1,
        is_captain: isCaptain,
        is_wicket_keeper: isWK,
        player_role: null,
      });
    }

    if (playersToAdd.length > 0) {
      const { error: insertError } = await supabase
        .from('match_playing_xi')
        .insert(playersToAdd);

      if (insertError) {
        return new Response(
          JSON.stringify({ success: false, error: insertError.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        playersAdded: playersToAdd.length,
        teamAPlayers: Math.min(teamAPlayers.length, 11),
        teamBPlayers: Math.min(teamBPlayers.length, 11),
        message: `Added ${playersToAdd.length} players from Cricbuzz`
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('[scrape-playing-xi] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function parsePlayer(name: string): { cleanName: string; isCaptain: boolean; isWK: boolean } {
  const isCaptain = /\(c\)/i.test(name) || /\bcapt\b/i.test(name);
  const isWK = /\(wk\)/i.test(name) || /\(†\)/.test(name) || /†/.test(name);
  const cleanName = name
    .replace(/\s*\([^)]*\)\s*/g, '')
    .replace(/†/g, '')
    .replace(/\*/g, '')
    .trim();
  return { cleanName, isCaptain, isWK };
}

function extractFromCricbuzzJson(json: any, teamAName: string, teamBName: string): { teamA: string[]; teamB: string[] } {
  const teamA: string[] = [];
  const teamB: string[] = [];
  
  // Helper to check all objects recursively for player data
  const findPlayers = (obj: any, depth = 0): void => {
    if (depth > 10 || !obj) return;
    
    if (Array.isArray(obj)) {
      for (const item of obj) {
        findPlayers(item, depth + 1);
      }
      return;
    }
    
    if (typeof obj === 'object') {
      // Check for player-like objects
      const name = obj.batName || obj.bowlName || obj.name || obj.fullName || obj.playerName;
      if (name && typeof name === 'string' && isValidPlayer(name)) {
        // Try to determine team
        const teamName = obj.teamName || obj.teamSName || '';
        if (teamName.toLowerCase().includes(teamAName.toLowerCase().split(' ')[0])) {
          if (!teamA.includes(name) && teamA.length < 11) teamA.push(name);
        } else if (teamName.toLowerCase().includes(teamBName.toLowerCase().split(' ')[0])) {
          if (!teamB.includes(name) && teamB.length < 11) teamB.push(name);
        } else {
          // Add to whichever team needs more
          if (teamA.length <= teamB.length && teamA.length < 11 && !teamA.includes(name)) {
            teamA.push(name);
          } else if (teamB.length < 11 && !teamB.includes(name)) {
            teamB.push(name);
          }
        }
      }
      
      // Recurse into object properties
      for (const key of Object.keys(obj)) {
        findPlayers(obj[key], depth + 1);
      }
    }
  };
  
  findPlayers(json);
  
  return { teamA, teamB };
}

function extractFromHtml(html: string, teamAName: string, teamBName: string): { teamA: string[]; teamB: string[] } {
  const teamA: string[] = [];
  const teamB: string[] = [];
  
  // Pattern for player profile links: /profiles/1234/player-name
  const profilePattern = /<a[^>]*href="\/profiles\/\d+\/[^"]*"[^>]*>([^<]+)<\/a>/gi;
  let match;
  
  while ((match = profilePattern.exec(html)) !== null) {
    const name = match[1].trim();
    if (isValidPlayer(name)) {
      if (teamA.length <= teamB.length && teamA.length < 11 && !teamA.includes(name)) {
        teamA.push(name);
      } else if (teamB.length < 11 && !teamB.includes(name)) {
        teamB.push(name);
      }
    }
  }
  
  // Alternative pattern for batsman rows
  const batsmanPattern = /<div[^>]*class="[^"]*cb-col[^"]*cb-min-bat-rw[^"]*"[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>/gi;
  while ((match = batsmanPattern.exec(html)) !== null) {
    const name = match[1].trim();
    if (isValidPlayer(name)) {
      if (teamA.length <= teamB.length && teamA.length < 11 && !teamA.includes(name)) {
        teamA.push(name);
      } else if (teamB.length < 11 && !teamB.includes(name)) {
        teamB.push(name);
      }
    }
  }
  
  return { teamA, teamB };
}

function isValidPlayer(name: string): boolean {
  if (!name || name.length < 3 || name.length > 40) return false;
  
  // Must start with capital letter
  if (!/^[A-Z]/.test(name)) return false;
  
  // Should contain only letters, spaces, hyphens, apostrophes
  if (!/^[A-Za-z\s\-'()†]+$/.test(name)) return false;
  
  // Exclude common non-player text
  const excludes = [
    'live', 'scores', 'schedule', 'archive', 'stories', 'news', 'video', 
    'ranking', 'series', 'team', 'match', 'innings', 'batting', 'bowling',
    'total', 'extras', 'target', 'required', 'overs', 'wickets', 'runs',
    'cricbuzz', 'espn', 'premium', 'editorial', 'spotlight', 'opinion',
    'interview', 'analysis', 'stats', 'playlist', 'category'
  ];
  
  const lowerName = name.toLowerCase();
  for (const ex of excludes) {
    if (lowerName === ex || lowerName.includes(ex)) return false;
  }
  
  return true;
}
