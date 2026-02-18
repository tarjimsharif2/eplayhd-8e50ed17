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

// Extract match format from match description, type, or direct matchFormat field
function getMatchFormat(matchDesc: string, matchType: string, matchFormatDirect?: string): string | null {
  // First check if matchFormat is directly provided by API
  if (matchFormatDirect) {
    const direct = matchFormatDirect.toLowerCase();
    if (direct === 'test') return 'Test';
    if (direct === 'odi') return 'ODI';
    if (direct === 't20' || direct === 't20i') return 'T20';
    if (direct === 't10') return 'T10';
  }
  
  const desc = (matchDesc || matchType || '').toLowerCase();
  if (desc.includes('test')) return 'Test';
  if (desc.includes('odi') || desc.includes('one day') || desc.includes('one-day')) return 'ODI';
  if (desc.includes('t10') || desc.includes('10 over')) return 'T10';
  if (desc.includes('t20') || desc.includes('twenty20') || desc.includes('t-20') || desc.includes('20 over')) return 'T20';
  // Check for common league names that imply T20
  if (desc.includes('ipl') || desc.includes('bpl') || desc.includes('psl') || desc.includes('bbl') || 
      desc.includes('cpl') || desc.includes('sa20') || desc.includes('ilt20') || desc.includes('wpl') ||
      desc.includes('premier league') || desc.includes('franchise')) return 'T20';
  return null; // Return null if format unknown - let importer handle
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
    const cricbuzzImageHost = endpoints.cricbuzz_image_host || 'cricbuzz-cricket.p.rapidapi.com/img/v1/i1/c';

    // Get endpoint paths with proper defaults
    const liveMatchesPath = endpoints.live_matches_endpoint || '/matches/v1/live';
    const recentMatchesPath = endpoints.recent_matches_endpoint || '/matches/v1/recent';
    const schedulePath = endpoints.schedule_endpoint || '/schedule/v1/all';
    const seriesMatchesPath = endpoints.series_matches_endpoint || '/series/v1/{series_id}';

    console.log(`[rapidapi-cricket-schedule] Using host: ${cricbuzzHost}, imageHost: ${cricbuzzImageHost}`);
    console.log(`[rapidapi-cricket-schedule] Endpoints - live: ${liveMatchesPath}, recent: ${recentMatchesPath}, schedule: ${schedulePath}`);

    let allMatches: CricbuzzMatch[] = [];
    const fetchedMatchIds = new Set<string>();

    // Determine which endpoints to fetch based on source
    const endpointsToFetch: { url: string; type: string }[] = [];
    
    if (seriesId && seriesId !== 'all') {
      // Try multiple endpoint formats for series matches
      // Format 1: /series/v1/{id}/matches (legacy)
      // Format 2: /series/list (then parse for specific series)
      // Format 3: Check matchDetails structure
      endpointsToFetch.push({ 
        url: `https://${cricbuzzHost}/series/v1/${seriesId}`, 
        type: 'series_info' 
      });
      console.log(`[rapidapi-cricket-schedule] Fetching series info: ${seriesId}`);
    } else if (source === 'live') {
      endpointsToFetch.push({ url: `https://${cricbuzzHost}${liveMatchesPath}`, type: 'matches' });
    } else if (source === 'upcoming') {
      // Focus on upcoming matches - fetch schedule and live
      endpointsToFetch.push({ url: `https://${cricbuzzHost}${schedulePath}`, type: 'schedule' });
      endpointsToFetch.push({ url: `https://${cricbuzzHost}${liveMatchesPath}`, type: 'matches' });
      console.log(`[rapidapi-cricket-schedule] Fetching upcoming matches (schedule + live)`);
    } else if (source === 'recent') {
      // Fetch both recent and schedule to get more upcoming matches
      endpointsToFetch.push({ url: `https://${cricbuzzHost}${recentMatchesPath}`, type: 'matches' });
      endpointsToFetch.push({ url: `https://${cricbuzzHost}${schedulePath}`, type: 'schedule' });
    } else {
      // Schedule - fetch all sources for maximum coverage
      endpointsToFetch.push({ url: `https://${cricbuzzHost}${schedulePath}`, type: 'schedule' });
      endpointsToFetch.push({ url: `https://${cricbuzzHost}${liveMatchesPath}`, type: 'matches' });
      endpointsToFetch.push({ url: `https://${cricbuzzHost}${recentMatchesPath}`, type: 'matches' });
    }

    for (const endpointInfo of endpointsToFetch) {
      try {
        console.log(`[rapidapi-cricket-schedule] Fetching: ${endpointInfo.url} (type: ${endpointInfo.type})`);
        
        const response = await fetchWithRetry(endpointInfo.url, {
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
        console.log(`[rapidapi-cricket-schedule] Response keys: ${Object.keys(data || {}).join(', ')}`);
        
        // Handle series info format - parse matchDetails from series info endpoint
        if (endpointInfo.type === 'series_info') {
          // Try matchDetails array directly
          const matchDetails = data.matchDetails || [];
          const seriesInfo = data.seriesInfo || data.seriesName || '';
          
          console.log(`[rapidapi-cricket-schedule] Series info - matchDetails count: ${matchDetails.length}`);
          
          for (const detail of matchDetails) {
            // Each detail might contain matchDetailsMap with key and match array
            const matchDetailsMap = detail.matchDetailsMap || {};
            const matchList = matchDetailsMap.match || [];
            
            console.log(`[rapidapi-cricket-schedule] matchDetailsMap keys: ${Object.keys(matchDetailsMap).join(', ')}, match count: ${matchList.length}`);
            
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
                matchFormat: getMatchFormat(matchInfo.matchDesc || '', matchInfo.matchType || '', matchInfo.matchFormat),
                competition: typeof seriesInfo === 'string' ? seriesInfo : (seriesInfo.seriesName || matchInfo.seriesName || ''),
                matchUrl: null,
                startTime: epochToIso(matchInfo.startDate),
                venue: venueInfo.ground || matchInfo.venue || null,
                eventId: matchId,
                matchNumber: matchInfo.matchDesc || null,
                seriesName: typeof seriesInfo === 'string' ? seriesInfo : (seriesInfo.seriesName || ''),
                homeTeamLogo: team1.imageId ? `https://${cricbuzzImageHost}${team1.imageId}/i.jpg` : null,
                awayTeamLogo: team2.imageId ? `https://${cricbuzzImageHost}${team2.imageId}/i.jpg` : null,
                cricbuzzMatchId: matchId,
                seriesId: seriesId || matchInfo.seriesId?.toString() || null,
              };
              
              allMatches.push(matchData);
              console.log(`[rapidapi-cricket-schedule] Added match: ${matchData.homeTeam} vs ${matchData.awayTeam}`);
            }
          }
        }
        // Handle schedule format
        else if (endpointInfo.type === 'schedule') {
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
                  matchFormat: getMatchFormat(matchInfo.matchDesc || '', matchInfo.matchType || '', matchInfo.matchFormat),
                  competition: series,
                  matchUrl: null,
                  startTime: epochToIso(matchInfo.startDate),
                  venue: venueInfo.ground || matchInfo.venue || null,
                  eventId: matchId,
                  matchNumber: matchInfo.matchDesc || null,
                  seriesName: series,
                  homeTeamLogo: team1.imageId ? `https://${cricbuzzImageHost}${team1.imageId}/i.jpg` : null,
                  awayTeamLogo: team2.imageId ? `https://${cricbuzzImageHost}${team2.imageId}/i.jpg` : null,
                  cricbuzzMatchId: matchId,
                  seriesId: matchInfo.seriesId?.toString() || null,
                };
                
                allMatches.push(match);
              }
            }
          }
        } 
        // Handle live/recent format
        else if (endpointInfo.type === 'matches') {
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
                  matchFormat: getMatchFormat(matchInfo.matchDesc || '', matchInfo.matchType || '', matchInfo.matchFormat),
                  competition: seriesName,
                  matchUrl: null,
                  startTime: epochToIso(matchInfo.startDate),
                  venue: venueInfo.ground || matchInfo.venue || null,
                  eventId: matchId,
                  matchNumber: matchInfo.matchDesc || null,
                  seriesName: seriesName,
                  homeTeamLogo: team1.imageId ? `https://${cricbuzzImageHost}${team1.imageId}/i.jpg` : null,
                  awayTeamLogo: team2.imageId ? `https://${cricbuzzImageHost}${team2.imageId}/i.jpg` : null,
                  cricbuzzMatchId: matchId,
                  seriesId: sId,
                };
                
                allMatches.push(matchData);
              }
            }
          }
        }
      } catch (err) {
        console.error(`[rapidapi-cricket-schedule] Error fetching ${endpointInfo.url}:`, err);
      }
    }

    // Filter for upcoming 7 days only for non-series requests
    // For series-specific requests, return ALL matches (no date filter)
    let upcomingMatches: CricbuzzMatch[];
    
    if (seriesId && seriesId !== 'all') {
      // Series-specific: return all matches without date filtering
      upcomingMatches = allMatches;
      console.log(`[rapidapi-cricket-schedule] Series fetch - returning all ${allMatches.length} matches (no date filter)`);
    } else {
      const now = new Date();
      const sevenDaysLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      
      upcomingMatches = allMatches.filter(match => {
        if (!match.startTime) return true;
        
        try {
          const matchDate = new Date(match.startTime);
          return matchDate >= new Date(now.getTime() - 24 * 60 * 60 * 1000) && matchDate <= sevenDaysLater;
        } catch {
          return true;
        }
      });
    }

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
