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

// Normalize team name for matching
const normalizeTeamName = (name: string): string => {
  return (name || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
};

// Common team name aliases for international teams (including U19)
const teamAliases: Record<string, string[]> = {
  'australia': ['aus', 'australian', 'aussies', 'australia men', 'australia women', 'australia u19', 'aus u19'],
  'england': ['eng', 'english', 'england men', 'england women', 'england lions', 'england u19', 'eng u19'],
  'india': ['ind', 'indian', 'india men', 'india women', 'team india', 'india u19', 'ind u19'],
  'pakistan': ['pak', 'pakistani', 'pakistan men', 'pakistan women', 'pakistan u19', 'pak u19'],
  'south africa': ['sa', 'rsa', 'south african', 'proteas', 'south africa men', 'south africa u19', 'sa u19'],
  'new zealand': ['nz', 'nzl', 'kiwis', 'black caps', 'blackcaps', 'new zealand men', 'new zealand u19', 'nz u19'],
  'west indies': ['wi', 'windies', 'caribbean', 'west indies men', 'west indies u19', 'wi u19'],
  'sri lanka': ['sl', 'srilanka', 'sri lankan', 'sri lanka men', 'sri lanka u19', 'sl u19'],
  'bangladesh': ['ban', 'bd', 'bangladeshi', 'tigers', 'bangladesh men', 'bangladesh u19', 'ban u19', 'banu19'],
  'afghanistan': ['afg', 'afghan', 'afghanistan men', 'afghanistan u19', 'afg u19'],
  'zimbabwe': ['zim', 'zimbabwean', 'zimbabwe men', 'zimbabwe u19', 'zim u19'],
  'ireland': ['ire', 'irish', 'ireland men', 'ireland u19', 'ire u19'],
  'scotland': ['sco', 'scottish', 'scotland men', 'scotland u19', 'sco u19'],
  'netherlands': ['ned', 'holland', 'dutch', 'netherlands men', 'netherlands u19', 'ned u19'],
  'uae': ['united arab emirates', 'emirates', 'uae u19'],
  'usa': ['united states', 'america', 'american', 'usa u19'],
};

// Get canonical team name
const getCanonicalName = (name: string): string => {
  const normalized = normalizeTeamName(name);
  
  for (const [canonical, aliases] of Object.entries(teamAliases)) {
    if (normalized === canonical || aliases.includes(normalized)) {
      return canonical;
    }
    if (normalized.startsWith(canonical + ' ') || normalized.endsWith(' ' + canonical)) {
      return canonical;
    }
    for (const alias of aliases) {
      if (normalized === alias || normalized.startsWith(alias + ' ') || normalized.endsWith(' ' + alias)) {
        return canonical;
      }
    }
  }
  
  return normalized;
};

// STRICT team name matching (with U19/Under-19 support)
const teamsMatch = (name1: string, name2: string): boolean => {
  const n1 = normalizeTeamName(name1);
  const n2 = normalizeTeamName(name2);
  
  if (!n1 || !n2) return false;
  if (n1 === n2) return true;
  
  // Normalize U19/Under-19 variations
  const normalizeU19 = (s: string) => s
    .replace(/under[\s-]?19/gi, 'u19')
    .replace(/u[\s-]?19/gi, 'u19')
    .replace(/\s+/g, ' ')
    .trim();
  
  const n1u19 = normalizeU19(n1);
  const n2u19 = normalizeU19(n2);
  
  if (n1u19 === n2u19) return true;
  
  // Check if both have U19 suffix - compare base team names
  const hasU19_1 = n1u19.includes('u19');
  const hasU19_2 = n2u19.includes('u19');
  
  if (hasU19_1 && hasU19_2) {
    // Both are U19 teams - compare base names
    const base1 = n1u19.replace(/\s*u19\s*/g, ' ').trim();
    const base2 = n2u19.replace(/\s*u19\s*/g, ' ').trim();
    
    // Check direct match or alias match
    if (base1 === base2) return true;
    
    const canonical1 = getCanonicalName(base1);
    const canonical2 = getCanonicalName(base2);
    if (canonical1 === canonical2) return true;
    
    // Check if one contains the other
    if (base1.includes(base2) || base2.includes(base1)) return true;
  }
  
  const canonical1 = getCanonicalName(n1);
  const canonical2 = getCanonicalName(n2);
  if (canonical1 === canonical2 && canonical1 !== n1 && canonical2 !== n2) {
    return true;
  }
  
  const words1 = n1.split(' ').filter(w => w.length > 0);
  const words2 = n2.split(' ').filter(w => w.length > 0);
  
  if (words1.length === 1 && n1.length <= 3) {
    for (const [canonical, aliases] of Object.entries(teamAliases)) {
      if (aliases.includes(n1) && (canonical2 === canonical || n2.includes(canonical))) {
        return true;
      }
    }
    return false;
  }
  if (words2.length === 1 && n2.length <= 3) {
    for (const [canonical, aliases] of Object.entries(teamAliases)) {
      if (aliases.includes(n2) && (canonical1 === canonical || n1.includes(canonical))) {
        return true;
      }
    }
    return false;
  }
  
  const firstWord1 = words1[0];
  const lastWord1 = words1[words1.length - 1];
  const firstWord2 = words2[0];
  const lastWord2 = words2[words2.length - 1];
  
  if (words1.length >= 2 && words2.length >= 2) {
    return firstWord1 === firstWord2 && lastWord1 === lastWord2;
  }
  
  if (words1.length === 1 && n1.length >= 4) {
    return firstWord2 === n1 || lastWord2 === n1;
  }
  if (words2.length === 1 && n2.length >= 4) {
    return firstWord1 === n2 || lastWord1 === n2;
  }
  
  if (n1.length >= 5 && n2.length >= 5) {
    if (words2.includes(n1) || words1.includes(n2)) {
      return true;
    }
  }
  
  return false;
};

interface ESPNScoreData {
  homeTeam: string;
  awayTeam: string;
  homeScore: string | null;
  awayScore: string | null;
  status: string;
  statusInfo: string;
  venue: string | null;
  toss: string | null;
  eventLive: boolean;
  batsmen: any[];
  bowlers: any[];
  extras: any[];
  scorecard: any[];
  playingXI: {
    home: any[];
    away: any[];
  };
}

// Fetch match details from ESPN API
async function fetchESPNMatchDetails(eventId: string): Promise<ESPNScoreData | null> {
  try {
    // Try different ESPN cricket endpoints
    const endpoints = [
      `https://site.api.espn.com/apis/site/v2/sports/cricket/8676/summary?event=${eventId}`,
      `https://site.api.espn.com/apis/site/v2/sports/cricket/icc/summary?event=${eventId}`,
      `https://site.web.api.espn.com/apis/v2/sports/cricket/leagues/8676/events/${eventId}/competitions/${eventId}`,
    ];
    
    for (const url of endpoints) {
      try {
        console.log(`[ESPN Cricket] Trying endpoint: ${url}`);
        const response = await fetchWithRetry(url, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          },
        });
        
        if (response.ok) {
          const data = await response.json();
          return parseESPNData(data, eventId);
        }
      } catch (e) {
        console.log(`[ESPN Cricket] Endpoint failed: ${url}`);
      }
    }
    
    return null;
  } catch (error) {
    console.error(`[ESPN Cricket] Error fetching event ${eventId}:`, error);
    return null;
  }
}

// Parse ESPN API response
function parseESPNData(data: any, eventId: string): ESPNScoreData | null {
  try {
    const header = data.header || {};
    const competitions = header.competitions || data.competitions || [];
    const competition = competitions[0] || {};
    const competitors = competition.competitors || [];
    
    if (competitors.length < 2) {
      console.log(`[ESPN Cricket] No competitors found for event ${eventId}`);
      return null;
    }
    
    const homeTeam = competitors.find((c: any) => c.homeAway === 'home') || competitors[0];
    const awayTeam = competitors.find((c: any) => c.homeAway === 'away') || competitors[1];
    
    // Get scores
    const homeScore = homeTeam.score || homeTeam.linescores?.map((ls: any) => ls.displayValue).join(' & ') || null;
    const awayScore = awayTeam.score || awayTeam.linescores?.map((ls: any) => ls.displayValue).join(' & ') || null;
    
    // Get status
    const status = competition.status || header.status || {};
    const statusType = status.type?.name || 'unknown';
    const statusInfo = status.type?.description || status.type?.detail || '';
    const eventLive = statusType === 'in' || statusType === 'inprogress' || statusType === 'live';
    
    // Get venue
    const venue = competition.venue?.fullName || competition.venue?.address?.city || null;
    
    // Get toss info
    let toss = null;
    const notes = competition.notes || data.notes || [];
    for (const note of notes) {
      if (note.type === 'toss' || (note.text && note.text.toLowerCase().includes('toss'))) {
        toss = note.text || note.headline;
        break;
      }
    }
    
    // Parse scorecard data
    const scorecard = data.scorecard || [];
    const batsmen: any[] = [];
    const bowlers: any[] = [];
    const extras: any[] = [];
    
    for (const innings of scorecard) {
      const inningsName = innings.innings?.inningsNumber 
        ? `${innings.team?.displayName || 'Team'} ${innings.innings.inningsNumber} INN`
        : innings.team?.displayName || 'Unknown';
      
      // Parse batsmen
      const battingStats = innings.battingStats || innings.batting || [];
      for (const batter of battingStats) {
        batsmen.push({
          name: batter.athlete?.displayName || batter.athlete?.shortName || batter.name || 'Unknown',
          runs: String(batter.runs || 0),
          balls: String(batter.balls || 0),
          fours: String(batter.fours || 0),
          sixes: String(batter.sixes || 0),
          sr: String(batter.strikeRate || 0),
          how_out: batter.dismissal || batter.howOut || 'not out',
          innings: inningsName,
        });
      }
      
      // Parse bowlers
      const bowlingStats = innings.bowlingStats || innings.bowling || [];
      for (const bowler of bowlingStats) {
        bowlers.push({
          name: bowler.athlete?.displayName || bowler.athlete?.shortName || bowler.name || 'Unknown',
          overs: String(bowler.overs || 0),
          maidens: String(bowler.maidens || 0),
          runs: String(bowler.runs || 0),
          wickets: String(bowler.wickets || 0),
          economy: String(bowler.economy || 0),
          innings: inningsName,
        });
      }
      
      // Parse extras
      const extrasData = innings.extras || {};
      extras.push({
        team: innings.team?.displayName || 'Unknown',
        innings: inningsName,
        total: extrasData.total || 0,
        total_runs: innings.total?.runs || innings.score || 0,
        wides: extrasData.wides || 0,
        noballs: extrasData.noBalls || 0,
        byes: extrasData.byes || 0,
        legbyes: extrasData.legByes || 0,
      });
    }
    
    // Parse Playing XI from rosters
    const rosters = data.rosters || [];
    const playingXI = {
      home: [] as any[],
      away: [] as any[],
    };
    
    for (const roster of rosters) {
      const teamType = roster.homeAway || 'home';
      const entries = roster.roster || [];
      
      for (const entry of entries) {
        const player = {
          name: entry.athlete?.displayName || entry.athlete?.shortName || entry.name || 'Unknown',
          role: entry.position?.name || entry.position?.abbreviation || null,
          isCaptain: entry.captain || entry.isCaptain || false,
          isWicketKeeper: entry.position?.abbreviation === 'WK' || entry.isWicketKeeper || false,
        };
        
        if (teamType === 'home') {
          playingXI.home.push(player);
        } else {
          playingXI.away.push(player);
        }
      }
    }
    
    return {
      homeTeam: homeTeam.team?.displayName || homeTeam.team?.shortDisplayName || 'Unknown',
      awayTeam: awayTeam.team?.displayName || awayTeam.team?.shortDisplayName || 'Unknown',
      homeScore,
      awayScore,
      status: statusType,
      statusInfo,
      venue,
      toss,
      eventLive,
      batsmen,
      bowlers,
      extras,
      scorecard,
      playingXI,
    };
  } catch (error) {
    console.error(`[ESPN Cricket] Error parsing data:`, error);
    return null;
  }
}

// Find ESPN match by team names
async function findESPNMatch(teamAName: string, teamBName: string, matchDate: string): Promise<{ eventId: string; data: ESPNScoreData } | null> {
  try {
    // Format date for ESPN API (YYYYMMDD)
    let dateStr = '';
    let nextDateStr = '';
    
    try {
      // Safely parse date
      const parsedDate = new Date(matchDate);
      if (isNaN(parsedDate.getTime())) {
        // If invalid, use today's date
        const today = new Date();
        dateStr = today.toISOString().split('T')[0].replace(/-/g, '');
        const nextDay = new Date(today);
        nextDay.setDate(nextDay.getDate() + 1);
        nextDateStr = nextDay.toISOString().split('T')[0].replace(/-/g, '');
        console.log(`[ESPN Cricket] Invalid matchDate "${matchDate}", using today: ${dateStr}`);
      } else {
        dateStr = matchDate.replace(/-/g, '');
        const nextDay = new Date(parsedDate);
        nextDay.setDate(nextDay.getDate() + 1);
        nextDateStr = nextDay.toISOString().split('T')[0].replace(/-/g, '');
      }
    } catch (dateError) {
      // Fallback to today
      const today = new Date();
      dateStr = today.toISOString().split('T')[0].replace(/-/g, '');
      const nextDay = new Date(today);
      nextDay.setDate(nextDay.getDate() + 1);
      nextDateStr = nextDay.toISOString().split('T')[0].replace(/-/g, '');
      console.log(`[ESPN Cricket] Date parse error, using today: ${dateStr}`);
    }
    
    // ESPN cricket scoreboard endpoint
    const url = `https://site.api.espn.com/apis/site/v2/sports/cricket/8676/scoreboard?dates=${dateStr}-${nextDateStr}`;
    
    console.log(`[ESPN Cricket] Searching for ${teamAName} vs ${teamBName} on ${matchDate}`);
    console.log(`[ESPN Cricket] URL: ${url}`);
    
    const response = await fetchWithRetry(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });
    
    if (!response.ok) {
      console.log(`[ESPN Cricket] Scoreboard request failed: ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    const events = data.events || [];
    
    console.log(`[ESPN Cricket] Found ${events.length} events`);
    
    for (const event of events) {
      const competitions = event.competitions || [];
      const competition = competitions[0];
      if (!competition) continue;
      
      const competitors = competition.competitors || [];
      if (competitors.length < 2) continue;
      
      const espnHomeTeam = competitors.find((c: any) => c.homeAway === 'home')?.team?.displayName || '';
      const espnAwayTeam = competitors.find((c: any) => c.homeAway === 'away')?.team?.displayName || '';
      
      const teamAMatches = teamsMatch(teamAName, espnHomeTeam) || teamsMatch(teamAName, espnAwayTeam);
      const teamBMatches = teamsMatch(teamBName, espnHomeTeam) || teamsMatch(teamBName, espnAwayTeam);
      
      if (teamAMatches && teamBMatches) {
        const eventId = event.id;
        console.log(`[ESPN Cricket] Found match! Event ID: ${eventId}`);
        
        // Fetch detailed data
        const detailedData = await fetchESPNMatchDetails(eventId);
        if (detailedData) {
          return { eventId, data: detailedData };
        }
        
        // If detailed fetch fails, return basic data
        return {
          eventId,
          data: {
            homeTeam: espnHomeTeam,
            awayTeam: espnAwayTeam,
            homeScore: competitors.find((c: any) => c.homeAway === 'home')?.score || null,
            awayScore: competitors.find((c: any) => c.homeAway === 'away')?.score || null,
            status: competition.status?.type?.name || 'unknown',
            statusInfo: competition.status?.type?.description || '',
            venue: competition.venue?.fullName || null,
            toss: null,
            eventLive: competition.status?.type?.name === 'in',
            batsmen: [],
            bowlers: [],
            extras: [],
            scorecard: [],
            playingXI: { home: [], away: [] },
          },
        };
      }
    }
    
    console.log(`[ESPN Cricket] No matching event found`);
    return null;
  } catch (error) {
    console.error(`[ESPN Cricket] Error finding match:`, error);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse request body
    let matchId: string | null = null;
    let action = 'sync';
    
    try {
      const body = await req.json();
      matchId = body?.matchId || null;
      action = body?.action || 'sync';
    } catch {
      // No body or invalid JSON
    }

    console.log(`[ESPN Cricket] Action: ${action}, Match ID: ${matchId}`);

    if (action === 'search') {
      // Search for ESPN event by team names
      const body = await req.clone().json().catch(() => ({}));
      const { teamAName, teamBName, matchDate } = body;
      
      if (!teamAName || !teamBName || !matchDate) {
        return new Response(
          JSON.stringify({ success: false, error: 'Missing teamAName, teamBName, or matchDate' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      const result = await findESPNMatch(teamAName, teamBName, matchDate);
      
      return new Response(
        JSON.stringify({ success: !!result, data: result }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get matches that need ESPN sync
    const now = new Date();
    const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);
    const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000);

    let matchQuery = supabase
      .from('matches')
      .select(`
        id,
        status,
        match_date,
        match_time,
        match_start_time,
        score_source,
        espn_event_id,
        last_api_sync,
        updated_at,
        score_a,
        score_b,
        team_a:teams!matches_team_a_id_fkey(id, name, short_name),
        team_b:teams!matches_team_b_id_fkey(id, name, short_name)
      `)
      .eq('score_source', 'espn');

    if (matchId) {
      matchQuery = matchQuery.eq('id', matchId);
    }

    const { data: matches, error: matchesError } = await matchQuery;

    if (matchesError) {
      console.error('[ESPN Cricket] Error fetching matches:', matchesError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to fetch matches' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!matches || matches.length === 0) {
      console.log('[ESPN Cricket] No matches to sync');
      return new Response(
        JSON.stringify({ success: true, message: 'No matches to sync', synced: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Filter matches that should be synced
    const matchesToSync = matches.filter(match => {
      if (matchId && match.id === matchId) return true;
      
      // Check sync interval (every 2 minutes)
      if (match.last_api_sync) {
        const lastSyncTime = new Date(match.last_api_sync).getTime();
        const timeSinceLastSync = now.getTime() - lastSyncTime;
        if (timeSinceLastSync < 120 * 1000) {
          return false;
        }
      }
      
      if (match.status === 'live') return true;
      
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

    console.log(`[ESPN Cricket] Found ${matchesToSync.length} matches to sync`);

    let syncedCount = 0;
    const results: any[] = [];

    for (const match of matchesToSync) {
      const teamA = match.team_a as any;
      const teamB = match.team_b as any;
      const teamAName = teamA?.name || '';
      const teamBName = teamB?.name || '';
      
      console.log(`[ESPN Cricket] Syncing: ${teamAName} vs ${teamBName}`);
      
      let espnData: ESPNScoreData | null = null;
      let eventId = match.espn_event_id;
      
      // If we have an event ID, fetch directly
      if (eventId) {
        espnData = await fetchESPNMatchDetails(eventId);
      }
      
      // If no event ID or fetch failed, search for the match
      if (!espnData) {
        const searchResult = await findESPNMatch(teamAName, teamBName, match.match_date);
        if (searchResult) {
          eventId = searchResult.eventId;
          espnData = searchResult.data;
        }
      }
      
      if (!espnData) {
        console.log(`[ESPN Cricket] No ESPN data found for ${teamAName} vs ${teamBName}`);
        results.push({ matchId: match.id, success: false, error: 'No ESPN data found' });
        continue;
      }
      
      // Determine which ESPN team maps to which DB team
      const isTeamAHome = teamsMatch(teamAName, espnData.homeTeam);
      const scoreA = isTeamAHome ? espnData.homeScore : espnData.awayScore;
      const scoreB = isTeamAHome ? espnData.awayScore : espnData.homeScore;
      
      // Update match with scores
      const updateData: any = {
        last_api_sync: new Date().toISOString(),
      };
      
      // Only update scores if we have non-empty values
      if (scoreA && scoreA.trim() !== '') {
        updateData.score_a = scoreA;
      }
      if (scoreB && scoreB.trim() !== '') {
        updateData.score_b = scoreB;
      }
      if (eventId && !match.espn_event_id) {
        updateData.espn_event_id = eventId;
      }
      
      const { error: updateError } = await supabase
        .from('matches')
        .update(updateData)
        .eq('id', match.id);
      
      if (updateError) {
        console.error(`[ESPN Cricket] Error updating match ${match.id}:`, updateError);
        results.push({ matchId: match.id, success: false, error: updateError.message });
        continue;
      }
      
      // Update match_api_scores with detailed data
      const apiScoreData = {
        match_id: match.id,
        home_team: espnData.homeTeam,
        away_team: espnData.awayTeam,
        home_score: espnData.homeScore,
        away_score: espnData.awayScore,
        status: espnData.status,
        status_info: espnData.statusInfo,
        venue: espnData.venue,
        toss: espnData.toss,
        event_live: espnData.eventLive,
        batsmen: espnData.batsmen,
        bowlers: espnData.bowlers,
        extras: espnData.extras,
        scorecard: espnData.scorecard,
        api_event_key: eventId,
        last_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      
      const { error: apiScoreError } = await supabase
        .from('match_api_scores')
        .upsert(apiScoreData, { onConflict: 'match_id' });
      
      if (apiScoreError) {
        console.error(`[ESPN Cricket] Error updating match_api_scores:`, apiScoreError);
      }
      
      // Sync Playing XI if available
      if (espnData.playingXI.home.length > 0 || espnData.playingXI.away.length > 0) {
        const homeTeamId = isTeamAHome ? teamA.id : teamB.id;
        const awayTeamId = isTeamAHome ? teamB.id : teamA.id;
        
        // Only insert if no existing playing XI
        const { data: existingXI } = await supabase
          .from('match_playing_xi')
          .select('id')
          .eq('match_id', match.id)
          .limit(1);
        
        if (!existingXI || existingXI.length === 0) {
          const playersToInsert: any[] = [];
          
          espnData.playingXI.home.forEach((player, index) => {
            playersToInsert.push({
              match_id: match.id,
              team_id: homeTeamId,
              player_name: player.name,
              player_role: player.role,
              is_captain: player.isCaptain,
              is_wicket_keeper: player.isWicketKeeper,
              batting_order: index + 1,
            });
          });
          
          espnData.playingXI.away.forEach((player, index) => {
            playersToInsert.push({
              match_id: match.id,
              team_id: awayTeamId,
              player_name: player.name,
              player_role: player.role,
              is_captain: player.isCaptain,
              is_wicket_keeper: player.isWicketKeeper,
              batting_order: index + 1,
            });
          });
          
          if (playersToInsert.length > 0) {
            const { error: xiError } = await supabase
              .from('match_playing_xi')
              .insert(playersToInsert);
            
            if (xiError) {
              console.error(`[ESPN Cricket] Error inserting playing XI:`, xiError);
            } else {
              console.log(`[ESPN Cricket] Inserted ${playersToInsert.length} players for match ${match.id}`);
            }
          }
        }
      }
      
      syncedCount++;
      results.push({
        matchId: match.id,
        success: true,
        scoreA,
        scoreB,
        eventId,
      });
      
      console.log(`[ESPN Cricket] Synced match ${match.id}: ${scoreA} vs ${scoreB}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Synced ${syncedCount} matches`,
        synced: syncedCount,
        results,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[ESPN Cricket] Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
