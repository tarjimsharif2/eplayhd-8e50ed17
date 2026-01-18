import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { verifyAdminAuth, unauthorizedResponse, forbiddenResponse } from '../_shared/auth.ts';

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

// Common team name aliases for international teams
const teamAliases: Record<string, string[]> = {
  'australia': ['aus', 'australian', 'aussies', 'australia men', 'australia women'],
  'england': ['eng', 'english', 'england men', 'england women', 'england lions'],
  'india': ['ind', 'indian', 'india men', 'india women', 'team india'],
  'pakistan': ['pak', 'pakistani', 'pakistan men', 'pakistan women'],
  'south africa': ['sa', 'rsa', 'south african', 'proteas', 'south africa men'],
  'new zealand': ['nz', 'nzl', 'kiwis', 'black caps', 'blackcaps', 'new zealand men'],
  'west indies': ['wi', 'windies', 'caribbean', 'west indies men'],
  'sri lanka': ['sl', 'srilanka', 'sri lankan', 'sri lanka men'],
  'bangladesh': ['ban', 'bd', 'bangladeshi', 'tigers', 'bangladesh men'],
  'afghanistan': ['afg', 'afghan', 'afghanistan men'],
  'zimbabwe': ['zim', 'zimbabwean', 'zimbabwe men'],
  'ireland': ['ire', 'irish', 'ireland men'],
  'scotland': ['sco', 'scottish', 'scotland men'],
  'netherlands': ['ned', 'holland', 'dutch', 'netherlands men'],
  'uae': ['united arab emirates', 'emirates'],
  'usa': ['united states', 'america', 'american'],
};

// Get canonical team name
const getCanonicalName = (name: string): string => {
  const normalized = normalizeTeamName(name);
  
  // Check if it matches any alias
  for (const [canonical, aliases] of Object.entries(teamAliases)) {
    if (normalized === canonical || aliases.includes(normalized)) {
      return canonical;
    }
    // Also check if the normalized name starts with the canonical name
    if (normalized.startsWith(canonical + ' ') || normalized.endsWith(' ' + canonical)) {
      return canonical;
    }
    // Check if any alias is contained
    for (const alias of aliases) {
      if (normalized === alias || normalized.startsWith(alias + ' ') || normalized.endsWith(' ' + alias)) {
        return canonical;
      }
    }
  }
  
  return normalized;
};

// IMPROVED team name matching
// Handles international team aliases and partial matches
const teamsMatch = (name1: string, name2: string): boolean => {
  const n1 = normalizeTeamName(name1);
  const n2 = normalizeTeamName(name2);
  
  if (!n1 || !n2) return false;
  
  // Exact match
  if (n1 === n2) return true;
  
  // Canonical name match (handles aliases like AUS = Australia)
  const canonical1 = getCanonicalName(n1);
  const canonical2 = getCanonicalName(n2);
  if (canonical1 === canonical2) return true;
  
  // Check if one contains the other (for cases like "Australia" matching "Australia Men")
  if (n1.includes(n2) || n2.includes(n1)) return true;
  
  const words1 = n1.split(' ').filter(w => w.length > 0);
  const words2 = n2.split(' ').filter(w => w.length > 0);
  
  // If either is a short code (3 chars or less, single word), check aliases
  if (words1.length === 1 && n1.length <= 3) {
    // Check if short code matches any alias
    for (const [canonical, aliases] of Object.entries(teamAliases)) {
      if (aliases.includes(n1) && (n2.includes(canonical) || canonical2 === canonical)) {
        return true;
      }
    }
    return false;
  }
  if (words2.length === 1 && n2.length <= 3) {
    for (const [canonical, aliases] of Object.entries(teamAliases)) {
      if (aliases.includes(n2) && (n1.includes(canonical) || canonical1 === canonical)) {
        return true;
      }
    }
    return false;
  }
  
  // Get first and last words
  const firstWord1 = words1[0];
  const lastWord1 = words1[words1.length - 1];
  const firstWord2 = words2[0];
  const lastWord2 = words2[words2.length - 1];
  
  // If both have 2+ words, BOTH first AND last words must match
  if (words1.length >= 2 && words2.length >= 2) {
    return firstWord1 === firstWord2 && lastWord1 === lastWord2;
  }
  
  // If one is single word (4+ chars), check if it matches either first or last word of the other
  if (words1.length === 1 && n1.length >= 4) {
    return firstWord2 === words1[0] || lastWord2 === words1[0];
  }
  if (words2.length === 1 && n2.length >= 4) {
    return firstWord1 === words2[0] || lastWord1 === words2[0];
  }
  
  return false;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // This is a scheduled/cron function - allow calls from:
  // 1. Valid cron secret via x-cron-secret header
  // 2. Internal pg_cron calls (no auth or anon key)
  // 3. Valid admin user authentication (for manual triggers)
  
  const cronSecret = req.headers.get('x-cron-secret');
  const expectedCronSecret = Deno.env.get('CRON_SECRET_TOKEN');
  const authHeader = req.headers.get('authorization');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  
  // Check if this is a cron secret call
  const isCronSecretCall = cronSecret && cronSecret === expectedCronSecret;
  // Check if this is an internal call (no auth or using anon key - pg_cron uses anon key)
  const isInternalCall = !authHeader || (authHeader && authHeader.replace('Bearer ', '') === anonKey);
  
  if (isCronSecretCall) {
    console.log('[sync-api-scores] Authenticated via cron secret');
  } else if (isInternalCall) {
    console.log('[sync-api-scores] Internal/cron call (anon key or no auth)');
  } else {
    // Has non-anon auth header - verify admin authentication
    const { user, error: authError } = await verifyAdminAuth(req);
    if (authError) {
      console.log('[sync-api-scores] Auth failed:', authError);
      if (authError === 'Admin access required') {
        return forbiddenResponse(authError, corsHeaders);
      }
      return unauthorizedResponse(authError, corsHeaders);
    }
    console.log(`[sync-api-scores] Authenticated admin: ${user.id}`);
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
    
    // Include recently completed matches (within last 30 minutes) to ensure final scores are synced
    // This prevents the issue where second innings data stops syncing when match completes
    const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000);
    
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
        updated_at,
        team_a:teams!matches_team_a_id_fkey(name, short_name),
        team_b:teams!matches_team_b_id_fkey(name, short_name)
      `)
      .eq('api_score_enabled', true)
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
      // Skip matches that are completed for more than 30 minutes
      if (match.status === 'completed') {
        const updatedAt = new Date(match.updated_at || match.last_api_sync || 0);
        if (updatedAt < thirtyMinutesAgo) {
          console.log(`[sync-api-scores] Skipping completed match ${match.id} - completed more than 30 mins ago`);
          return false;
        }
        // For recently completed matches, do one final sync if not synced after completion
        console.log(`[sync-api-scores] Recently completed match ${match.id} - checking for final sync`);
      }
      
      if (match.last_api_sync) {
        const lastSyncTime = new Date(match.last_api_sync).getTime();
        const timeSinceLastSync = now.getTime() - lastSyncTime;
        if (timeSinceLastSync < syncIntervalSeconds * 1000) {
          console.log(`[sync-api-scores] Skipping match ${match.id} - synced ${Math.round(timeSinceLastSync / 1000)}s ago`);
          return false;
        }
      }
      
      if (match.status === 'live') return true;
      
      // Include recently completed matches for final sync
      if (match.status === 'completed') {
        const updatedAt = new Date(match.updated_at || match.last_api_sync || 0);
        return updatedAt >= thirtyMinutesAgo;
      }
      
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
    
    // Log all unique team names from API for debugging
    const apiTeams = new Set<string>();
    events.forEach((e: any) => {
      if (e.event_home_team) apiTeams.add(e.event_home_team);
      if (e.event_away_team) apiTeams.add(e.event_away_team);
    });
    console.log(`[sync-api-scores] API Teams: ${Array.from(apiTeams).join(', ')}`);

    let syncedCount = 0;

    // Process each match
    for (const match of matchesToSync) {
      const teamA = (match.team_a as unknown as { name: string; short_name: string }) || null;
      const teamB = (match.team_b as unknown as { name: string; short_name: string }) || null;
      const teamAName = teamA?.name || '';
      const teamBName = teamB?.name || '';
      const teamAShort = teamA?.short_name || '';
      const teamBShort = teamB?.short_name || '';
      
      console.log(`[sync-api-scores] Looking for: "${teamAName}" (${teamAShort}) vs "${teamBName}" (${teamBShort})`);

      // Find matching event with debug
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
      
      // Determine the bowling team (opponent of batting team)
      const getBowlingTeam = (battingTeamName: string): string => {
        // Check which team is batting and return the other team
        if (teamsMatch(battingTeamName, teamAName) || teamsMatch(battingTeamName, teamAShort)) {
          return teamBName;
        } else if (teamsMatch(battingTeamName, teamBName) || teamsMatch(battingTeamName, teamBShort)) {
          return teamAName;
        }
        // Fallback: check against API home/away teams
        const apiHomeTeam = detailedEvent.event_home_team || '';
        const apiAwayTeam = detailedEvent.event_away_team || '';
        if (teamsMatch(battingTeamName, apiHomeTeam)) {
          return apiAwayTeam;
        } else if (teamsMatch(battingTeamName, apiAwayTeam)) {
          return apiHomeTeam;
        }
        return battingTeamName; // fallback
      };
      
      if (detailedEvent.scorecard && typeof detailedEvent.scorecard === 'object') {
        Object.entries(detailedEvent.scorecard).forEach(([inningsKey, players]: [string, any]) => {
          if (Array.isArray(players)) {
            // Extract team name from innings key (e.g., "Sydney Thunder 1 INN" -> "Sydney Thunder")
            const battingTeamName = inningsKey.replace(/ \d+ INN$/i, '').trim();
            const bowlingTeamName = getBowlingTeam(battingTeamName);
            inningsTeamMap.set(inningsKey, battingTeamName);
            
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
                  team: battingTeamName,
                  innings: inningsKey,
                });
              } else if (player.type === 'Bowler') {
                // Bowlers belong to the OPPONENT team (the one bowling)
                bowlers.push({
                  player: player.player,
                  overs: player.O || '0',
                  maidens: player.M || '0',
                  runs: player.R || '0',
                  wickets: player.W || '0',
                  econ: player.ER || '0.00',
                  team: bowlingTeamName,
                  innings: inningsKey,
                });
              }
            });
          }
        });
      }

      // Parse extras data - try multiple formats
      // API format example: {"text":"(w 3, lb 3)","total":"147 ( 16.5 )","total_overs":"16.5"}
      if (detailedEvent.extra && typeof detailedEvent.extra === 'object') {
        console.log(`[sync-api-scores] Raw extras data: ${JSON.stringify(detailedEvent.extra)}`);
        
        Object.entries(detailedEvent.extra).forEach(([inningsKey, extrasData]: [string, any]) => {
          const inningsTeamName = inningsKey.replace(/ \d+ INN$/i, '').trim();
          
          // Handle array format
          if (Array.isArray(extrasData) && extrasData.length > 0) {
            const firstEntry = extrasData[0];
            console.log(`[sync-api-scores] Raw extras entry for "${inningsKey}": ${JSON.stringify(firstEntry)}`);
            
            // Parse extras from "text" field if available (format: "(w 3, lb 3, nb 1, b 2)")
            let wides = 0, noballs = 0, byes = 0, legbyes = 0, penalty = 0;
            
            if (firstEntry.text && typeof firstEntry.text === 'string') {
              const textLower = firstEntry.text.toLowerCase();
              // Match patterns like "w 3", "lb 5", "nb 2", "b 1", "p 0"
              // IMPORTANT: Match lb/nb BEFORE b to avoid incorrect matches
              const widesMatch = textLower.match(/\bw\s+(\d+)/);
              const noballsMatch = textLower.match(/\bnb\s+(\d+)/);
              const legbyesMatch = textLower.match(/\blb\s+(\d+)/);
              const penaltyMatch = textLower.match(/\bp\s+(\d+)/);
              // For byes, match standalone "b" followed by space and number, but NOT "lb" or "nb"
              const byesMatch = textLower.match(/(?<![ln])b\s+(\d+)/);
              
              wides = widesMatch ? parseInt(widesMatch[1]) : 0;
              noballs = noballsMatch ? parseInt(noballsMatch[1]) : 0;
              legbyes = legbyesMatch ? parseInt(legbyesMatch[1]) : 0;
              byes = byesMatch ? parseInt(byesMatch[1]) : 0;
              penalty = penaltyMatch ? parseInt(penaltyMatch[1]) : 0;
              
              console.log(`[sync-api-scores] Parsed from text "${firstEntry.text}": w=${wides}, nb=${noballs}, b=${byes}, lb=${legbyes}, total_extras=${wides + noballs + byes + legbyes + penalty}`);
            } else {
              // Fallback to direct field access
              wides = parseInt(firstEntry.wides || firstEntry.Wides || firstEntry.wd || firstEntry.W || 0) || 0;
              noballs = parseInt(firstEntry.noballs || firstEntry.NoBalls || firstEntry.nb || firstEntry.NB || 0) || 0;
              byes = parseInt(firstEntry.byes || firstEntry.Byes || firstEntry.b || firstEntry.B || 0) || 0;
              legbyes = parseInt(firstEntry.legbyes || firstEntry.LegByes || firstEntry.lb || firstEntry.LB || 0) || 0;
              penalty = parseInt(firstEntry.penalty || firstEntry.Penalty || firstEntry.p || firstEntry.P || 0) || 0;
            }
            
            // Parse total from "total" field - format may be "147 ( 16.5 )" or just a number
            let totalRuns = 0;
            let totalOvers = firstEntry.total_overs || null;
            
            if (firstEntry.total && typeof firstEntry.total === 'string') {
              // Extract runs from format "147 ( 16.5 )" or "147"
              const totalMatch = firstEntry.total.match(/^(\d+)/);
              if (totalMatch) {
                totalRuns = parseInt(totalMatch[1]) || 0;
              }
              // Also try to extract overs if present
              const oversMatch = firstEntry.total.match(/\(\s*([\d.]+)\s*\)/);
              if (oversMatch && !totalOvers) {
                totalOvers = oversMatch[1];
              }
            } else {
              totalRuns = parseInt(firstEntry.total || firstEntry.Total || 0) || 0;
            }
            
            // Calculate extras total - prefer 'nr' field if available (API's extras total)
            // Otherwise use sum of individual values
            let extrasSum = wides + noballs + byes + legbyes + penalty;
            
            // If 'nr' field exists and is greater than our calculated sum, use it
            // 'nr' appears to be the actual extras total from API
            if (firstEntry.nr) {
              const nrValue = parseFloat(firstEntry.nr) || 0;
              if (nrValue > extrasSum) {
                extrasSum = Math.round(nrValue);
                console.log(`[sync-api-scores] Using 'nr' field value ${nrValue} as extras total instead of calculated ${wides + noballs + byes + legbyes + penalty}`);
              }
            }
            
            extras.push({
              innings: inningsKey,
              team: inningsTeamName,
              wides,
              noballs,
              byes,
              legbyes,
              penalty,
              total: extrasSum,
              total_overs: totalOvers,
              total_runs: totalRuns,
            });
            
            console.log(`[sync-api-scores] Extras for "${inningsKey}": w=${wides}, nb=${noballs}, b=${byes}, lb=${legbyes}, nr=${firstEntry.nr || 'N/A'}, sum=${extrasSum}, innings_total=${totalRuns}`);
          }
          // Handle object format
          else if (typeof extrasData === 'object' && extrasData !== null) {
            const wides = parseInt(extrasData.wides || extrasData.Wides || extrasData.wd || 0) || 0;
            const noballs = parseInt(extrasData.noballs || extrasData.NoBalls || extrasData.nb || 0) || 0;
            const byes = parseInt(extrasData.byes || extrasData.Byes || extrasData.b || 0) || 0;
            const legbyes = parseInt(extrasData.legbyes || extrasData.LegByes || extrasData.lb || 0) || 0;
            const penalty = parseInt(extrasData.penalty || extrasData.Penalty || extrasData.p || 0) || 0;
            
            let total = parseInt(extrasData.extras_total || extrasData.total || extrasData.Total || 0) || 0;
            if (total === 0) {
              total = wides + noballs + byes + legbyes + penalty;
            }
            
            extras.push({
              innings: inningsKey,
              team: inningsTeamName,
              wides,
              noballs,
              byes,
              legbyes,
              penalty,
              total,
              total_overs: extrasData.total_overs || extrasData.overs || null,
              total_runs: parseInt(extrasData.total_runs || extrasData.runs || 0) || 0,
            });
            
            console.log(`[sync-api-scores] Extras (obj) for "${inningsKey}": w=${wides}, nb=${noballs}, b=${byes}, lb=${legbyes}, total=${total}`);
          }
        });
      }

      console.log(`[sync-api-scores] Parsed ${batsmen.length} batsmen, ${bowlers.length} bowlers, ${extras.length} extras entries from scorecard`);
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
        let batsmenRuns = 0;
        let wickets = 0;
        
        inningsBatsmen.forEach(b => {
          batsmenRuns += parseInt(b.runs) || 0;
          if (b.how_out && b.how_out.toLowerCase() !== 'not out') {
            wickets++;
          }
        });
        
        // Add extras for this innings
        const inningsExtras = extras.find(e => e.innings === inningsName);
        let extrasTotal = 0;
        let totalRuns = batsmenRuns;
        
        if (inningsExtras) {
          extrasTotal = inningsExtras.total || 0;
          totalRuns = batsmenRuns + extrasTotal;
          
          // If extras has total_runs (team total from API), prefer it
          if (inningsExtras.total_runs && inningsExtras.total_runs > totalRuns) {
            console.log(`[sync-api-scores] Using API total_runs ${inningsExtras.total_runs} instead of calculated ${totalRuns}`);
            totalRuns = inningsExtras.total_runs;
          }
        }
        
        console.log(`[sync-api-scores] Innings "${inningsName}": batsmen=${batsmenRuns}, extras=${extrasTotal}, total=${totalRuns}`);
        
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
        
        // Also try to get overs from extras data (more reliable)
        let oversStr: string | null = null;
        if (inningsExtras?.total_overs) {
          oversStr = String(inningsExtras.total_overs);
        } else if (totalBalls > 0) {
          const fullOvers = Math.floor(totalBalls / 6);
          const remainingBalls = totalBalls % 6;
          oversStr = remainingBalls > 0 ? `${fullOvers}.${remainingBalls}` : `${fullOvers}`;
        }
        
        const scoreStr = `${totalRuns}/${wickets}`;
        const scoreWithOvers = oversStr ? `${scoreStr} (${oversStr} ov)` : scoreStr;
        
        console.log(`[sync-api-scores] Innings "${inningsName}" (team: "${teamName}"): ${scoreWithOvers} from ${inningsBatsmen.length} batsmen, ${inningsBowlers.length} bowlers, extras=${extrasTotal}`);
        
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
      
      // Sort innings stats by innings name to process in order (1st, 2nd, etc.)
      const sortedInningsStats = [...inningsStats].sort((a, b) => {
        const orderA = parseInt(a.inningsName.match(/(\d+)\s*INN/i)?.[1] || '1');
        const orderB = parseInt(b.inningsName.match(/(\d+)\s*INN/i)?.[1] || '1');
        return orderA - orderB;
      });
      
      for (const stats of sortedInningsStats) {
        // Match innings team to our match teams
        // IMPORTANT: Only use full team names, NOT short codes
        // Short codes like "SYL", "CHA" are too ambiguous
        const isTeamA = teamsMatch(stats.teamName, teamAName);
        const isTeamB = teamsMatch(stats.teamName, teamBName);
        
        console.log(`[sync-api-scores] Checking innings "${stats.teamName}" against teamA="${teamAName}" (match=${isTeamA}) and teamB="${teamBName}" (match=${isTeamB})`);
        
        // Check if this innings belongs to teamA
        if (isTeamA && !isTeamB) {
          teamAScores.push(stats.scoreWithOvers);
          // Use latest/last innings with actual data
          if (stats.totalRuns > 0 || stats.wickets > 0) {
            scoreA = stats.scoreWithOvers;
            oversA = stats.overs;
            console.log(`[sync-api-scores] Matched innings "${stats.teamName}" -> teamA "${teamAName}": ${scoreA}`);
          }
        }
        // Check if this innings belongs to teamB
        else if (isTeamB && !isTeamA) {
          teamBScores.push(stats.scoreWithOvers);
          // Use latest/last innings with actual data
          if (stats.totalRuns > 0 || stats.wickets > 0) {
            scoreB = stats.scoreWithOvers;
            oversB = stats.overs;
            console.log(`[sync-api-scores] Matched innings "${stats.teamName}" -> teamB "${teamBName}": ${scoreB}`);
          }
        } 
        // If both match (unlikely but handle gracefully)
        else if (isTeamA && isTeamB) {
          console.log(`[sync-api-scores] Ambiguous: innings "${stats.teamName}" matches BOTH teamA and teamB, skipping to avoid duplication`);
        }
        else {
          console.log(`[sync-api-scores] Could not match innings team "${stats.teamName}" to either "${teamAName}" or "${teamBName}"`);
        }
      }

      // For Test matches or multi-innings, concatenate all scores ONLY for the same team
      if (teamAScores.length > 1) {
        scoreA = teamAScores.join(' & ');
      }
      if (teamBScores.length > 1) {
        scoreB = teamBScores.join(' & ');
      }
      
      console.log(`[sync-api-scores] Final processed: teamA(${teamAName}) scores=${teamAScores.length}, teamB(${teamBName}) scores=${teamBScores.length}`);

      // ============================================
      // FALLBACK: If scorecard is empty, use event_home_final_result / event_away_final_result
      // This handles cases where API provides final scores but not detailed scorecard
      // ============================================
      if (!scoreA && !scoreB) {
        console.log(`[sync-api-scores] Scorecard empty, checking for fallback final result fields...`);
        
        const apiHomeTeam = detailedEvent.event_home_team || '';
        const apiAwayTeam = detailedEvent.event_away_team || '';
        const homeResult = detailedEvent.event_home_final_result || '';
        const awayResult = detailedEvent.event_away_final_result || '';
        
        console.log(`[sync-api-scores] API home="${apiHomeTeam}" result="${homeResult}", away="${apiAwayTeam}" result="${awayResult}"`);
        
        // Map API home/away to our teamA/teamB
        const isTeamAHome = teamsMatch(teamAName, apiHomeTeam) || teamsMatch(teamAShort, apiHomeTeam);
        const isTeamAAway = teamsMatch(teamAName, apiAwayTeam) || teamsMatch(teamAShort, apiAwayTeam);
        const isTeamBHome = teamsMatch(teamBName, apiHomeTeam) || teamsMatch(teamBShort, apiHomeTeam);
        const isTeamBAway = teamsMatch(teamBName, apiAwayTeam) || teamsMatch(teamBShort, apiAwayTeam);
        
        // Determine which API result goes to which team
        if (isTeamAHome && isTeamBAway) {
          // TeamA is API's home, TeamB is API's away
          scoreA = homeResult || null;
          scoreB = awayResult || null;
          console.log(`[sync-api-scores] Fallback: teamA(home)="${scoreA}", teamB(away)="${scoreB}"`);
        } else if (isTeamAAway && isTeamBHome) {
          // TeamA is API's away, TeamB is API's home
          scoreA = awayResult || null;
          scoreB = homeResult || null;
          console.log(`[sync-api-scores] Fallback: teamA(away)="${scoreA}", teamB(home)="${scoreB}"`);
        } else {
          console.log(`[sync-api-scores] Fallback: Could not map API teams to our teams`);
        }
      }
      // Also handle case where only one score is missing (partial scorecard)
      else if (!scoreA && scoreB) {
        console.log(`[sync-api-scores] Only teamB score found, checking for teamA fallback...`);
        
        const apiHomeTeam = detailedEvent.event_home_team || '';
        const apiAwayTeam = detailedEvent.event_away_team || '';
        const homeResult = detailedEvent.event_home_final_result || '';
        const awayResult = detailedEvent.event_away_final_result || '';
        
        const isTeamAHome = teamsMatch(teamAName, apiHomeTeam) || teamsMatch(teamAShort, apiHomeTeam);
        const isTeamAAway = teamsMatch(teamAName, apiAwayTeam) || teamsMatch(teamAShort, apiAwayTeam);
        
        if (isTeamAHome && homeResult) {
          scoreA = homeResult;
          console.log(`[sync-api-scores] Fallback for teamA (home): "${scoreA}"`);
        } else if (isTeamAAway && awayResult) {
          scoreA = awayResult;
          console.log(`[sync-api-scores] Fallback for teamA (away): "${scoreA}"`);
        }
      }
      else if (scoreA && !scoreB) {
        console.log(`[sync-api-scores] Only teamA score found, checking for teamB fallback...`);
        
        const apiHomeTeam = detailedEvent.event_home_team || '';
        const apiAwayTeam = detailedEvent.event_away_team || '';
        const homeResult = detailedEvent.event_home_final_result || '';
        const awayResult = detailedEvent.event_away_final_result || '';
        
        const isTeamBHome = teamsMatch(teamBName, apiHomeTeam) || teamsMatch(teamBShort, apiHomeTeam);
        const isTeamBAway = teamsMatch(teamBName, apiAwayTeam) || teamsMatch(teamBShort, apiAwayTeam);
        
        if (isTeamBHome && homeResult) {
          scoreB = homeResult;
          console.log(`[sync-api-scores] Fallback for teamB (home): "${scoreB}"`);
        } else if (isTeamBAway && awayResult) {
          scoreB = awayResult;
          console.log(`[sync-api-scores] Fallback for teamB (away): "${scoreB}"`);
        }
      }
      
      // CRITICAL FIX: Store scores in match_api_scores mapped to team_a/team_b 
      // NOT using API's home/away which can be swapped
      // This ensures client-side always gets correctly mapped scores
      
      // For the match_api_scores table, we now store:
      // - home_team = team_a name, home_score = score_a 
      // - away_team = team_b name, away_score = score_b
      // This makes the client-side logic simple: home = teamA, away = teamB
      
      console.log(`[sync-api-scores] Final mapped scores: team_a="${teamAName}" score_a="${scoreA}", team_b="${teamBName}" score_b="${scoreB}"`);

      // Determine match status
      let matchStatus: 'upcoming' | 'live' | 'completed' = 'upcoming';
      if (detailedEvent.event_live === '1') {
        matchStatus = 'live';
      } else if (detailedEvent.event_status === 'Finished' || detailedEvent.event_final_result) {
        matchStatus = 'completed';
      }

      // Upsert to match_api_scores - STORE AS team_a/team_b (not API's home/away)
      const { error: upsertError } = await supabase
        .from('match_api_scores')
        .upsert({
          match_id: match.id,
          // Store team_a as home, team_b as away for consistent client-side mapping
          home_team: teamAName,
          away_team: teamBName,
          home_score: scoreA,  // team_a's score
          away_score: scoreB,  // team_b's score
          home_overs: oversA,
          away_overs: oversB,
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
      // IMPORTANT: Always update both scores to fix any previous incorrect values
      // If a team hasn't batted yet, set their score to null
      const matchUpdate: any = { 
        last_api_sync: new Date().toISOString(),
        score_a: scoreA || null,  // Always set, even if null (to clear wrong data)
        score_b: scoreB || null,  // Always set, even if null (to clear wrong data)
      };
      
      if (match.status !== matchStatus) matchUpdate.status = matchStatus;

      console.log(`[sync-api-scores] Updating match: score_a="${matchUpdate.score_a}", score_b="${matchUpdate.score_b}"`);

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
