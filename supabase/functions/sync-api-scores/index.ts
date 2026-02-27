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

// IMPROVED team name matching - STRICT MODE
// Only match if teams have high confidence of being the same
const teamsMatch = (name1: string, name2: string): boolean => {
  const n1 = normalizeTeamName(name1);
  const n2 = normalizeTeamName(name2);
  
  if (!n1 || !n2) return false;
  
  // Exact match
  if (n1 === n2) return true;
  
  // Canonical name match (handles aliases like AUS = Australia)
  const canonical1 = getCanonicalName(n1);
  const canonical2 = getCanonicalName(n2);
  if (canonical1 === canonical2) {
    return true;
  }
  
  const words1 = n1.split(' ').filter(w => w.length > 0);
  const words2 = n2.split(' ').filter(w => w.length > 0);
  
  // If either is a short code (3 chars or less, single word), ONLY check against known aliases
  if (words1.length === 1 && n1.length <= 3) {
    for (const [canonical, aliases] of Object.entries(teamAliases)) {
      if ((n1 === canonical || aliases.includes(n1)) && (canonical2 === canonical || n2.includes(canonical) || aliases.some(a => n2.includes(a)))) {
        return true;
      }
    }
    return false;
  }
  if (words2.length === 1 && n2.length <= 3) {
    for (const [canonical, aliases] of Object.entries(teamAliases)) {
      if ((n2 === canonical || aliases.includes(n2)) && (canonical1 === canonical || n1.includes(canonical) || aliases.some(a => n1.includes(a)))) {
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
  
  // STRICT: If both have 2+ words, BOTH first AND last words must match exactly
  if (words1.length >= 2 && words2.length >= 2) {
    return firstWord1 === firstWord2 && lastWord1 === lastWord2;
  }
  
  // STRICT: Single word (4+ chars) must match first word OR last word exactly
  // AND the first word must be identical (prevents "rajshahi" matching "rajasthan")
  if (words1.length === 1 && n1.length >= 4) {
    // Single word must exactly match the first word of the multi-word name
    return firstWord2 === n1 || lastWord2 === n1;
  }
  if (words2.length === 1 && n2.length >= 4) {
    return firstWord1 === n2 || lastWord1 === n2;
  }
  
  // STRICT: Check for exact containment only if one is a complete word within the other
  // For example: "australia" in "australia men" but NOT "raj" in "rajasthan"
  if (n1.length >= 5 && n2.length >= 5) {
    // Check if n1 is a complete word in n2 or vice versa
    if (words2.includes(n1) || words1.includes(n2)) {
      return true;
    }
  }
  
  return false;
};

// Get match format from API event (league name, format field, or guess from overs)
const getApiEventFormat = (event: any): string | null => {
  const leagueName = (event.league_name || event.event_stadium || '').toLowerCase();
  const format = (event.event_format || '').toLowerCase();
  
  // Check explicit format field
  if (format.includes('test') || format.includes('first class') || format.includes('first-class')) {
    return 'test';
  }
  if (format.includes('t20') || format.includes('twenty20')) {
    return 't20';
  }
  if (format.includes('odi') || format.includes('one day') || format.includes('one-day')) {
    return 'odi';
  }
  if (format.includes('t10')) {
    return 't10';
  }
  
  // Check league name for format hints
  if (leagueName.includes('t20') || leagueName.includes('twenty20') || leagueName.includes('ipl') || 
      leagueName.includes('bbl') || leagueName.includes('psl') || leagueName.includes('cpl') ||
      leagueName.includes('hundred') || leagueName.includes('sa20') || leagueName.includes('ilt20')) {
    return 't20';
  }
  if (leagueName.includes('test') || leagueName.includes('ranji') || leagueName.includes('sheffield') || 
      leagueName.includes('first class') || leagueName.includes('first-class') || leagueName.includes('county championship')) {
    return 'test';
  }
  if (leagueName.includes('odi') || leagueName.includes('one day') || leagueName.includes('world cup') && !leagueName.includes('t20')) {
    return 'odi';
  }
  if (leagueName.includes('t10')) {
    return 't10';
  }
  
  return null; // Unknown format
};

// Check if match format is compatible with API event format
const isFormatCompatible = (matchFormat: string | null, apiEventFormat: string | null): boolean => {
  if (!matchFormat || !apiEventFormat) {
    // If we can't determine format, allow match (backward compatibility)
    return true;
  }
  
  const normalizedMatch = matchFormat.toLowerCase();
  const normalizedApi = apiEventFormat.toLowerCase();
  
  // Test matches should only match Test events
  if (normalizedMatch === 'test' && normalizedApi !== 'test') {
    return false;
  }
  
  // T20 matches should only match T20 events (NOT Test/ODI)
  if (normalizedMatch === 't20' && (normalizedApi === 'test' || normalizedApi === 'odi')) {
    return false;
  }
  
  // ODI matches should only match ODI events (NOT Test/T20)
  if (normalizedMatch === 'odi' && (normalizedApi === 'test' || normalizedApi === 't20')) {
    return false;
  }
  
  // T10 matches should only match T10 events
  if (normalizedMatch === 't10' && normalizedApi !== 't10') {
    return false;
  }
  
  return true;
};

// Validate overs against match format (as a secondary check)
const validateOversForFormat = (overs: string | null, matchFormat: string | null): boolean => {
  if (!overs || !matchFormat) return true;
  
  // Extract numeric overs value (handle formats like "94 ov", "94.2", etc.)
  const oversMatch = overs.match(/(\d+(?:\.\d+)?)/);
  if (!oversMatch) return true;
  
  const numOvers = parseFloat(oversMatch[1]);
  const format = matchFormat.toLowerCase();
  
  // T20 max overs should be 20 (allow some buffer for rounding)
  if (format === 't20' && numOvers > 25) {
    console.log(`[sync-api-scores] REJECTING: T20 match has ${numOvers} overs - likely wrong match`);
    return false;
  }
  
  // T10 max overs should be 10
  if (format === 't10' && numOvers > 15) {
    console.log(`[sync-api-scores] REJECTING: T10 match has ${numOvers} overs - likely wrong match`);
    return false;
  }
  
  // ODI max overs should be 50
  if (format === 'odi' && numOvers > 55) {
    console.log(`[sync-api-scores] REJECTING: ODI match has ${numOvers} overs - likely wrong match`);
    return false;
  }
  
  return true;
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

    // Check for single match force-sync request
    let forceSyncMatchId: string | null = null;
    try {
      const body = await req.json();
      if (body?.matchId) {
        forceSyncMatchId = body.matchId;
        console.log(`[sync-api-scores] Force sync requested for match: ${forceSyncMatchId}`);
      }
    } catch {
      // No body or invalid JSON - proceed with normal sync
    }

    console.log('[sync-api-scores] Starting API score sync...');

    // Get the API key and sync interval from site_settings
    const { data: settings, error: settingsError } = await supabase
      .from('site_settings')
      .select('api_cricket_key, api_cricket_enabled, api_sync_interval_seconds, auto_match_result_enabled')
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
    const autoMatchResultEnabled = settings.auto_match_result_enabled !== false; // default true
    
    console.log(`[sync-api-scores] Sync interval: ${syncIntervalSeconds}s, Auto match result: ${autoMatchResultEnabled}`);

    // Get matches that need syncing
    const now = new Date();
    const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);
    
    // Include recently completed matches (within last 30 minutes) to ensure final scores are synced
    // This prevents the issue where second innings data stops syncing when match completes
    const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000);
    
    // Build query based on whether we're force-syncing a specific match
    let matchQuery = supabase
      .from('matches')
      .select(`
        id,
        status,
        match_date,
        match_time,
        match_start_time,
        api_score_enabled,
        score_source,
        last_api_sync,
        updated_at,
        score_a,
        score_b,
        match_format,
        match_result,
        team_a:teams!matches_team_a_id_fkey(name, short_name),
        team_b:teams!matches_team_b_id_fkey(name, short_name),
        tournament:tournaments!matches_tournament_id_fkey(name)
      `);
    
    if (forceSyncMatchId) {
      // Force sync: get specific match regardless of score_source
      matchQuery = matchQuery.eq('id', forceSyncMatchId);
    } else {
      // Normal sync: only get matches with api_cricket score source
      matchQuery = matchQuery.eq('score_source', 'api_cricket');
    }
    
    const { data: matches, error: matchesError } = await matchQuery.order('match_date', { ascending: true });

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
      // If force syncing a specific match, always include it
      if (forceSyncMatchId && match.id === forceSyncMatchId) {
        console.log(`[sync-api-scores] Force sync: including match ${match.id} (bypassing all filters)`);
        return true;
      }
      
      // Helper to check if scores are incomplete (one team hasn't batted)
      const hasIncompleteScores = () => {
        // If match is completed but one or both scores are missing, it's incomplete
        if (match.status === 'completed') {
          const scoreAMissing = !match.score_a || match.score_a.trim() === '';
          const scoreBMissing = !match.score_b || match.score_b.trim() === '';
          return scoreAMissing || scoreBMissing;
        }
        return false;
      };
      
      const isIncomplete = hasIncompleteScores();
      
      // For completed matches with incomplete scores or missing match_result - ALWAYS force sync
      const needsMatchResult = autoMatchResultEnabled && !(match as any).match_result;
      if (match.status === 'completed' && (isIncomplete || needsMatchResult)) {
        console.log(`[sync-api-scores] FORCE SYNCING completed match ${match.id} - incomplete scores or missing match_result (score_a="${match.score_a}", score_b="${match.score_b}", match_result="${(match as any).match_result}")`);
        return true; // Skip ALL other checks
      }
      
      // Skip matches that are completed for more than 30 minutes (only if scores are complete)
      if (match.status === 'completed') {
        const updatedAt = new Date(match.updated_at || match.last_api_sync || 0);
        if (updatedAt < thirtyMinutesAgo) {
          console.log(`[sync-api-scores] Skipping completed match ${match.id} - completed more than 30 mins ago with full scores`);
          return false;
        }
        console.log(`[sync-api-scores] Recently completed match ${match.id} - checking for final sync`);
      }
      
      // Check sync interval for non-incomplete matches
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
      const matchFormat = (match as any).match_format || null;
      const tournament = (match as any).tournament as { name: string } | null;
      const tournamentName = tournament?.name || '';
      
      console.log(`[sync-api-scores] Looking for: "${teamAName}" (${teamAShort}) vs "${teamBName}" (${teamBShort}) | Format: ${matchFormat || 'unknown'} | Tournament: ${tournamentName}`);

      // Find matching event with FORMAT VALIDATION
      const matchingEvent = events.find((event: any) => {
        const homeTeam = event.event_home_team || '';
        const awayTeam = event.event_away_team || '';
        
        // Check if both our teams are found in the event
        const teamAMatches = teamsMatch(teamAName, homeTeam) || teamsMatch(teamAName, awayTeam) ||
                           teamsMatch(teamAShort, homeTeam) || teamsMatch(teamAShort, awayTeam);
        const teamBMatches = teamsMatch(teamBName, homeTeam) || teamsMatch(teamBName, awayTeam) ||
                           teamsMatch(teamBShort, homeTeam) || teamsMatch(teamBShort, awayTeam);
        
        if (!teamAMatches || !teamBMatches) {
          return false;
        }
        
        // CRITICAL: Check format compatibility to prevent Test scores syncing to T20 matches
        const apiFormat = getApiEventFormat(event);
        if (!isFormatCompatible(matchFormat, apiFormat)) {
          console.log(`[sync-api-scores] SKIPPING event ${event.event_key}: Format mismatch - DB has "${matchFormat}", API event is "${apiFormat}" (league: ${event.league_name || 'unknown'})`);
          return false;
        }
        
        return true;
      });

      if (!matchingEvent) {
        console.log(`[sync-api-scores] No matching event found for ${teamAName} vs ${teamBName} (format: ${matchFormat})`);
        continue;
      }

      console.log(`[sync-api-scores] Found match: ${matchingEvent.event_home_team} vs ${matchingEvent.event_away_team} (API format: ${getApiEventFormat(matchingEvent) || 'unknown'})`);

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

      // NOTE: Playing XI auto-fetch from score sync has been DISABLED
      // Playing XI should only be fetched manually via the "Refresh Squad" button in admin
      // This prevents scorecard data from overwriting manually curated lineups
      console.log(`[sync-api-scores] Skipping auto Playing XI fetch - use manual "Refresh Squad" instead`);

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

      // Also store home/away for the API scores table (for compatibility)
// CRITICAL FIX: Store scores in match_api_scores mapped to team_a/team_b 
      // NOT using API's home/away which can be swapped
      // This ensures client-side always gets correctly mapped scores
      
      // For the match_api_scores table, we now store:
      // - home_team = team_a name, home_score = score_a 
      // - away_team = team_b name, away_score = score_b
      // This makes the client-side logic simple: home = teamA, away = teamB
      
      console.log(`[sync-api-scores] Final mapped scores: team_a="${teamAName}" score_a="${scoreA}", team_b="${teamBName}" score_b="${scoreB}"`);

      // CRITICAL VALIDATION: Verify overs are compatible with match format
      // This is the FINAL safety check to prevent wrong match data from being saved
      const validateAndReject = () => {
        // Validate Team A score overs
        if (oversA && !validateOversForFormat(oversA, matchFormat)) {
          console.error(`[sync-api-scores] REJECTING match ${match.id}: Team A overs (${oversA}) incompatible with format (${matchFormat})`);
          return true; // Reject
        }
        // Validate Team B score overs
        if (oversB && !validateOversForFormat(oversB, matchFormat)) {
          console.error(`[sync-api-scores] REJECTING match ${match.id}: Team B overs (${oversB}) incompatible with format (${matchFormat})`);
          return true; // Reject
        }
        return false; // Don't reject
      };
      
      if (validateAndReject()) {
        console.log(`[sync-api-scores] Skipping save for match ${match.id} due to format/overs validation failure`);
        continue;
      }

      // Determine match status
      let matchStatus: 'upcoming' | 'live' | 'completed' = 'upcoming';
      if (detailedEvent.event_live === '1') {
        matchStatus = 'live';
      } else if (detailedEvent.event_status === 'Finished' || detailedEvent.event_final_result) {
        matchStatus = 'completed';
      }

      // Auto-detect match_result from API data when match is completed
      let detectedMatchResult: string | null = null;
      if (matchStatus === 'completed' && autoMatchResultEnabled) {
        const resultText = (detailedEvent.event_final_result || detailedEvent.event_status_info || '').toLowerCase();
        console.log(`[sync-api-scores] Detecting match_result from: "${resultText}"`);
        
        if (resultText.includes('no result') || resultText.includes('abandoned') || resultText.includes('no res')) {
          detectedMatchResult = 'no_result';
        } else if (resultText.includes('tied') || resultText.includes('tie')) {
          detectedMatchResult = 'tied';
        } else if (resultText.includes('draw') || resultText.includes('drawn')) {
          detectedMatchResult = 'draw';
        } else if (resultText.includes('won') || resultText.includes('win')) {
          // Extract winning team name from result text
          const wonByMatch = resultText.match(/^(.+?)\s+won\s+by/i);
          if (wonByMatch) {
            const winnerName = wonByMatch[1].trim();
            const winnerIsTeamA = teamsMatch(winnerName, teamAName) || teamsMatch(winnerName, teamAShort);
            const winnerIsTeamB = teamsMatch(winnerName, teamBName) || teamsMatch(winnerName, teamBShort);
            
            if (winnerIsTeamA && !winnerIsTeamB) {
              detectedMatchResult = 'team_a_won';
            } else if (winnerIsTeamB && !winnerIsTeamA) {
              detectedMatchResult = 'team_b_won';
            }
            console.log(`[sync-api-scores] Winner "${winnerName}" -> teamA=${winnerIsTeamA}, teamB=${winnerIsTeamB} -> result=${detectedMatchResult}`);
          }
          
          // Fallback: compare scores if we couldn't parse winner name
          if (!detectedMatchResult && scoreA && scoreB) {
            const extractRuns = (s: string) => parseInt(s.match(/^(\d+)/)?.[1] || '0');
            const runsA = extractRuns(scoreA);
            const runsB = extractRuns(scoreB);
            if (runsA > runsB) detectedMatchResult = 'team_a_won';
            else if (runsB > runsA) detectedMatchResult = 'team_b_won';
            console.log(`[sync-api-scores] Score comparison fallback: ${runsA} vs ${runsB} -> ${detectedMatchResult}`);
          }
        }
        
        if (detectedMatchResult) {
          console.log(`[sync-api-scores] Auto-detected match_result: ${detectedMatchResult}`);
        }
      }

      // Upsert to match_api_scores - STORE AS team_a/team_b (not API's home/away)
      // IMPORTANT: Check existing record first to preserve scores when API returns NULL
      const { data: existingApiScores } = await supabase
        .from('match_api_scores')
        .select('*')
        .eq('match_id', match.id)
        .maybeSingle();
      
      // Preserve existing scores if API returned NULL for that team
      // This happens when API only syncs one innings (e.g., second team batted but first team's data dropped)
      const finalScoreA = scoreA || existingApiScores?.home_score || match.score_a || null;
      const finalScoreB = scoreB || existingApiScores?.away_score || match.score_b || null;
      
      // Helper function to preserve existing valid data if new data is empty/incomplete
      const preserveValue = <T>(newVal: T | null | undefined, existingVal: T | null | undefined): T | null => {
        if (newVal === null || newVal === undefined) return existingVal as T | null;
        if (typeof newVal === 'string' && newVal.trim() === '') return existingVal as T | null;
        if (Array.isArray(newVal) && newVal.length === 0 && existingVal && Array.isArray(existingVal) && (existingVal as any[]).length > 0) {
          return existingVal as T | null;
        }
        return newVal;
      };
      
      console.log(`[sync-api-scores] Score preservation: API scoreA="${scoreA}", existing="${existingApiScores?.home_score}", match="${match.score_a}" -> final="${finalScoreA}"`);
      console.log(`[sync-api-scores] Score preservation: API scoreB="${scoreB}", existing="${existingApiScores?.away_score}", match="${match.score_b}" -> final="${finalScoreB}"`);
      
      const { error: upsertError } = await supabase
        .from('match_api_scores')
        .upsert({
          match_id: match.id,
          // Store team_a as home, team_b as away for consistent client-side mapping
          home_team: teamAName,
          away_team: teamBName,
          home_score: finalScoreA,  // team_a's score - preserved if API returns NULL
          away_score: finalScoreB,  // team_b's score - preserved if API returns NULL
          home_overs: oversA || existingApiScores?.home_overs || null,
          away_overs: oversB || existingApiScores?.away_overs || null,
          status: detailedEvent.event_status,
          status_info: preserveValue(detailedEvent.event_status_info, existingApiScores?.status_info),
          event_live: detailedEvent.event_live === '1',
          venue: preserveValue(detailedEvent.event_stadium, existingApiScores?.venue),
          toss: preserveValue(detailedEvent.event_toss, existingApiScores?.toss),
          batsmen: preserveValue(batsmen, existingApiScores?.batsmen),
          bowlers: preserveValue(bowlers, existingApiScores?.bowlers),
          extras: preserveValue(extras, existingApiScores?.extras),
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
      // IMPORTANT: Only update scores if we have new data - DON'T overwrite existing scores with null
      // This preserves scores from when API had complete data
      const matchUpdate: any = { 
        last_api_sync: new Date().toISOString(),
      };
      
      // Only update score_a if we got a new non-empty score from API
      if (scoreA && scoreA.trim() !== '') {
        matchUpdate.score_a = scoreA;
      }
      
      // Only update score_b if we got a new non-empty score from API  
      if (scoreB && scoreB.trim() !== '') {
        matchUpdate.score_b = scoreB;
      }
      
      if (match.status !== matchStatus) matchUpdate.status = matchStatus;
      
      // Set match_result if detected and not already set
      if (detectedMatchResult && matchStatus === 'completed') {
        matchUpdate.match_result = detectedMatchResult;
        
        // Also set result_margin from API
        const resultText = detailedEvent.event_final_result || detailedEvent.event_status_info || '';
        const marginMatch = resultText.match(/won by (.+)/i);
        if (marginMatch) {
          matchUpdate.result_margin = marginMatch[1].trim();
        }
      }

      console.log(`[sync-api-scores] Updating match: score_a="${matchUpdate.score_a || '(unchanged)'}", score_b="${matchUpdate.score_b || '(unchanged)'}"`);


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
