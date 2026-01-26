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

// ESPN Cricinfo API series IDs
const ESPN_CRICKET_SERIES: Record<string, string> = {
  'ipl': '8048',
  'bpl': '13652',
  'psl': '8661',
  'bbl': '8044',
  'cpl': '11290',
  'icc-wc': '1428',
  'icc-t20wc': '1456',
  'asia-cup': '2467',
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

// Fetch from ESPN Cricinfo API (multiple endpoints for all matches)
async function fetchESPNCricketScoreboard(): Promise<CricketMatch[]> {
  const matches: CricketMatch[] = [];
  const seenEventIds = new Set<string>();
  
  // Try multiple ESPN Cricket endpoints
  const endpoints = [
    { url: 'https://site.api.espn.com/apis/site/v2/sports/cricket/international/scoreboard', name: 'International' },
    { url: 'https://site.api.espn.com/apis/site/v2/sports/cricket/domestic/scoreboard', name: 'Domestic' },
    { url: 'https://site.api.espn.com/apis/site/v2/sports/cricket/8048/scoreboard', name: 'IPL' },
    { url: 'https://site.api.espn.com/apis/site/v2/sports/cricket/8661/scoreboard', name: 'PSL' },
    { url: 'https://site.api.espn.com/apis/site/v2/sports/cricket/13652/scoreboard', name: 'BPL' },
  ];
  
  for (const endpoint of endpoints) {
    try {
      console.log(`Fetching: ${endpoint.url}`);
      
      const response = await fetch(endpoint.url, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });
      
      if (!response.ok) {
        console.log(`ESPN Cricket API ${endpoint.name}: ${response.status}`);
        continue;
      }
      
      const data = await response.json();
      const events = data.events || [];
      console.log(`${endpoint.name}: ${events.length} events`);
      
      for (const event of events) {
        const eventId = event.id;
        if (seenEventIds.has(eventId)) continue;
        seenEventIds.add(eventId);
        
        const match = parseMatchData(event, endpoint.name);
        if (match) {
          matches.push(match);
        }
      }
    } catch (error) {
      console.error(`Error fetching ${endpoint.name}:`, error);
    }
  }
  
  return matches;
}

// Fetch from specific ESPN series
async function fetchESPNSeriesSchedule(seriesId: string): Promise<CricketMatch[]> {
  const matches: CricketMatch[] = [];
  
  // Generate date range: past 7 days to 30 days ahead
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 7);
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + 30);
  
  const formatDate = (d: Date) => d.toISOString().split('T')[0].replace(/-/g, '');
  const dateRange = `${formatDate(startDate)}-${formatDate(endDate)}`;
  
  const apiUrl = `https://site.api.espn.com/apis/site/v2/sports/cricket/${seriesId}/scoreboard?dates=${dateRange}`;
  
  try {
    console.log(`Fetching ESPN Cricket Series: ${apiUrl}`);
    
    const response = await fetch(apiUrl, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });
    
    if (!response.ok) {
      console.error(`ESPN Cricket Series API error: ${response.status}`);
      // Try without date range
      const fallbackUrl = `https://site.api.espn.com/apis/site/v2/sports/cricket/${seriesId}/scoreboard`;
      const fallbackResponse = await fetch(fallbackUrl, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });
      
      if (!fallbackResponse.ok) {
        return matches;
      }
      
      const fallbackData = await fallbackResponse.json();
      const leagueName = fallbackData.leagues?.[0]?.name || null;
      
      for (const event of fallbackData.events || []) {
        const match = parseMatchData(event, leagueName);
        if (match) {
          matches.push(match);
        }
      }
      return matches;
    }
    
    const data = await response.json();
    const leagueName = data.leagues?.[0]?.name || null;
    console.log(`ESPN Cricket Series returned ${data.events?.length || 0} events`);
    
    for (const event of data.events || []) {
      const match = parseMatchData(event, leagueName);
      if (match) {
        matches.push(match);
      }
    }
  } catch (error) {
    console.error('Error fetching ESPN Cricket Series:', error);
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
      const resolvedSeriesId = ESPN_CRICKET_SERIES[seriesId] || seriesId;
      matches = await fetchESPNSeriesSchedule(resolvedSeriesId);
    } else {
      // Fetch all live/upcoming matches
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
