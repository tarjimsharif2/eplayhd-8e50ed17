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
  'u19-wc': { id: '1511849', name: 'ICC U19 World Cup 2026' },
  // Bilateral Series 2025-26
  'ind-vs-eng': { id: '22802', name: 'India vs England 2025' },
  'aus-vs-ind': { id: '23265', name: 'Australia vs India 2025-26' },
  'nz-in-ind': { id: '23697', name: 'New Zealand in India 2025' },
  'sa-vs-wi': { id: '1477604', name: 'SA vs West Indies 2025-26' },
  'eng-vs-wi': { id: '1384428', name: 'England vs West Indies 2025' },
  'pak-vs-wi': { id: '1384430', name: 'Pakistan vs West Indies 2025' },
  'ct2025': { id: '1475248', name: 'ICC Champions Trophy 2025' },
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
  
  // Filter out old matches (more than 7 days ago)
  const matchDate = new Date(event.date as string || (competition.date as string) || '');
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  
  if (matchDate < sevenDaysAgo) {
    console.log(`Skipping old match: ${matchDate.toISOString()}`);
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

// Fetch matches for a specific series using multiple endpoints - GET ALL FIXTURES
async function fetchESPNCricketSeries(seriesId: string, seriesName: string): Promise<CricketMatch[]> {
  const matches: CricketMatch[] = [];
  const seenEventIds = new Set<string>();
  
  // Method 1: Try ESPN Cricinfo API v2 series fixtures (best for full fixture list)
  try {
    const cricinfoUrl = `https://hs-consumer-api.espncricinfo.com/v1/pages/series/schedule?seriesId=${seriesId}`;
    console.log(`Trying Cricinfo schedule API: ${cricinfoUrl}`);
    
    const cricinfoResponse = await fetch(cricinfoUrl, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Origin': 'https://www.espncricinfo.com',
        'Referer': 'https://www.espncricinfo.com/',
      },
    });
    
    if (cricinfoResponse.ok) {
      const cricinfoData = await cricinfoResponse.json();
      const scheduleData = cricinfoData.content?.matches || cricinfoData.content?.matchList || 
                          cricinfoData.matchList || cricinfoData.matches || [];
      console.log(`Cricinfo schedule API: ${scheduleData.length} matches found`);
      
      for (const matchItem of scheduleData) {
        const match = parseCricinfoMatch(matchItem, seriesName);
        if (match && match.homeTeam !== 'Unknown') {
          const uniqueKey = `${match.homeTeam}-${match.awayTeam}-${match.startTime}`;
          if (seenEventIds.has(uniqueKey)) continue;
          seenEventIds.add(uniqueKey);
          matches.push(match);
        }
      }
      
      if (matches.length > 0) {
        console.log(`${seriesName}: Got ${matches.length} matches from Cricinfo schedule API`);
        return matches;
      }
    } else {
      console.log(`Cricinfo schedule API: HTTP ${cricinfoResponse.status}`);
    }
  } catch (error) {
    console.error(`Cricinfo schedule API error:`, error);
  }
  
  // Method 2: Try ESPN Cricinfo home API (returns series fixtures)
  try {
    const homeUrl = `https://hs-consumer-api.espncricinfo.com/v1/pages/series/home?seriesId=${seriesId}`;
    console.log(`Trying Cricinfo home API: ${homeUrl}`);
    
    const homeResponse = await fetch(homeUrl, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Origin': 'https://www.espncricinfo.com',
        'Referer': 'https://www.espncricinfo.com/',
      },
    });
    
    if (homeResponse.ok) {
      const homeData = await homeResponse.json();
      // Look for fixtures in various locations
      const allMatches = homeData.content?.recentFixtures || 
                        homeData.content?.upcomingMatches ||
                        homeData.content?.matches ||
                        homeData.content?.fixtures ||
                        [];
      console.log(`Cricinfo home API: ${allMatches.length} fixtures found`);
      
      for (const matchItem of allMatches) {
        const match = parseCricinfoMatch(matchItem, seriesName);
        if (match && match.homeTeam !== 'Unknown') {
          const uniqueKey = `${match.homeTeam}-${match.awayTeam}-${match.startTime}`;
          if (seenEventIds.has(uniqueKey)) continue;
          seenEventIds.add(uniqueKey);
          matches.push(match);
        }
      }
      
      if (matches.length > 0) {
        console.log(`${seriesName}: Got ${matches.length} matches from Cricinfo home API`);
        return matches;
      }
    } else {
      console.log(`Cricinfo home API: HTTP ${homeResponse.status}`);
    }
  } catch (error) {
    console.error(`Cricinfo home API error:`, error);
  }
  
  // Method 3: Try ESPN.in schedule page API 
  try {
    const scheduleUrl = `https://site.web.api.espn.com/apis/site/v2/sports/cricket/${seriesId}/schedule?lang=en&region=in`;
    console.log(`Trying ESPN schedule API: ${scheduleUrl}`);
    
    const scheduleResponse = await fetch(scheduleUrl, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });
    
    if (scheduleResponse.ok) {
      const scheduleData = await scheduleResponse.json();
      const eventsByDate = scheduleData.events || [];
      
      if (Array.isArray(eventsByDate)) {
        for (const event of eventsByDate) {
          const eventId = event.id as string;
          if (eventId && seenEventIds.has(eventId)) continue;
          if (eventId) seenEventIds.add(eventId);
          
          const match = parseMatchData(event, seriesName);
          if (match && match.homeTeam !== 'Unknown') {
            matches.push(match);
          }
        }
      } else if (typeof eventsByDate === 'object') {
        for (const dateKey of Object.keys(eventsByDate)) {
          const dayEvents = eventsByDate[dateKey];
          if (Array.isArray(dayEvents)) {
            for (const event of dayEvents) {
              const eventId = event.id as string;
              if (eventId && seenEventIds.has(eventId)) continue;
              if (eventId) seenEventIds.add(eventId);
              
              const match = parseMatchData(event, seriesName);
              if (match && match.homeTeam !== 'Unknown') {
                matches.push(match);
              }
            }
          }
        }
      }
      
      if (matches.length > 0) {
        console.log(`${seriesName}: Got ${matches.length} matches from ESPN schedule API`);
        return matches;
      }
    } else {
      console.log(`ESPN schedule API: HTTP ${scheduleResponse.status}`);
    }
  } catch (error) {
    console.error(`ESPN schedule API error:`, error);
  }
  
  // Method 4: Try ESPN series events API
  try {
    const seriesEventsUrl = `https://site.web.api.espn.com/apis/site/v2/sports/cricket/series/${seriesId}/events?lang=en&region=in`;
    console.log(`Trying ESPN series events API: ${seriesEventsUrl}`);
    
    const seriesResponse = await fetch(seriesEventsUrl, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });
    
    if (seriesResponse.ok) {
      const seriesData = await seriesResponse.json();
      const events = seriesData.events || [];
      console.log(`ESPN series events API: ${events.length} events found`);
      
      for (const event of events) {
        const eventId = event.id as string;
        if (eventId && seenEventIds.has(eventId)) continue;
        if (eventId) seenEventIds.add(eventId);
        
        const match = parseMatchData(event, seriesName);
        if (match && match.homeTeam !== 'Unknown') {
          matches.push(match);
        }
      }
      
      if (matches.length > 0) {
        console.log(`${seriesName}: Got ${matches.length} matches from series events API`);
        return matches;
      }
    } else {
      console.log(`ESPN series events API: HTTP ${seriesResponse.status}`);
    }
  } catch (error) {
    console.error(`ESPN series events API error:`, error);
  }
  
  // Method 5: Fallback to ESPN scoreboard API (only current/next matches)
  try {
    const apiUrl = `https://site.api.espn.com/apis/site/v2/sports/cricket/${seriesId}/scoreboard`;
    console.log(`Fallback to ESPN scoreboard: ${apiUrl}`);
    
    const response = await fetch(apiUrl, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });
    
    if (response.ok) {
      const data = await response.json();
      const events = data.events || [];
      console.log(`ESPN scoreboard: ${events.length} events found`);
      
      for (const event of events) {
        const eventId = event.id as string;
        if (eventId && seenEventIds.has(eventId)) continue;
        if (eventId) seenEventIds.add(eventId);
        
        const match = parseMatchData(event, seriesName);
        if (match && match.homeTeam !== 'Unknown') {
          matches.push(match);
        }
      }
    }
  } catch (error) {
    console.error(`ESPN scoreboard error:`, error);
  }
  
  console.log(`${seriesName}: Total ${matches.length} matches`);
  return matches;
}

// Parse Cricinfo match data format
function parseCricinfoMatch(matchData: Record<string, unknown>, seriesName: string): CricketMatch | null {
  try {
    const teams = (matchData.teams as Record<string, unknown>[]) || [];
    const team1 = teams[0] || {};
    const team2 = teams[1] || {};
    
    const team1Info = team1.team as Record<string, unknown> || {};
    const team2Info = team2.team as Record<string, unknown> || {};
    
    // Determine status
    let status = 'Scheduled';
    const matchState = (matchData.state as string)?.toLowerCase() || '';
    const stageValue = (matchData.stage as string)?.toLowerCase() || '';
    
    if (matchState.includes('live') || stageValue.includes('running')) {
      status = 'Live';
    } else if (matchState.includes('complete') || matchState.includes('result') || stageValue.includes('finished')) {
      status = 'Completed';
    }
    
    // Filter out completed matches
    if (status === 'Completed') {
      return null;
    }
    
    // Filter out old matches
    const startTime = (matchData.startDate as string) || (matchData.startTime as string) || '';
    if (startTime) {
      const matchDate = new Date(startTime);
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      if (matchDate < sevenDaysAgo) {
        return null;
      }
    }
    
    // Get match format
    let matchFormat = 'T20';
    const formatStr = ((matchData.format as string) || '').toLowerCase();
    if (formatStr.includes('test')) matchFormat = 'Test';
    else if (formatStr.includes('odi')) matchFormat = 'ODI';
    
    // Get match number/title
    let matchNumber: string | null = null;
    const title = (matchData.title as string) || '';
    const titleMatch = title.match(/(\d+)(st|nd|rd|th)\s*(t20|odi|test|match)/i);
    if (titleMatch) matchNumber = `Match ${titleMatch[1]}`;
    
    return {
      homeTeam: (team1Info.longName as string) || (team1Info.name as string) || 'Unknown',
      awayTeam: (team2Info.longName as string) || (team2Info.name as string) || 'Unknown',
      homeScore: (team1.score as string) || null,
      awayScore: (team2.score as string) || null,
      status,
      matchFormat,
      competition: seriesName,
      matchUrl: matchData.slug ? `https://www.espncricinfo.com/series/${seriesName.toLowerCase().replace(/\s+/g, '-')}/${matchData.slug}` : null,
      startTime: startTime || null,
      venue: ((matchData.ground as Record<string, unknown>)?.name as string) || null,
      eventId: (matchData.objectId as string) || (matchData.id as string) || undefined,
      matchNumber,
      seriesName,
      homeTeamLogo: (team1Info.image as Record<string, unknown>)?.url as string || null,
      awayTeamLogo: (team2Info.image as Record<string, unknown>)?.url as string || null,
    };
  } catch (error) {
    console.error('Error parsing Cricinfo match:', error);
    return null;
  }
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
