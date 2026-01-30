import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CricbuzzMatch {
  homeTeam: string;
  awayTeam: string;
  homeScore: string | null;
  awayScore: string | null;
  status: string;
  matchFormat: string | null;
  competition: string | null;
  matchUrl: string | null;
  startTime: string | null;
  venue: string | null;
  eventId: string;
  matchNumber: string | null;
  seriesName: string | null;
  homeTeamLogo: string | null;
  awayTeamLogo: string | null;
  cricbuzzMatchId: string;
  seriesId: string | null;
}

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

// Extract match format from match description or type
function getMatchFormat(matchDesc: string, matchType: string): string {
  const desc = (matchDesc || matchType || '').toLowerCase();
  if (desc.includes('test')) return 'Test';
  if (desc.includes('odi') || desc.includes('one day')) return 'ODI';
  if (desc.includes('t20') || desc.includes('twenty20') || desc.includes('t-20')) return 'T20';
  return 'T20'; // Default
}

// Convert epoch to ISO string
function epochToIso(epoch: number | string | null): string | null {
  if (!epoch) return null;
  try {
    const ts = typeof epoch === 'string' ? parseInt(epoch) : epoch;
    return new Date(ts).toISOString();
  } catch {
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

    const body = await req.json();
    const { source = 'schedule', seriesId } = body;

    console.log(`[rapidapi-cricket-schedule] Fetching from source: ${source}, seriesId: ${seriesId || 'N/A'}`);

    // Get RapidAPI settings
    const { data: settings, error: settingsError } = await supabase
      .from('site_settings')
      .select('rapidapi_key, rapidapi_enabled, rapidapi_endpoints')
      .limit(1)
      .maybeSingle();

    if (settingsError || !settings?.rapidapi_enabled || !settings?.rapidapi_key) {
      return new Response(
        JSON.stringify({ success: false, error: 'RapidAPI is disabled or not configured' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const rapidApiKey = settings.rapidapi_key;
    const endpoints = settings.rapidapi_endpoints || {};
    const cricbuzzHost = endpoints.cricbuzz_host || 'cricbuzz-cricket.p.rapidapi.com';

    // Get endpoint paths with proper defaults
    const liveMatchesPath = endpoints.live_matches_endpoint || '/matches/v1/live';
    const recentMatchesPath = endpoints.recent_matches_endpoint || '/matches/v1/recent';
    const schedulePath = endpoints.schedule_endpoint || '/schedule/v1/all';
    const seriesMatchesPath = endpoints.series_matches_endpoint || '/series/v1/{series_id}/matches';

    console.log(`[rapidapi-cricket-schedule] Using host: ${cricbuzzHost}`);
    console.log(`[rapidapi-cricket-schedule] Endpoints - live: ${liveMatchesPath}, recent: ${recentMatchesPath}, schedule: ${schedulePath}`);

    let allMatches: CricbuzzMatch[] = [];
    const fetchedMatchIds = new Set<string>();

    // Determine which endpoints to fetch based on source
    const endpointsToFetch: string[] = [];
    
    if (seriesId && seriesId !== 'all') {
      // Fetch specific series matches
      const seriesPath = (seriesMatchesPath || '/series/v1/{series_id}/matches').replace('{series_id}', seriesId);
      endpointsToFetch.push(`https://${cricbuzzHost}${seriesPath}`);
      console.log(`[rapidapi-cricket-schedule] Fetching series: ${seriesId}`);
    } else if (source === 'live') {
      endpointsToFetch.push(`https://${cricbuzzHost}${liveMatchesPath}`);
    } else if (source === 'recent') {
      // Fetch both recent and schedule to get more upcoming matches
      endpointsToFetch.push(`https://${cricbuzzHost}${recentMatchesPath}`);
      endpointsToFetch.push(`https://${cricbuzzHost}${schedulePath}`);
    } else {
      // Schedule - fetch all sources for maximum coverage
      endpointsToFetch.push(`https://${cricbuzzHost}${schedulePath}`);
      endpointsToFetch.push(`https://${cricbuzzHost}${liveMatchesPath}`);
      endpointsToFetch.push(`https://${cricbuzzHost}${recentMatchesPath}`);
    }

    for (const endpoint of endpointsToFetch) {
      try {
        console.log(`[rapidapi-cricket-schedule] Fetching: ${endpoint}`);
        
        const response = await fetchWithRetry(endpoint, {
          method: 'GET',
          headers: {
            'x-rapidapi-host': cricbuzzHost,
            'x-rapidapi-key': rapidApiKey,
          },
        });

        if (!response.ok) {
          console.log(`[rapidapi-cricket-schedule] Endpoint error: ${response.status}`);
          continue;
        }

        const data = await response.json();
        
        // Handle schedule format
        if (endpoint.includes('/schedule/')) {
          const matchScheduleMap = data.matchScheduleMap || [];
          for (const scheduleItem of matchScheduleMap) {
            const scheduleList = scheduleItem.scheduleAdWrapper?.matchScheduleList || [];
            for (const scheduleMatch of scheduleList) {
              const matchInfoList = scheduleMatch.matchInfo || [];
              for (const matchInfo of matchInfoList) {
                const matchId = matchInfo.matchId?.toString();
                if (!matchId || fetchedMatchIds.has(matchId)) continue;
                fetchedMatchIds.add(matchId);

                const team1 = matchInfo.team1 || {};
                const team2 = matchInfo.team2 || {};
                const venueInfo = matchInfo.venueInfo || {};
                const series = matchInfo.seriesName || matchInfo.series?.name || scheduleMatch.seriesName || '';
                
                const match: CricbuzzMatch = {
                  homeTeam: team1.teamName || team1.teamSName || 'Team A',
                  awayTeam: team2.teamName || team2.teamSName || 'Team B',
                  homeScore: null,
                  awayScore: null,
                  status: matchInfo.state || matchInfo.status || 'Upcoming',
                  matchFormat: getMatchFormat(matchInfo.matchDesc || '', matchInfo.matchType || ''),
                  competition: series,
                  matchUrl: null,
                  startTime: epochToIso(matchInfo.startDate),
                  venue: venueInfo.ground || matchInfo.venue || null,
                  eventId: matchId,
                  matchNumber: matchInfo.matchDesc || null,
                  seriesName: series,
                  homeTeamLogo: team1.imageId ? `https://cricbuzz-cricket.p.rapidapi.com/img/v1/i1/c${team1.imageId}/i.jpg` : null,
                  awayTeamLogo: team2.imageId ? `https://cricbuzz-cricket.p.rapidapi.com/img/v1/i1/c${team2.imageId}/i.jpg` : null,
                  cricbuzzMatchId: matchId,
                  seriesId: matchInfo.seriesId?.toString() || null,
                };
                
                allMatches.push(match);
              }
            }
          }
        } 
        // Handle live/recent format
        else if (endpoint.includes('/matches/')) {
          const typeMatches = data.typeMatches || [];
          
          for (const typeMatch of typeMatches) {
            const seriesMatches = typeMatch.seriesMatches || [];
            for (const series of seriesMatches) {
              const matches = series.seriesAdWrapper?.matches || [];
              const seriesName = series.seriesAdWrapper?.seriesName || '';
              const sId = series.seriesAdWrapper?.seriesId?.toString() || null;
              
              for (const match of matches) {
                const matchInfo = match.matchInfo;
                if (!matchInfo) continue;
                
                const matchId = matchInfo.matchId?.toString();
                if (!matchId || fetchedMatchIds.has(matchId)) continue;
                fetchedMatchIds.add(matchId);
                
                const team1 = matchInfo.team1 || {};
                const team2 = matchInfo.team2 || {};
                const venueInfo = matchInfo.venueInfo || {};
                
                // Extract score from matchScore
                const matchScore = match.matchScore || {};
                const team1Score = matchScore.team1Score?.inngs1?.runs 
                  ? `${matchScore.team1Score.inngs1.runs}/${matchScore.team1Score.inngs1.wickets || 0}`
                  : null;
                const team2Score = matchScore.team2Score?.inngs1?.runs 
                  ? `${matchScore.team2Score.inngs1.runs}/${matchScore.team2Score.inngs1.wickets || 0}`
                  : null;
                
                const matchData: CricbuzzMatch = {
                  homeTeam: team1.teamName || team1.teamSName || 'Team A',
                  awayTeam: team2.teamName || team2.teamSName || 'Team B',
                  homeScore: team1Score,
                  awayScore: team2Score,
                  status: matchInfo.state || matchInfo.status || 'Upcoming',
                  matchFormat: getMatchFormat(matchInfo.matchDesc || '', matchInfo.matchType || ''),
                  competition: seriesName,
                  matchUrl: null,
                  startTime: epochToIso(matchInfo.startDate),
                  venue: venueInfo.ground || matchInfo.venue || null,
                  eventId: matchId,
                  matchNumber: matchInfo.matchDesc || null,
                  seriesName: seriesName,
                  homeTeamLogo: team1.imageId ? `https://cricbuzz-cricket.p.rapidapi.com/img/v1/i1/c${team1.imageId}/i.jpg` : null,
                  awayTeamLogo: team2.imageId ? `https://cricbuzz-cricket.p.rapidapi.com/img/v1/i1/c${team2.imageId}/i.jpg` : null,
                  cricbuzzMatchId: matchId,
                  seriesId: sId,
                };
                
                allMatches.push(matchData);
              }
            }
          }
        }
        // Handle series matches format
        else if (endpoint.includes('/series/') && endpoint.includes('/matches')) {
          const matchDetails = data.matchDetails || [];
          const seriesName = data.matchType || data.seriesName || '';
          
          for (const detail of matchDetails) {
            const matchDetailsMap = detail.matchDetailsMap || {};
            const matchList = matchDetailsMap.match || [];
            
            for (const match of matchList) {
              const matchInfo = match.matchInfo;
              if (!matchInfo) continue;
              
              const matchId = matchInfo.matchId?.toString();
              if (!matchId || fetchedMatchIds.has(matchId)) continue;
              fetchedMatchIds.add(matchId);
              
              const team1 = matchInfo.team1 || {};
              const team2 = matchInfo.team2 || {};
              const venueInfo = matchInfo.venueInfo || {};
              
              const matchScore = match.matchScore || {};
              const team1Score = matchScore.team1Score?.inngs1?.runs 
                ? `${matchScore.team1Score.inngs1.runs}/${matchScore.team1Score.inngs1.wickets || 0}`
                : null;
              const team2Score = matchScore.team2Score?.inngs1?.runs 
                ? `${matchScore.team2Score.inngs1.runs}/${matchScore.team2Score.inngs1.wickets || 0}`
                : null;
              
              const matchData: CricbuzzMatch = {
                homeTeam: team1.teamName || team1.teamSName || 'Team A',
                awayTeam: team2.teamName || team2.teamSName || 'Team B',
                homeScore: team1Score,
                awayScore: team2Score,
                status: matchInfo.state || matchInfo.status || 'Upcoming',
                matchFormat: getMatchFormat(matchInfo.matchDesc || '', matchInfo.matchType || ''),
                competition: seriesName,
                matchUrl: null,
                startTime: epochToIso(matchInfo.startDate),
                venue: venueInfo.ground || matchInfo.venue || null,
                eventId: matchId,
                matchNumber: matchInfo.matchDesc || null,
                seriesName: seriesName,
                homeTeamLogo: team1.imageId ? `https://cricbuzz-cricket.p.rapidapi.com/img/v1/i1/c${team1.imageId}/i.jpg` : null,
                awayTeamLogo: team2.imageId ? `https://cricbuzz-cricket.p.rapidapi.com/img/v1/i1/c${team2.imageId}/i.jpg` : null,
                cricbuzzMatchId: matchId,
                seriesId: seriesId || null,
              };
              
              allMatches.push(matchData);
            }
          }
        }
      } catch (err) {
        console.error(`[rapidapi-cricket-schedule] Error fetching ${endpoint}:`, err);
      }
    }

    // Filter for upcoming 7 days if needed
    const now = new Date();
    const sevenDaysLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    
    // Filter matches for next 7 days (include matches without startTime as potentially upcoming)
    const upcomingMatches = allMatches.filter(match => {
      if (!match.startTime) return true; // Keep matches without time
      
      try {
        const matchDate = new Date(match.startTime);
        // Include matches from now to 7 days ahead
        return matchDate >= new Date(now.getTime() - 24 * 60 * 60 * 1000) && matchDate <= sevenDaysLater;
      } catch {
        return true;
      }
    });

    // Sort by start time
    upcomingMatches.sort((a, b) => {
      if (!a.startTime && !b.startTime) return 0;
      if (!a.startTime) return 1;
      if (!b.startTime) return -1;
      return new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
    });

    console.log(`[rapidapi-cricket-schedule] Found ${allMatches.length} total, ${upcomingMatches.length} in next 7 days`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        matches: upcomingMatches,
        count: upcomingMatches.length,
        totalFetched: allMatches.length,
        source: source
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('[rapidapi-cricket-schedule] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
