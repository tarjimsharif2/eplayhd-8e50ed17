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
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout
      
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
        // Exponential backoff: 1s, 2s, 4s
        const delay = Math.pow(2, attempt - 1) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError || new Error('Failed to fetch after retries');
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get the API key from site_settings
    const { data: settings, error: settingsError } = await supabase
      .from('site_settings')
      .select('api_cricket_key, api_cricket_enabled')
      .limit(1)
      .maybeSingle();

    if (settingsError) {
      console.error('Error fetching settings:', settingsError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to fetch settings' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!settings?.api_cricket_enabled) {
      return new Response(
        JSON.stringify({ success: false, error: 'API Cricket is disabled' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!settings?.api_cricket_key) {
      return new Response(
        JSON.stringify({ success: false, error: 'API Cricket key not configured' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const apiKey = settings.api_cricket_key;
    const body = await req.json();
    const { action, teamAName, teamBName, eventKey, matchId } = body;

    console.log(`API Cricket request - Action: ${action}, Teams: ${teamAName} vs ${teamBName}`);

    const normalizeTeamName = (name: string) => 
      name?.toLowerCase().replace(/[^a-z0-9]/g, '') || '';

    const teamANormalized = normalizeTeamName(teamAName);
    const teamBNormalized = normalizeTeamName(teamBName);

    // Helper to find matching event from API response
    const findMatchInEvents = (events: any[]) => {
      return events.find((event: any) => {
        const homeNormalized = normalizeTeamName(event.event_home_team);
        const awayNormalized = normalizeTeamName(event.event_away_team);
        
        return (
          (homeNormalized.includes(teamANormalized) || teamANormalized.includes(homeNormalized) ||
           homeNormalized.includes(teamBNormalized) || teamBNormalized.includes(homeNormalized)) &&
          (awayNormalized.includes(teamANormalized) || teamANormalized.includes(awayNormalized) ||
           awayNormalized.includes(teamBNormalized) || teamBNormalized.includes(awayNormalized))
        );
      });
    };

    // Helper to fetch events for a date range
    const fetchEventsForDateRange = async (startDate: string, endDate: string, eventKey?: string) => {
      let url = `https://apiv2.api-cricket.com/cricket/?method=get_events&APIkey=${apiKey}&date_start=${startDate}&date_stop=${endDate}`;
      
      // If event_key is provided, add it to get full details for that specific event
      if (eventKey) {
        url += `&event_key=${eventKey}`;
        console.log(`Fetching event details for event_key: ${eventKey}`);
      } else {
        console.log(`Fetching events from api-cricket.com for ${startDate} to ${endDate}`);
      }
      
      const response = await fetchWithRetry(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        console.error(`API Cricket error: ${response.status} ${response.statusText}`);
        return [];
      }

      const data = await response.json();

      if (!data.success || data.success !== 1) {
        console.error('API Cricket returned unsuccessful response:', data);
        return [];
      }

      return data.result || [];
    };

    // Helper to fetch event details by event_key for full scorecard data
    const fetchEventDetails = async (eventKey: string, eventDate: string) => {
      console.log(`Fetching detailed scorecard for event_key: ${eventKey}`);
      const events = await fetchEventsForDateRange(eventDate, eventDate, eventKey);
      return events.length > 0 ? events[0] : null;
    };

    // Helper to find matching event - searches today first, then past 7 days if not found
    const findMatchingEvent = async (includePastDays: boolean = false) => {
      const today = new Date().toISOString().split('T')[0];
      
      // First, try today's events
      let events = await fetchEventsForDateRange(today, today);
      let matchingEvent = findMatchInEvents(events);
      
      if (matchingEvent) {
        return matchingEvent;
      }
      
      // If not found and we should search past days (for completed matches)
      if (includePastDays) {
        const pastDate = new Date();
        pastDate.setDate(pastDate.getDate() - 7);
        const pastDateStr = pastDate.toISOString().split('T')[0];
        
        console.log(`Match not found today, searching past 7 days from ${pastDateStr}`);
        events = await fetchEventsForDateRange(pastDateStr, today);
        matchingEvent = findMatchInEvents(events);
      }
      
      return matchingEvent || null;
    };

    if (action === 'syncMatch' && matchId) {
      // Sync match scores from API to database - search past 7 days for completed matches
      const matchingEvent = await findMatchingEvent(true);
      
      if (!matchingEvent) {
        return new Response(
          JSON.stringify({ success: false, error: 'No matching event found' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log(`Found matching event for sync: ${matchingEvent.event_home_team} vs ${matchingEvent.event_away_team}`);

      // Determine match status
      let status: 'upcoming' | 'live' | 'completed' = 'upcoming';
      if (matchingEvent.event_live === '1') {
        status = 'live';
      } else if (matchingEvent.event_status === 'Finished' || matchingEvent.event_final_result) {
        status = 'completed';
      }

      // Update match in database
      const { error: updateError } = await supabase
        .from('matches')
        .update({
          score_a: matchingEvent.event_home_final_result || null,
          score_b: matchingEvent.event_away_final_result || null,
          status: status,
          last_api_sync: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', matchId);

      if (updateError) {
        console.error('Error updating match:', updateError);
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to update match in database' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          match: {
            eventKey: matchingEvent.event_key,
            homeTeam: matchingEvent.event_home_team,
            awayTeam: matchingEvent.event_away_team,
            homeScore: matchingEvent.event_home_final_result || '-',
            awayScore: matchingEvent.event_away_final_result || '-',
            status: matchingEvent.event_status,
            statusInfo: matchingEvent.event_status_info,
          }
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'getLiveScore') {
      // Search past 7 days for completed matches too
      let matchingEvent = await findMatchingEvent(true);

      if (matchingEvent) {
        console.log(`Found matching event: ${matchingEvent.event_home_team} vs ${matchingEvent.event_away_team}`);
        console.log(`Event status: ${matchingEvent.event_status}, Event key: ${matchingEvent.event_key}`);
        console.log(`Scorecard available: ${!!matchingEvent.scorecard}, Type: ${typeof matchingEvent.scorecard}`);
        
        // If no scorecard data in the initial response, fetch detailed event data
        if (!matchingEvent.scorecard && matchingEvent.event_key && matchingEvent.event_date_start) {
          console.log('No scorecard in initial response, fetching detailed event data...');
          const detailedEvent = await fetchEventDetails(matchingEvent.event_key, matchingEvent.event_date_start);
          if (detailedEvent) {
            matchingEvent = detailedEvent;
            console.log(`Detailed fetch - Scorecard available: ${!!matchingEvent.scorecard}`);
          }
        }
        
        if (matchingEvent.scorecard) {
          console.log(`Scorecard keys: ${Object.keys(matchingEvent.scorecard).join(', ')}`);
        }
        
        // Parse scorecard for batting/bowling details
        let batsmen: any[] = [];
        let bowlers: any[] = [];
        let extras: any[] = [];
        
        // Scorecard can be an object with innings keys (e.g., "Team 1 INN") or an array
        if (matchingEvent.scorecard) {
          const scorecardData = matchingEvent.scorecard;
          
          // Handle scorecard as object with innings keys
          if (typeof scorecardData === 'object' && !Array.isArray(scorecardData)) {
            Object.entries(scorecardData).forEach(([inningsKey, players]: [string, any]) => {
              // Track extras for this innings
              let inningsExtras = {
                wides: 0,
                noballs: 0,
                byes: 0,
                legbyes: 0,
                total: 0,
                team: inningsKey.replace(/ \d+ INN$/, ''),
                innings: inningsKey,
              };
              
              if (Array.isArray(players)) {
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
                      team: inningsKey.replace(/ \d+ INN$/, ''),
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
                      team: inningsKey.replace(/ \d+ INN$/, ''),
                      innings: inningsKey,
                    });
                  } else if (player.type === 'Extra' || player.player?.toLowerCase().includes('extra')) {
                    // Parse extras from the scorecard
                    const extraRuns = parseInt(player.R) || 0;
                    inningsExtras.total = extraRuns;
                    // Try to extract breakdown if available from player info or status
                    if (player.status) {
                      const status = player.status.toLowerCase();
                      const wdMatch = status.match(/wd[:\s]*(\d+)/i) || status.match(/wide[s]?[:\s]*(\d+)/i);
                      const nbMatch = status.match(/nb[:\s]*(\d+)/i) || status.match(/no.?ball[s]?[:\s]*(\d+)/i);
                      const bMatch = status.match(/\bb[:\s]*(\d+)/i) || status.match(/bye[s]?[:\s]*(\d+)/i);
                      const lbMatch = status.match(/lb[:\s]*(\d+)/i) || status.match(/leg.?bye[s]?[:\s]*(\d+)/i);
                      
                      if (wdMatch) inningsExtras.wides = parseInt(wdMatch[1]) || 0;
                      if (nbMatch) inningsExtras.noballs = parseInt(nbMatch[1]) || 0;
                      if (bMatch) inningsExtras.byes = parseInt(bMatch[1]) || 0;
                      if (lbMatch) inningsExtras.legbyes = parseInt(lbMatch[1]) || 0;
                    }
                  }
                });
              }
              
              // Add extras for this innings
              extras.push(inningsExtras);
            });
          }
          // Handle scorecard as array (legacy format)
          else if (Array.isArray(scorecardData)) {
            scorecardData.forEach((innings: any) => {
              if (innings.batting && Array.isArray(innings.batting)) {
                batsmen = [...batsmen, ...innings.batting.map((b: any) => ({
                  ...b,
                  team: innings.team,
                  innings: innings.innings,
                }))];
              }
              if (innings.bowling && Array.isArray(innings.bowling)) {
                bowlers = [...bowlers, ...innings.bowling.map((b: any) => ({
                  ...b,
                  team: innings.team,
                  innings: innings.innings,
                }))];
              }
              // Handle extras in array format
              if (innings.extras) {
                extras.push({
                  wides: innings.extras.wides || 0,
                  noballs: innings.extras.noballs || 0,
                  byes: innings.extras.byes || 0,
                  legbyes: innings.extras.legbyes || 0,
                  total: innings.extras.total || 0,
                  team: innings.team,
                  innings: innings.innings,
                });
              }
            });
          }
        }
        
        // Also try to get extras from the 'extra' field in the event
        if (matchingEvent.extra && typeof matchingEvent.extra === 'object') {
          console.log('Extra field data:', JSON.stringify(matchingEvent.extra));
        }
        
        console.log(`Parsed ${batsmen.length} batsmen, ${bowlers.length} bowlers, ${extras.length} extras entries`);
        
        // Calculate overs from bowlers data if not provided by API
        let homeOvers = matchingEvent.event_home_overs || null;
        let awayOvers = matchingEvent.event_away_overs || null;
        
        // If overs not available from API, try to calculate from scorecard
        if (!homeOvers || !awayOvers) {
          // Get unique innings
          const inningsData: Record<string, { team: string, totalOvers: number }> = {};
          
          bowlers.forEach((bowler: any) => {
            if (bowler.innings && bowler.overs) {
              if (!inningsData[bowler.innings]) {
                inningsData[bowler.innings] = { team: bowler.team, totalOvers: 0 };
              }
              // Parse overs (can be "4" or "4.3")
              const overs = parseFloat(bowler.overs) || 0;
              inningsData[bowler.innings].totalOvers += overs;
            }
          });
          
          // Assign overs to teams
          Object.entries(inningsData).forEach(([innings, data]) => {
            const teamLower = (data.team || '').toLowerCase();
            const homeTeamLower = (matchingEvent.event_home_team || '').toLowerCase();
            const awayTeamLower = (matchingEvent.event_away_team || '').toLowerCase();
            
            // Bowlers' team is the fielding team, so swap: if home team is bowling, away team is batting
            if (teamLower.includes(homeTeamLower.split(' ')[0]) || homeTeamLower.includes(teamLower.split(' ')[0])) {
              // Home team bowled, so away team batted these overs
              if (!awayOvers) awayOvers = data.totalOvers.toFixed(1);
            } else if (teamLower.includes(awayTeamLower.split(' ')[0]) || awayTeamLower.includes(teamLower.split(' ')[0])) {
              // Away team bowled, so home team batted these overs
              if (!homeOvers) homeOvers = data.totalOvers.toFixed(1);
            }
          });
        }
        
        console.log(`Overs - Home: ${homeOvers}, Away: ${awayOvers}`);
        
        return new Response(
          JSON.stringify({
            success: true,
            match: {
              eventKey: matchingEvent.event_key,
              homeTeam: matchingEvent.event_home_team,
              awayTeam: matchingEvent.event_away_team,
              homeTeamLogo: matchingEvent.event_home_team_logo,
              awayTeamLogo: matchingEvent.event_away_team_logo,
              homeScore: matchingEvent.event_home_final_result || '-',
              awayScore: matchingEvent.event_away_final_result || '-',
              homeOvers: homeOvers,
              awayOvers: awayOvers,
              homeRunRate: matchingEvent.event_home_rr,
              awayRunRate: matchingEvent.event_away_rr,
              status: matchingEvent.event_status,
              statusInfo: matchingEvent.event_status_info,
              eventLive: matchingEvent.event_live === '1',
              eventType: matchingEvent.event_type,
              toss: matchingEvent.event_toss,
              venue: matchingEvent.event_stadium,
              leagueName: matchingEvent.league_name,
              extra: matchingEvent.extra,
              scorecard: matchingEvent.scorecard,
              batsmen,
              bowlers,
              extras,
            }
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } else {
        console.log('No matching event found for teams:', teamAName, teamBName);
        return new Response(
          JSON.stringify({ success: true, match: null }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    if (action === 'getEventDetails' && eventKey) {
      // Fetch specific event details
      const today = new Date().toISOString().split('T')[0];
      const url = `https://apiv2.api-cricket.com/cricket/?method=get_events&APIkey=${apiKey}&event_key=${eventKey}&date_start=${today}&date_stop=${today}`;
      
      console.log(`Fetching event details for event_key: ${eventKey}`);
      
      const response = await fetchWithRetry(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        return new Response(
          JSON.stringify({ success: false, error: `API request failed: ${response.status}` }),
          { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const data = await response.json();
      
      if (data.success === 1 && data.result?.length > 0) {
        const event = data.result[0];
        return new Response(
          JSON.stringify({
            success: true,
            match: {
              eventKey: event.event_key,
              homeTeam: event.event_home_team,
              awayTeam: event.event_away_team,
              homeTeamLogo: event.event_home_team_logo,
              awayTeamLogo: event.event_away_team_logo,
              homeScore: event.event_home_final_result || '-',
              awayScore: event.event_away_final_result || '-',
              homeRunRate: event.event_home_rr,
              awayRunRate: event.event_away_rr,
              status: event.event_status,
              statusInfo: event.event_status_info,
              eventLive: event.event_live === '1',
              eventType: event.event_type,
              toss: event.event_toss,
              venue: event.event_stadium,
              leagueName: event.league_name,
              extra: event.extra,
              scorecard: event.scorecard,
              comments: event.comments,
              wickets: event.wickets,
            }
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      return new Response(
        JSON.stringify({ success: true, match: null }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: 'Invalid action' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('API Cricket edge function error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
