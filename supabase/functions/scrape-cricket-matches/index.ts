import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CricketMatch {
  homeTeam: string;
  awayTeam: string;
  homeScore: string | null;
  awayScore: string | null;
  status: string;
  matchFormat: string | null;
  competition: string | null;
  matchUrl: string | null;
  startTime: string | null;
  venue?: string | null;
  eventId?: string;
  matchNumber?: string | null;
  seriesName?: string | null;
  homeTeamLogo?: string | null;
  awayTeamLogo?: string | null;
}

// Series ID mappings
const SERIES_MAPPINGS: Record<string, string> = {
  'ipl': '8048',
  'bpl': '13652', 
  'psl': '8661',
  'bbl': '8044',
  'cpl': '11290',
  'icc-wc': '8604',
  'icc-t20wc': '8601',
  'asia-cup': '8532',
};

// Parse match data from ESPN API response
function parseMatchData(event: Record<string, unknown>, leagueName?: string): CricketMatch | null {
  const competition = (event.competitions as Record<string, unknown>[])?.[0];
  if (!competition) return null;
  
  const competitors = (competition.competitors as Record<string, unknown>[]) || [];
  if (competitors.length < 2) return null;
  
  const homeTeam = competitors.find((c) => c.homeAway === 'home') || competitors[0];
  const awayTeam = competitors.find((c) => c.homeAway === 'away') || competitors[1];
  
  if (!homeTeam || !awayTeam) return null;
  
  // Determine match status
  let status = 'Scheduled';
  const statusObj = competition.status as Record<string, unknown> | undefined;
  const statusType = (statusObj?.type as Record<string, unknown>)?.name as string || '';
  
  if (statusType === 'STATUS_IN_PROGRESS') {
    status = 'Live';
  } else if (statusType === 'STATUS_FINAL' || statusType === 'STATUS_FULL_TIME') {
    status = 'Completed';
  } else if (statusType === 'STATUS_POSTPONED') {
    status = 'Postponed';
  }
  
  // Get match format from name
  let matchFormat = 'T20';
  const eventName = (event.name as string)?.toLowerCase() || '';
  if (eventName.includes('test')) {
    matchFormat = 'Test';
  } else if (eventName.includes('odi')) {
    matchFormat = 'ODI';
  }
  
  // Get venue
  const venueObj = competition.venue as Record<string, unknown> | undefined;
  const venue = (venueObj?.fullName as string) || (venueObj?.shortName as string) || null;
  
  // Get series name
  const seasonObj = event.season as Record<string, unknown> | undefined;
  const leagueObj = event.league as Record<string, unknown> | undefined;
  const seriesName = (seasonObj?.name as string) || (leagueObj?.name as string) || leagueName || null;
  
  // Get match number from event name
  let matchNumber: string | null = null;
  const matchNumMatch = eventName.match(/(\d+)(st|nd|rd|th)\s*(t20|odi|test|match)/i);
  if (matchNumMatch) {
    matchNumber = `Match ${matchNumMatch[1]}`;
  }
  const matchPattern = eventName.match(/match\s*(\d+)/i);
  if (!matchNumber && matchPattern) {
    matchNumber = `Match ${matchPattern[1]}`;
  }
  // Also check for finals, semi-finals, etc.
  if (!matchNumber) {
    if (eventName.includes('final')) matchNumber = 'Final';
    else if (eventName.includes('semi')) matchNumber = 'Semi-Final';
    else if (eventName.includes('qualifier')) matchNumber = 'Qualifier';
  }
  
  // Get team info
  const homeTeamObj = homeTeam.team as Record<string, unknown> | undefined;
  const awayTeamObj = awayTeam.team as Record<string, unknown> | undefined;
  
  return {
    homeTeam: (homeTeamObj?.displayName as string) || (homeTeamObj?.name as string) || 'Unknown',
    awayTeam: (awayTeamObj?.displayName as string) || (awayTeamObj?.name as string) || 'Unknown',
    homeScore: (homeTeam.score as string) || null,
    awayScore: (awayTeam.score as string) || null,
    status,
    matchFormat,
    competition: seriesName,
    matchUrl: ((event.links as Record<string, unknown>[])?.[0]?.href as string) || null,
    startTime: (event.date as string) || (competition.date as string) || null,
    venue,
    eventId: event.id as string,
    matchNumber,
    seriesName,
    homeTeamLogo: (homeTeamObj?.logo as string) || null,
    awayTeamLogo: (awayTeamObj?.logo as string) || null,
  };
}

// Fetch from a single ESPN endpoint
async function fetchFromEndpoint(url: string, name: string): Promise<{events: Record<string, unknown>[], leagueName: string | null}> {
  try {
    console.log(`Fetching: ${url}`);
    
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });
    
    if (!response.ok) {
      console.log(`${name}: ${response.status}`);
      return { events: [], leagueName: null };
    }
    
    const data = await response.json();
    const events = data.events || [];
    const leagueName = data.leagues?.[0]?.name || name;
    console.log(`${name}: ${events.length} events`);
    
    return { events, leagueName };
  } catch (error) {
    console.error(`Error ${name}:`, error);
    return { events: [], leagueName: null };
  }
}

// Fetch all cricket matches from multiple ESPN endpoints
async function fetchESPNCricketScoreboard(): Promise<CricketMatch[]> {
  const matches: CricketMatch[] = [];
  const seenEventIds = new Set<string>();
  
  // ESPN Cricket uses numeric series IDs - these work based on previous logs
  const endpoints = [
    { url: 'https://site.api.espn.com/apis/site/v2/sports/cricket/8048/scoreboard', name: 'IPL' },
    { url: 'https://site.api.espn.com/apis/site/v2/sports/cricket/8661/scoreboard', name: 'PSL' },
    { url: 'https://site.api.espn.com/apis/site/v2/sports/cricket/13652/scoreboard', name: 'BPL' },
    { url: 'https://site.api.espn.com/apis/site/v2/sports/cricket/8044/scoreboard', name: 'BBL' },
    { url: 'https://site.api.espn.com/apis/site/v2/sports/cricket/11290/scoreboard', name: 'CPL' },
    { url: 'https://site.api.espn.com/apis/site/v2/sports/cricket/8604/scoreboard', name: 'ICC WC' },
    { url: 'https://site.api.espn.com/apis/site/v2/sports/cricket/8601/scoreboard', name: 'ICC T20 WC' },
    { url: 'https://site.api.espn.com/apis/site/v2/sports/cricket/8532/scoreboard', name: 'Asia Cup' },
  ];
  
  for (const endpoint of endpoints) {
    const { events, leagueName } = await fetchFromEndpoint(endpoint.url, endpoint.name);
    
    for (const event of events) {
      const eventId = event.id as string;
      if (eventId && seenEventIds.has(eventId)) continue;
      if (eventId) seenEventIds.add(eventId);
      
      const match = parseMatchData(event, leagueName || endpoint.name);
      if (match && match.homeTeam !== 'Unknown') {
        matches.push(match);
      }
    }
  }
  
  return matches;
}

// Fetch from specific ESPN cricket series
async function fetchESPNSeriesSchedule(seriesId: string): Promise<CricketMatch[]> {
  const matches: CricketMatch[] = [];
  
  // Resolve series slug to numeric ID if needed
  const numericId = SERIES_MAPPINGS[seriesId] || seriesId;
  
  const apiUrl = `https://site.api.espn.com/apis/site/v2/sports/cricket/${numericId}/scoreboard`;
  const { events, leagueName } = await fetchFromEndpoint(apiUrl, `Series ${numericId}`);
  
  for (const event of events) {
    const match = parseMatchData(event, leagueName || undefined);
    if (match && match.homeTeam !== 'Unknown') {
      matches.push(match);
    }
  }
  
  return matches;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { seriesId, source = 'all' } = await req.json().catch(() => ({}));
    
    console.log(`Cricket scrape request - seriesId: ${seriesId}, source: ${source}`);
    
    let matches: CricketMatch[] = [];
    
    if (seriesId && seriesId !== 'all') {
      // Fetch specific series
      matches = await fetchESPNSeriesSchedule(seriesId);
    } else {
      // Fetch all live/upcoming matches from all known series
      matches = await fetchESPNCricketScoreboard();
    }
    
    console.log(`Total cricket matches found: ${matches.length}`);
    
    return new Response(
      JSON.stringify({ 
        matches,
        count: matches.length,
        source: seriesId || 'all',
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    console.error('Error in scrape-cricket-matches:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage, matches: [] }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
