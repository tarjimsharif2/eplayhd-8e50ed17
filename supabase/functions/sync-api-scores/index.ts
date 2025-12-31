import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper function to fetch with retry logic
async function fetchWithRetry(url: string, options: RequestInit, maxRetries = 3): Promise<Response> {
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      lastError = error as Error;
      console.log(`Attempt ${attempt}/${maxRetries} failed: ${error}`);
      
      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt - 1) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError || new Error('Failed to fetch after retries');
}

// Normalize team name for matching - remove special chars and lowercase
const normalizeTeamName = (name: string): string => {
  return (name || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
};

// Extract first meaningful word(s) from team name
const getTeamKeywords = (name: string): string[] => {
  const normalized = normalizeTeamName(name);
  const words = normalized.split(/\s+/).filter(w => w.length >= 3);
  return words;
};

// Flexible team name matching
const teamsMatch = (name1: string, name2: string): boolean => {
  const n1 = normalizeTeamName(name1);
  const n2 = normalizeTeamName(name2);
  
  if (!n1 || !n2) return false;
  
  // Exact match
  if (n1 === n2) return true;
  
  // One contains the other
  if (n1.includes(n2) || n2.includes(n1)) return true;
  
  // First word match (e.g., "Sydney" from "Sydney Thunder")
  const words1 = getTeamKeywords(name1);
  const words2 = getTeamKeywords(name2);
  
  for (const w1 of words1) {
    for (const w2 of words2) {
      if (w1 === w2 || (w1.length >= 4 && w2.length >= 4 && (w1.includes(w2) || w2.includes(w1)))) {
        return true;
      }
    }
  }
  
  return false;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('[sync-api-scores] Starting scheduled API score sync...');

    // Get the API key and sync interval from site_settings
    const { data: settings, error: settingsError } = await supabase
      .from('site_settings')
      .select('api_cricket_key, api_cricket_enabled, api_sync_interval_seconds')
      .limit(1)
      .maybeSingle();

    if (settingsError) {
      console.error('[sync-api-scores] Error fetching settings:', settingsError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to fetch settings' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!settings?.api_cricket_enabled || !settings?.api_cricket_key) {
      console.log('[sync-api-scores] API Cricket is disabled or not configured');
      return new Response(
        JSON.stringify({ success: false, error: 'API Cricket is disabled or not configured' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const apiKey = settings.api_cricket_key;
    const syncIntervalSeconds = settings.api_sync_interval_seconds || 120;
    
    console.log(`[sync-api-scores] Sync interval configured: ${syncIntervalSeconds} seconds`);

    // Get matches that need syncing
    const now = new Date();
    const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);
    
    const { data: matches, error: matchesError } = await supabase
      .from('matches')
      .select(`
        id,
        status,
        match_date,
        match_time,
        match_start_time,
        api_score_enabled,
        last_api_sync,
        team_a:teams!matches_team_a_id_fkey(name, short_name),
        team_b:teams!matches_team_b_id_fkey(name, short_name)
      `)
      .eq('api_score_enabled', true)
      .neq('status', 'completed')
      .order('match_date', { ascending: true });

    if (matchesError) {
      console.error('[sync-api-scores] Error fetching matches:', matchesError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to fetch matches' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!matches || matches.length === 0) {
      console.log('[sync-api-scores] No matches to sync');
      return new Response(
        JSON.stringify({ success: true, message: 'No matches to sync', synced: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Filter matches that should be synced
    const matchesToSync = matches.filter(match => {
      if (match.last_api_sync) {
        const lastSyncTime = new Date(match.last_api_sync).getTime();
        const timeSinceLastSync = now.getTime() - lastSyncTime;
        if (timeSinceLastSync < syncIntervalSeconds * 1000) {
          console.log(`[sync-api-scores] Skipping match ${match.id} - synced ${Math.round(timeSinceLastSync / 1000)}s ago`);
          return false;
        }
      }
      
      if (match.status === 'live') return true;
      
      if (match.status === 'upcoming') {
        let matchDateTime: Date | null = null;
        
        if (match.match_start_time) {
          matchDateTime = new Date(match.match_start_time);
        } else if (match.match_date && match.match_time) {
          matchDateTime = new Date(`${match.match_date}T${match.match_time}`);
        }
        
        if (matchDateTime && matchDateTime <= fiveMinutesFromNow) {
          return true;
        }
      }
      
      return false;
    });

    console.log(`[sync-api-scores] Found ${matchesToSync.length} matches to sync`);

    if (matchesToSync.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No matches need syncing right now', synced: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch events from API
    const today = new Date().toISOString().split('T')[0];
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 1);
    const pastDateStr = pastDate.toISOString().split('T')[0];
    
    const apiUrl = `https://apiv2.api-cricket.com/cricket/?method=get_events&APIkey=${apiKey}&date_start=${pastDateStr}&date_stop=${today}`;
    
    console.log(`[sync-api-scores] Fetching events from API...`);
    
    const response = await fetchWithRetry(apiUrl, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      console.error(`[sync-api-scores] API error: ${response.status}`);
      return new Response(
        JSON.stringify({ success: false, error: 'API request failed' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const apiData = await response.json();
    
    if (!apiData.success || apiData.success !== 1) {
      console.error('[sync-api-scores] API returned unsuccessful response');
      return new Response(
        JSON.stringify({ success: false, error: 'API returned unsuccessful response' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const events = apiData.result || [];
    console.log(`[sync-api-scores] Got ${events.length} events from API`);

    let syncedCount = 0;

    // Process each match
    for (const match of matchesToSync) {
      const teamA = (match.team_a as unknown as { name: string; short_name: string }) || null;
      const teamB = (match.team_b as unknown as { name: string; short_name: string }) || null;
      const teamAName = teamA?.name || '';
      const teamBName = teamB?.name || '';
      const teamAShort = teamA?.short_name || '';
      const teamBShort = teamB?.short_name || '';

      // Find matching event
      const matchingEvent = events.find((event: any) => {
        const homeTeam = event.event_home_team || '';
        const awayTeam = event.event_away_team || '';
        
        // Check if both our teams are found in the event
        const teamAMatches = teamsMatch(teamAName, homeTeam) || teamsMatch(teamAName, awayTeam) ||
                           teamsMatch(teamAShort, homeTeam) || teamsMatch(teamAShort, awayTeam);
        const teamBMatches = teamsMatch(teamBName, homeTeam) || teamsMatch(teamBName, awayTeam) ||
                           teamsMatch(teamBShort, homeTeam) || teamsMatch(teamBShort, awayTeam);
        
        return teamAMatches && teamBMatches;
      });

      if (!matchingEvent) {
        console.log(`[sync-api-scores] No matching event found for ${teamAName} vs ${teamBName}`);
        continue;
      }

      console.log(`[sync-api-scores] Found match: ${matchingEvent.event_home_team} vs ${matchingEvent.event_away_team}`);

      // Fetch detailed scorecard
      let detailedEvent = matchingEvent;
      if (matchingEvent.event_key && !matchingEvent.scorecard) {
        const detailUrl = `https://apiv2.api-cricket.com/cricket/?method=get_events&APIkey=${apiKey}&date_start=${matchingEvent.event_date_start || today}&date_stop=${matchingEvent.event_date_start || today}&event_key=${matchingEvent.event_key}`;
        
        try {
          const detailResponse = await fetchWithRetry(detailUrl, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
          });
          
          if (detailResponse.ok) {
            const detailData = await detailResponse.json();
            if (detailData.success === 1 && detailData.result?.length > 0) {
              detailedEvent = detailData.result[0];
            }
          }
        } catch (err) {
          console.log(`[sync-api-scores] Failed to fetch detailed event: ${err}`);
        }
      }

      // Parse scorecard data - collect ALL data with proper team/innings info
      let batsmen: any[] = [];
      let bowlers: any[] = [];
      let extras: any[] = [];
      
      // Track unique innings and their team names from the scorecard
      const inningsTeamMap: Map<string, string> = new Map();
      
      if (detailedEvent.scorecard && typeof detailedEvent.scorecard === 'object') {
        Object.entries(detailedEvent.scorecard).forEach(([inningsKey, players]: [string, any]) => {
          if (Array.isArray(players)) {
            // Extract team name from innings key (e.g., "Sydney Thunder 1 INN" -> "Sydney Thunder")
            const inningsTeamName = inningsKey.replace(/ \d+ INN$/i, '').trim();
            inningsTeamMap.set(inningsKey, inningsTeamName);
            
            players.forEach((player: any) => {
              if (player.type === 'Batsman') {
                batsmen.push({
                  player: player.player,
                  runs: player.R || '0',
                  balls: player.B || '0',
                  fours: player['4s'] || '0',
                  sixes: player['6s'] || '0',
                  sr: player.SR || '0.00',
                  how_out: player.status || 'not out',
                  team: inningsTeamName,
                  innings: inningsKey,
                });
              } else if (player.type === 'Bowler') {
                bowlers.push({
                  player: player.player,
                  overs: player.O || '0',
                  maidens: player.M || '0',
                  runs: player.R || '0',
                  wickets: player.W || '0',
                  econ: player.ER || '0.00',
                  team: inningsTeamName,
                  innings: inningsKey,
                });
              }
            });
          }
        });
      }

      // Parse extras data
      if (detailedEvent.extra && typeof detailedEvent.extra === 'object') {
        Object.entries(detailedEvent.extra).forEach(([inningsKey, extrasData]: [string, any]) => {
          const inningsTeamName = inningsKey.replace(/ \d+ INN$/i, '').trim();
          if (Array.isArray(extrasData) && extrasData.length > 0) {
            const firstEntry = extrasData[0];
            extras.push({
              innings: inningsKey,
              team: inningsTeamName,
              wides: parseInt(firstEntry.wides) || 0,
              noballs: parseInt(firstEntry.noballs) || 0,
              byes: parseInt(firstEntry.byes) || 0,
              legbyes: parseInt(firstEntry.legbyes) || 0,
              total: parseInt(firstEntry.extras_total) || 0,
              total_overs: firstEntry.total_overs || null,
            });
          }
        });
      }

      console.log(`[sync-api-scores] Parsed ${batsmen.length} batsmen, ${bowlers.length} bowlers from scorecard`);
      console.log(`[sync-api-scores] Innings found: ${[...inningsTeamMap.entries()].map(([k, v]) => `${k}="${v}"`).join(', ')}`);

      // Fetch Playing XI from API if not already saved
      // Check if playing XI already exists for this match
      const { data: existingPlayingXI, error: playingXICheckError } = await supabase
        .from('match_playing_xi')
        .select('id')
        .eq('match_id', match.id)
        .limit(1);
      
      const hasPlayingXI = existingPlayingXI && existingPlayingXI.length > 0;
      
      // If match is live and no playing XI exists, try to fetch and save it
      if (match.status === 'live' && !hasPlayingXI) {
        console.log(`[sync-api-scores] Attempting to save Playing XI for match ${match.id}...`);
        
        try {
          const playersToInsert: any[] = [];
          
          // Get team IDs from the match
          const { data: matchData } = await supabase
            .from('matches')
            .select('team_a_id, team_b_id')
            .eq('id', match.id)
            .single();
          
          if (matchData) {
            // Check if API has lineup data
            if (detailedEvent.lineup) {
              const lineup = detailedEvent.lineup;
              
              // Process home team lineup
              if (lineup.home && lineup.home.starting_lineups) {
                const homeLineup = lineup.home.starting_lineups;
                let battingOrder = 1;
                
                for (const player of homeLineup) {
                  const homeTeamName = detailedEvent.event_home_team || '';
                  let teamId = matchData.team_a_id;
                  
                  if (teamsMatch(homeTeamName, teamBName) || teamsMatch(homeTeamName, teamBShort)) {
                    teamId = matchData.team_b_id;
                  }
                  
                  playersToInsert.push({
                    match_id: match.id,
                    team_id: teamId,
                    player_name: player.lineup_player || player.player_name || 'Unknown',
                    player_role: player.player_type || player.lineup_position || null,
                    is_captain: player.lineup_captain === '1' || player.is_captain === true,
                    is_vice_captain: player.lineup_vice_captain === '1' || player.is_vice_captain === true,
                    is_wicket_keeper: (player.player_type || '').toLowerCase().includes('keeper') || 
                                     (player.lineup_position || '').toLowerCase().includes('keeper'),
                    batting_order: battingOrder++,
                  });
                }
              }
              
              // Process away team lineup
              if (lineup.away && lineup.away.starting_lineups) {
                const awayLineup = lineup.away.starting_lineups;
                let battingOrder = 1;
                
                for (const player of awayLineup) {
                  const awayTeamName = detailedEvent.event_away_team || '';
                  let teamId = matchData.team_b_id;
                  
                  if (teamsMatch(awayTeamName, teamAName) || teamsMatch(awayTeamName, teamAShort)) {
                    teamId = matchData.team_a_id;
                  }
                  
                  playersToInsert.push({
                    match_id: match.id,
                    team_id: teamId,
                    player_name: player.lineup_player || player.player_name || 'Unknown',
                    player_role: player.player_type || player.lineup_position || null,
                    is_captain: player.lineup_captain === '1' || player.is_captain === true,
                    is_vice_captain: player.lineup_vice_captain === '1' || player.is_vice_captain === true,
                    is_wicket_keeper: (player.player_type || '').toLowerCase().includes('keeper') || 
                                     (player.lineup_position || '').toLowerCase().includes('keeper'),
                    batting_order: battingOrder++,
                  });
                }
              }
              
              console.log(`[sync-api-scores] Found ${playersToInsert.length} players from lineup data`);
            }
            
            // If no lineup from API, generate from scorecard (batsmen + bowlers)
            if (playersToInsert.length === 0 && (batsmen.length > 0 || bowlers.length > 0)) {
              console.log(`[sync-api-scores] No lineup data from API, generating from scorecard...`);
              
              // Group players by team from scorecard
              const teamAPlayers = new Map<string, { role: string; order: number; isWicketKeeper: boolean }>();
              const teamBPlayers = new Map<string, { role: string; order: number; isWicketKeeper: boolean }>();
              
              // Helper to extract fielder names from dismissal text
              const extractFielderFromDismissal = (howOut: string): { fielder: string | null; isWicketKeeper: boolean } => {
                if (!howOut) return { fielder: null, isWicketKeeper: false };
                
                const howOutLower = howOut.toLowerCase();
                
                // Caught patterns: "c PlayerName b BowlerName" or "c & b PlayerName"
                const caughtMatch = howOut.match(/c\s+(?:&\s+b\s+)?([A-Z][a-zA-Z\s'-]+?)(?:\s+b\s+|$)/i);
                if (caughtMatch && caughtMatch[1]) {
                  const fielder = caughtMatch[1].trim();
                  // Check if caught by wicketkeeper (common indicators)
                  const isWk = howOutLower.includes('†') || howOutLower.includes('wk ');
                  return { fielder, isWicketKeeper: isWk };
                }
                
                // Stumped pattern: "st PlayerName b BowlerName"
                const stumpedMatch = howOut.match(/st\s+([A-Z][a-zA-Z\s'-]+?)\s+b\s+/i);
                if (stumpedMatch && stumpedMatch[1]) {
                  return { fielder: stumpedMatch[1].trim(), isWicketKeeper: true };
                }
                
                // Run out pattern: "run out (PlayerName)" or "run out PlayerName"
                const runOutMatch = howOut.match(/run\s+out\s*\(?([A-Z][a-zA-Z\s'-]+?)\)?(?:\s*\/|$)/i);
                if (runOutMatch && runOutMatch[1]) {
                  return { fielder: runOutMatch[1].trim(), isWicketKeeper: false };
                }
                
                return { fielder: null, isWicketKeeper: false };
              };
              
              // Process batsmen first (they get batting order based on their position)
              batsmen.forEach((b, index) => {
                const playerName = b.player || 'Unknown';
                const batsmanTeamName = b.team || '';
                
                // Check which team this batsman belongs to
                if (teamsMatch(batsmanTeamName, teamAName) || teamsMatch(batsmanTeamName, teamAShort)) {
                  if (!teamAPlayers.has(playerName)) {
                    teamAPlayers.set(playerName, { role: 'Batsman', order: teamAPlayers.size + 1, isWicketKeeper: false });
                  }
                  
                  // Extract fielder from dismissal (fielder is from Team B)
                  const { fielder, isWicketKeeper } = extractFielderFromDismissal(b.how_out || '');
                  if (fielder && !teamBPlayers.has(fielder)) {
                    teamBPlayers.set(fielder, { role: 'Fielder', order: teamBPlayers.size + 1, isWicketKeeper });
                  }
                } else if (teamsMatch(batsmanTeamName, teamBName) || teamsMatch(batsmanTeamName, teamBShort)) {
                  if (!teamBPlayers.has(playerName)) {
                    teamBPlayers.set(playerName, { role: 'Batsman', order: teamBPlayers.size + 1, isWicketKeeper: false });
                  }
                  
                  // Extract fielder from dismissal (fielder is from Team A)
                  const { fielder, isWicketKeeper } = extractFielderFromDismissal(b.how_out || '');
                  if (fielder && !teamAPlayers.has(fielder)) {
                    teamAPlayers.set(fielder, { role: 'Fielder', order: teamAPlayers.size + 1, isWicketKeeper });
                  }
                }
              });
              
              // Process bowlers (they're actually FROM the opposite team's scorecard section)
              // In cricket scorecard, bowlers listed in "Team A 1 INN" are BOWLING against Team A (so they're from Team B)
              bowlers.forEach((b) => {
                const playerName = b.player || 'Unknown';
                const bowlerInningsTeam = b.team || ''; // This is the batting team's innings
                
                // Bowlers in Team A's innings are FROM Team B
                if (teamsMatch(bowlerInningsTeam, teamAName) || teamsMatch(bowlerInningsTeam, teamAShort)) {
                  // This bowler is from Team B (bowling against Team A)
                  if (!teamBPlayers.has(playerName)) {
                    teamBPlayers.set(playerName, { role: 'Bowler', order: teamBPlayers.size + 1, isWicketKeeper: false });
                  }
                } else if (teamsMatch(bowlerInningsTeam, teamBName) || teamsMatch(bowlerInningsTeam, teamBShort)) {
                  // This bowler is from Team A (bowling against Team B)
                  if (!teamAPlayers.has(playerName)) {
                    teamAPlayers.set(playerName, { role: 'Bowler', order: teamAPlayers.size + 1, isWicketKeeper: false });
                  }
                }
              });
              
              console.log(`[sync-api-scores] Extracted ${teamAPlayers.size} players for Team A, ${teamBPlayers.size} players for Team B from scorecard`);
              
              // Convert to insert format - Team A (limit to 11 players)
              let teamACount = 0;
              teamAPlayers.forEach((info, playerName) => {
                if (teamACount < 11) {
                  playersToInsert.push({
                    match_id: match.id,
                    team_id: matchData.team_a_id,
                    player_name: playerName,
                    player_role: info.role,
                    is_captain: false,
                    is_vice_captain: false,
                    is_wicket_keeper: info.isWicketKeeper || info.role.toLowerCase().includes('keeper'),
                    batting_order: info.order,
                  });
                  teamACount++;
                }
              });
              
              // Convert to insert format - Team B (limit to 11 players)
              let teamBCount = 0;
              teamBPlayers.forEach((info, playerName) => {
                if (teamBCount < 11) {
                  playersToInsert.push({
                    match_id: match.id,
                    team_id: matchData.team_b_id,
                    player_name: playerName,
                    player_role: info.role,
                    is_captain: false,
                    is_vice_captain: false,
                    is_wicket_keeper: info.isWicketKeeper || info.role.toLowerCase().includes('keeper'),
                    batting_order: info.order,
                  });
                  teamBCount++;
                }
              });
              
              console.log(`[sync-api-scores] Final count: Team A=${teamACount}, Team B=${teamBCount} players`);
            }
            
            // If we have players to insert, save them
            if (playersToInsert.length > 0) {
              console.log(`[sync-api-scores] Saving ${playersToInsert.length} players to playing XI...`);
              
              const { error: insertError } = await supabase
                .from('match_playing_xi')
                .insert(playersToInsert);
              
              if (insertError) {
                console.error(`[sync-api-scores] Error inserting playing XI:`, insertError);
              } else {
                console.log(`[sync-api-scores] Successfully saved playing XI for match ${match.id}`);
              }
            } else {
              console.log(`[sync-api-scores] No players found to save for playing XI`);
            }
          }
        } catch (lineupError) {
          console.log(`[sync-api-scores] Could not process lineup:`, lineupError);
        }
      } else if (hasPlayingXI) {
        console.log(`[sync-api-scores] Playing XI already exists for match ${match.id}, skipping...`);
      }

      // Calculate scores from batsmen and overs from bowlers per innings
      interface InningsStats {
        inningsName: string;
        teamName: string;
        totalRuns: number;
        wickets: number;
        overs: string | null;
        scoreWithOvers: string;
      }
      
      const inningsStats: InningsStats[] = [];
      const uniqueInnings = [...inningsTeamMap.keys()];
      
      for (const inningsName of uniqueInnings) {
        const teamName = inningsTeamMap.get(inningsName) || '';
        const inningsBatsmen = batsmen.filter(b => b.innings === inningsName);
        
        // Calculate total runs from batsmen
        let totalRuns = 0;
        let wickets = 0;
        
        inningsBatsmen.forEach(b => {
          totalRuns += parseInt(b.runs) || 0;
          if (b.how_out && b.how_out.toLowerCase() !== 'not out') {
            wickets++;
          }
        });
        
        // Add extras for this innings
        const inningsExtras = extras.find(e => e.innings === inningsName);
        if (inningsExtras) {
          totalRuns += inningsExtras.total || 0;
        }
        
        // Calculate overs from BOWLERS data for THIS innings
        // Note: bowlers in an innings are bowling AGAINST the batting team
        // So we need to find bowlers from the OTHER innings that bowled against this batting team
        const inningsBowlers = bowlers.filter(b => b.innings === inningsName);
        let totalBalls = 0;
        
        inningsBowlers.forEach(b => {
          const overs = parseFloat(b.overs) || 0;
          const fullOvers = Math.floor(overs);
          const balls = Math.round((overs - fullOvers) * 10);
          totalBalls += (fullOvers * 6) + balls;
        });
        
        const fullOvers = Math.floor(totalBalls / 6);
        const remainingBalls = totalBalls % 6;
        const oversStr = totalBalls > 0 
          ? (remainingBalls > 0 ? `${fullOvers}.${remainingBalls}` : `${fullOvers}`)
          : null;
        
        const scoreStr = `${totalRuns}/${wickets}`;
        const scoreWithOvers = oversStr ? `${scoreStr} (${oversStr} ov)` : scoreStr;
        
        console.log(`[sync-api-scores] Innings "${inningsName}" (team: "${teamName}"): ${scoreWithOvers} from ${inningsBatsmen.length} batsmen, ${inningsBowlers.length} bowlers`);
        
        inningsStats.push({
          inningsName,
          teamName,
          totalRuns,
          wickets,
          overs: oversStr,
          scoreWithOvers,
        });
      }

      // NOW: Match innings to teamA/teamB directly based on team names from scorecard
      // NOT using home/away at all
      let scoreA: string | null = null;
      let scoreB: string | null = null;
      let oversA: string | null = null;
      let oversB: string | null = null;
      
      // Track all scores for each team (for Test matches with multiple innings)
      const teamAScores: string[] = [];
      const teamBScores: string[] = [];
      
      for (const stats of inningsStats) {
        // Check if this innings belongs to teamA
        if (teamsMatch(stats.teamName, teamAName) || teamsMatch(stats.teamName, teamAShort)) {
          teamAScores.push(stats.scoreWithOvers);
          // Use latest/last innings with actual data
          if (stats.totalRuns > 0 || stats.wickets > 0) {
            scoreA = stats.scoreWithOvers;
            oversA = stats.overs;
            console.log(`[sync-api-scores] Matched innings "${stats.teamName}" -> teamA "${teamAName}": ${scoreA}`);
          }
        }
        // Check if this innings belongs to teamB
        else if (teamsMatch(stats.teamName, teamBName) || teamsMatch(stats.teamName, teamBShort)) {
          teamBScores.push(stats.scoreWithOvers);
          // Use latest/last innings with actual data
          if (stats.totalRuns > 0 || stats.wickets > 0) {
            scoreB = stats.scoreWithOvers;
            oversB = stats.overs;
            console.log(`[sync-api-scores] Matched innings "${stats.teamName}" -> teamB "${teamBName}": ${scoreB}`);
          }
        } else {
          console.log(`[sync-api-scores] Could not match innings team "${stats.teamName}" to either "${teamAName}" or "${teamBName}"`);
        }
      }

      // For Test matches or multi-innings, concatenate all scores
      if (teamAScores.length > 1) {
        scoreA = teamAScores.join(' & ');
      }
      if (teamBScores.length > 1) {
        scoreB = teamBScores.join(' & ');
      }

      // Also store home/away for the API scores table (for compatibility)
      // But we derive these FROM the scorecard teams, not API's home/away
      let homeScore: string | null = null;
      let homeOvers: string | null = null;
      let awayScore: string | null = null;
      let awayOvers: string | null = null;
      
      const apiHomeTeam = detailedEvent.event_home_team || '';
      const apiAwayTeam = detailedEvent.event_away_team || '';
      
      for (const stats of inningsStats) {
        if (teamsMatch(stats.teamName, apiHomeTeam)) {
          homeScore = homeScore ? `${homeScore} & ${stats.scoreWithOvers}` : stats.scoreWithOvers;
          homeOvers = stats.overs;
        } else if (teamsMatch(stats.teamName, apiAwayTeam)) {
          awayScore = awayScore ? `${awayScore} & ${stats.scoreWithOvers}` : stats.scoreWithOvers;
          awayOvers = stats.overs;
        }
      }

      // Fallback only if no scorecard data at all
      if (!homeScore && !awayScore && detailedEvent.event_home_final_result) {
        homeScore = detailedEvent.event_home_final_result;
        awayScore = detailedEvent.event_away_final_result;
      }

      console.log(`[sync-api-scores] Final scores: scoreA="${scoreA}", scoreB="${scoreB}" | home="${homeScore}", away="${awayScore}"`);

      // Determine match status
      let matchStatus: 'upcoming' | 'live' | 'completed' = 'upcoming';
      if (detailedEvent.event_live === '1') {
        matchStatus = 'live';
      } else if (detailedEvent.event_status === 'Finished' || detailedEvent.event_final_result) {
        matchStatus = 'completed';
      }

      // Upsert to match_api_scores
      const { error: upsertError } = await supabase
        .from('match_api_scores')
        .upsert({
          match_id: match.id,
          home_team: detailedEvent.event_home_team,
          away_team: detailedEvent.event_away_team,
          home_score: homeScore,
          away_score: awayScore,
          home_overs: homeOvers,
          away_overs: awayOvers,
          status: detailedEvent.event_status,
          status_info: detailedEvent.event_status_info,
          event_live: detailedEvent.event_live === '1',
          venue: detailedEvent.event_stadium,
          toss: detailedEvent.event_toss,
          batsmen: batsmen,
          bowlers: bowlers,
          extras: extras,
          api_event_key: detailedEvent.event_key,
          last_synced_at: new Date().toISOString(),
        }, {
          onConflict: 'match_id',
        });

      if (upsertError) {
        console.error(`[sync-api-scores] Error upserting score for match ${match.id}:`, upsertError);
        continue;
      }

      // UPDATE matches table with correct teamA/teamB scores (from batsmen data)
      const matchUpdate: any = { 
        last_api_sync: new Date().toISOString(),
      };
      
      if (scoreA) matchUpdate.score_a = scoreA;
      if (scoreB) matchUpdate.score_b = scoreB;
      if (match.status !== matchStatus) matchUpdate.status = matchStatus;

      await supabase
        .from('matches')
        .update(matchUpdate)
        .eq('id', match.id);

      console.log(`[sync-api-scores] Synced match: ${teamAName} (${scoreA}) vs ${teamBName} (${scoreB})`);
      syncedCount++;
    }

    console.log(`[sync-api-scores] Sync complete. ${syncedCount} matches synced.`);

    return new Response(
      JSON.stringify({ success: true, synced: syncedCount }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[sync-api-scores] Unexpected error:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Unexpected error occurred' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
