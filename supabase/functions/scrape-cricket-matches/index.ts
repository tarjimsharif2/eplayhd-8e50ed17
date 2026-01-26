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

// ESPN Cricket Series IDs - similar to football league codes
const ESPN_CRICKET_SERIES: Record<string, { id: string; name: string }> = {
  // Domestic T20 Leagues
  'ipl': { id: '8048', name: 'IPL' },
  'bpl': { id: '21245', name: 'BPL' },
  'psl': { id: '8661', name: 'PSL' },
  'bbl': { id: '8044', name: 'BBL' },
  'cpl': { id: '11290', name: 'CPL' },
  'sa20': { id: '21275', name: 'SA20' },
  'ilt20': { id: '21137', name: 'ILT20' },
  'wpl': { id: '21241', name: 'WPL' },
  // ICC Events
  'icc-wc': { id: '8604', name: 'ICC World Cup' },
  'icc-t20wc': { id: '8601', name: 'ICC T20 World Cup' },
  'icc-wtc': { id: '19430', name: 'ICC World Test Championship' },
  'asia-cup': { id: '8532', name: 'Asia Cup' },
  // Bilateral Series 2025
  'ind-vs-eng': { id: '22802', name: 'India vs England 2025' },
  'ind-vs-aus': { id: '22775', name: 'India vs Australia 2025' },
  'nz-in-ind': { id: '23697', name: 'New Zealand in India 2025' },
};

// Parse match data from ESPN API response
function parseMatchData(event: Record<string, unknown>, seriesName: string): CricketMatch | null {
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
  
  // Filter out completed matches - only return Live and Upcoming
  if (status === 'Completed') {
    return null;
  }
  
  // Get match format from event name
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
  // Check for finals, semi-finals, etc.
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

// Fetch matches for a specific series (without date range - ESPN cricket doesn't support it)
async function fetchESPNCricketSeries(seriesId: string, seriesName: string): Promise<CricketMatch[]> {
  const matches: CricketMatch[] = [];
  
  try {
    // ESPN Cricket API doesn't support date range like football - use simple scoreboard endpoint
    const apiUrl = `https://site.api.espn.com/apis/site/v2/sports/cricket/${seriesId}/scoreboard`;
    console.log(`Fetching: ${apiUrl}`);
    
    const response = await fetch(apiUrl, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });
    
    if (!response.ok) {
      console.log(`${seriesName}: HTTP ${response.status}`);
      return matches;
    }
    
    const data = await response.json();
    const events = data.events || [];
    console.log(`${seriesName}: ${events.length} events found`);
    
    for (const event of events) {
      const match = parseMatchData(event, seriesName);
      if (match && match.homeTeam !== 'Unknown') {
        matches.push(match);
      }
    }
  } catch (error) {
    console.error(`Error fetching ${seriesName}:`, error);
  }
  
  return matches;
}

// Fetch all cricket matches from multiple series (like football fetchESPNScores)
async function fetchAllCricketMatches(): Promise<CricketMatch[]> {
  const matches: CricketMatch[] = [];
  const seenEventIds = new Set<string>();
  
  // Iterate through all known series
  for (const [key, series] of Object.entries(ESPN_CRICKET_SERIES)) {
    const seriesMatches = await fetchESPNCricketSeries(series.id, series.name);
    
    for (const match of seriesMatches) {
      // Avoid duplicates by eventId
      if (match.eventId && seenEventIds.has(match.eventId)) continue;
      if (match.eventId) seenEventIds.add(match.eventId);
      
      matches.push(match);
    }
  }
  
  console.log(`Total cricket matches found: ${matches.length}`);
  return matches;
}

// Fetch specific series by key
async function fetchSpecificSeries(seriesKey: string): Promise<CricketMatch[]> {
  const series = ESPN_CRICKET_SERIES[seriesKey];
  
  if (!series) {
    // Try as numeric ID directly
    console.log(`Using direct series ID: ${seriesKey}`);
    return await fetchESPNCricketSeries(seriesKey, `Series ${seriesKey}`);
  }
  
  return await fetchESPNCricketSeries(series.id, series.name);
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
      matches = await fetchSpecificSeries(seriesId);
    } else {
      // Fetch all live/upcoming matches from all known series
      matches = await fetchAllCricketMatches();
    }
    
    return new Response(
      JSON.stringify({ 
        matches,
        count: matches.length,
        source: seriesId || 'all',
        availableSeries: Object.keys(ESPN_CRICKET_SERIES),
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
