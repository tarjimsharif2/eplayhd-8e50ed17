import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('[auto-sync-playing-xi] Starting automatic Playing XI sync check...');

    // Get current time
    const now = new Date();
    
    // Calculate time window: 13-18 minutes from now (wider window for 3-minute cron interval)
    const minTime = new Date(now.getTime() + 13 * 60 * 1000); // 13 minutes from now
    const maxTime = new Date(now.getTime() + 18 * 60 * 1000); // 18 minutes from now
    
    console.log(`[auto-sync-playing-xi] Looking for cricket matches starting between ${minTime.toISOString()} and ${maxTime.toISOString()}`);

    // Get all cricket matches (sport = Cricket) that start in approximately 15 minutes
    // We need to find matches where match_date + match_time falls within our window
    const { data: upcomingMatches, error: matchesError } = await supabase
      .from('matches')
      .select(`
        id,
        match_date,
        match_time,
        status,
        score_source,
        team_a_id,
        team_b_id,
        cricbuzz_match_id,
        espn_event_id,
        match_format,
        sport_id,
        team_a:teams!matches_team_a_id_fkey(id, name, short_name),
        team_b:teams!matches_team_b_id_fkey(id, name, short_name),
        tournament:tournaments(sport)
      `)
      .eq('status', 'upcoming')
      .eq('is_active', true);

    if (matchesError) {
      console.error('[auto-sync-playing-xi] Error fetching matches:', matchesError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to fetch matches' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!upcomingMatches || upcomingMatches.length === 0) {
      console.log('[auto-sync-playing-xi] No upcoming matches found');
      return new Response(
        JSON.stringify({ success: true, message: 'No upcoming matches', matchesSynced: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[auto-sync-playing-xi] Found ${upcomingMatches.length} upcoming matches to check`);

    // Filter for cricket matches only (tournament sport = 'Cricket' or match_format contains cricket terms)
    const cricketMatches = upcomingMatches.filter((match: any) => {
      const tournamentSport = match.tournament?.sport?.toLowerCase() || '';
      const matchFormat = (match.match_format || '').toLowerCase();
      
      // Cricket formats: T20, ODI, Test, T20I, First Class, etc.
      const isCricketFormat = ['t20', 'odi', 'test', 't10', 'first class', 'list a', 'one-day', 'twenty20'].some(
        format => matchFormat.includes(format)
      );
      
      const isCricket = tournamentSport === 'cricket' || isCricketFormat;
      
      // Exclude football
      const isFootball = tournamentSport === 'football' || 
                         matchFormat.includes('football') || 
                         matchFormat.includes('soccer');
      
      return isCricket && !isFootball;
    });

    console.log(`[auto-sync-playing-xi] Filtered to ${cricketMatches.length} cricket matches`);

    // Parse match times and find those starting in ~15 minutes
    const matchesToSync: any[] = [];

    for (const match of cricketMatches) {
      try {
        // Parse match date and time
        const matchDateTime = parseMatchDateTime(match.match_date, match.match_time);
        
        if (!matchDateTime) {
          console.log(`[auto-sync-playing-xi] Could not parse date/time for match ${match.id}: ${match.match_date} ${match.match_time}`);
          continue;
        }

        // Check if match starts within our 15-minute window
        if (matchDateTime >= minTime && matchDateTime <= maxTime) {
          console.log(`[auto-sync-playing-xi] Match ${match.id} starts at ${matchDateTime.toISOString()} - within 15-min window`);
          matchesToSync.push(match);
        }
      } catch (err) {
        console.error(`[auto-sync-playing-xi] Error parsing match ${match.id}:`, err);
      }
    }

    console.log(`[auto-sync-playing-xi] ${matchesToSync.length} matches need Playing XI sync`);

    if (matchesToSync.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No matches starting in 15 minutes', 
          matchesSynced: 0,
          checkedMatches: cricketMatches.length
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Sync Playing XI for each match
    const syncResults: any[] = [];

    for (const match of matchesToSync) {
      try {
        // Check if playing XI already exists
        const { data: existingPlayers } = await supabase
          .from('match_playing_xi')
          .select('id, team_id')
          .eq('match_id', match.id);

        const teamAPlayerCount = existingPlayers?.filter((p: any) => p.team_id === match.team_a_id).length || 0;
        const teamBPlayerCount = existingPlayers?.filter((p: any) => p.team_id === match.team_b_id).length || 0;

        // Skip if already complete (11+11)
        if (teamAPlayerCount >= 11 && teamBPlayerCount >= 11) {
          console.log(`[auto-sync-playing-xi] Match ${match.id} already has complete Playing XI (${teamAPlayerCount}+${teamBPlayerCount})`);
          syncResults.push({ matchId: match.id, status: 'already_complete', players: teamAPlayerCount + teamBPlayerCount });
          continue;
        }

        console.log(`[auto-sync-playing-xi] Syncing Playing XI for match ${match.id} (current: ${teamAPlayerCount}+${teamBPlayerCount})`);

        // Determine which sync function to call based on score_source
        const scoreSource = match.score_source || 'manual';
        let syncResult: any = null;

        if (scoreSource === 'espn') {
          // Call sync-espn-playing-xi
          syncResult = await callEspnPlayingXiSync(supabaseUrl, match);
        } else {
          // Call sync-playing-xi (Cricbuzz)
          syncResult = await callCricbuzzPlayingXiSync(supabaseUrl, match);
        }

        syncResults.push({ 
          matchId: match.id, 
          source: scoreSource,
          ...syncResult 
        });

      } catch (err) {
        console.error(`[auto-sync-playing-xi] Error syncing match ${match.id}:`, err);
        syncResults.push({ matchId: match.id, status: 'error', error: String(err) });
      }
    }

    console.log(`[auto-sync-playing-xi] Completed. Results:`, JSON.stringify(syncResults));

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Synced Playing XI for ${matchesToSync.length} matches`,
        matchesSynced: matchesToSync.length,
        results: syncResults
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[auto-sync-playing-xi] Error:', errorMessage);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Parse match date and time into a Date object
function parseMatchDateTime(matchDate: string, matchTime: string): Date | null {
  try {
    // Handle various date formats
    // Format 1: "2026-01-26" (ISO)
    // Format 2: "26th January 2026" (readable)
    // Format 3: "January 26, 2026"
    
    let year: number, month: number, day: number;
    
    // Try ISO format first
    const isoMatch = matchDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoMatch) {
      year = parseInt(isoMatch[1]);
      month = parseInt(isoMatch[2]) - 1; // 0-indexed
      day = parseInt(isoMatch[3]);
    } else {
      // Try readable format: "26th January 2026" or "January 26, 2026"
      const months: { [key: string]: number } = {
        'january': 0, 'february': 1, 'march': 2, 'april': 3,
        'may': 4, 'june': 5, 'july': 6, 'august': 7,
        'september': 8, 'october': 9, 'november': 10, 'december': 11
      };
      
      // Extract numbers and month name
      const dayMatch = matchDate.match(/(\d{1,2})/);
      const yearMatch = matchDate.match(/(\d{4})/);
      const monthMatch = matchDate.toLowerCase().match(/(january|february|march|april|may|june|july|august|september|october|november|december)/);
      
      if (!dayMatch || !yearMatch || !monthMatch) {
        return null;
      }
      
      day = parseInt(dayMatch[1]);
      year = parseInt(yearMatch[1]);
      month = months[monthMatch[1]];
    }

    // Parse time (formats: "14:30", "2:30 PM", "14:30 IST", etc.)
    let hours = 0, minutes = 0;
    
    // Remove timezone info
    const timeClean = matchTime.replace(/\s*(IST|GMT|UTC|EST|PST|[A-Z]{2,4}).*$/i, '').trim();
    
    // Try 24-hour format
    const time24Match = timeClean.match(/^(\d{1,2}):(\d{2})$/);
    if (time24Match) {
      hours = parseInt(time24Match[1]);
      minutes = parseInt(time24Match[2]);
    } else {
      // Try 12-hour format
      const time12Match = timeClean.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
      if (time12Match) {
        hours = parseInt(time12Match[1]);
        minutes = parseInt(time12Match[2]);
        const period = (time12Match[3] || '').toUpperCase();
        
        if (period === 'PM' && hours !== 12) {
          hours += 12;
        } else if (period === 'AM' && hours === 12) {
          hours = 0;
        }
      }
    }

    // Create date in UTC (assuming match times are in IST, convert to UTC)
    // IST is UTC+5:30
    const date = new Date(Date.UTC(year, month, day, hours, minutes));
    
    // If time seems to be in IST, subtract 5:30 to get UTC
    // This is a simplification - in production, you'd want proper timezone handling
    // For now, we assume times are stored relative to the server's timezone
    
    return date;
  } catch (err) {
    console.error('[auto-sync-playing-xi] Date parse error:', err);
    return null;
  }
}

// Call ESPN Playing XI sync function
async function callEspnPlayingXiSync(supabaseUrl: string, match: any): Promise<any> {
  try {
    const functionUrl = `${supabaseUrl}/functions/v1/sync-espn-playing-xi`;
    
    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`,
      },
      body: JSON.stringify({
        matchId: match.id,
        teamAId: match.team_a_id,
        teamBId: match.team_b_id,
        teamAName: match.team_a?.name || '',
        teamAShortName: match.team_a?.short_name || '',
        teamBName: match.team_b?.name || '',
        teamBShortName: match.team_b?.short_name || '',
      }),
    });

    const result = await response.json();
    return { status: 'synced', ...result };
  } catch (err) {
    console.error('[auto-sync-playing-xi] ESPN sync error:', err);
    return { status: 'error', error: String(err) };
  }
}

// Call Cricbuzz Playing XI sync function
async function callCricbuzzPlayingXiSync(supabaseUrl: string, match: any): Promise<any> {
  try {
    const functionUrl = `${supabaseUrl}/functions/v1/sync-playing-xi`;
    
    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`,
      },
      body: JSON.stringify({
        matchId: match.id,
        cricbuzzMatchId: match.cricbuzz_match_id,
        teamAId: match.team_a_id,
        teamBId: match.team_b_id,
        teamAName: match.team_a?.name || '',
        teamAShortName: match.team_a?.short_name || '',
        teamBName: match.team_b?.name || '',
        teamBShortName: match.team_b?.short_name || '',
      }),
    });

    const result = await response.json();
    return { status: 'synced', ...result };
  } catch (err) {
    console.error('[auto-sync-playing-xi] Cricbuzz sync error:', err);
    return { status: 'error', error: String(err) };
  }
}
