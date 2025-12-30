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
const normalizeTeamName = (name: string) => 
  name?.toLowerCase().replace(/[^a-z0-9]/g, '') || '';

// Match team name with more flexibility
const teamsMatch = (name1: string, name2: string): boolean => {
  const n1 = normalizeTeamName(name1);
  const n2 = normalizeTeamName(name2);
  
  if (n1 === n2) return true;
  if (n1.includes(n2) || n2.includes(n1)) return true;
  
  // Check first word match
  const first1 = n1.split(/\s+/)[0];
  const first2 = n2.split(/\s+/)[0];
  if (first1.length >= 3 && first2.length >= 3 && (first1.includes(first2) || first2.includes(first1))) {
    return true;
  }
  
  return false;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('[sync-api-scores] Starting scheduled API score sync...');

    // Get the API key and sync interval from site_settings
    const { data: settings, error: settingsError } = await supabase
      .from('site_settings')
      .select('api_cricket_key, api_cricket_enabled, api_sync_interval_seconds')
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
    
    console.log(`[sync-api-scores] Sync interval configured: ${syncIntervalSeconds} seconds`);

    // Get matches that need syncing
    const now = new Date();
    const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);
    
    const { data: matches, error: matchesError } = await supabase
      .from('matches')
      .select(`
        id,
        status,
        match_date,
        match_time,
        match_start_time,
        api_score_enabled,
        last_api_sync,
        team_a:teams!matches_team_a_id_fkey(name, short_name),
        team_b:teams!matches_team_b_id_fkey(name, short_name)
      `)
      .eq('api_score_enabled', true)
      .neq('status', 'completed')
      .order('match_date', { ascending: true });

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
      if (match.last_api_sync) {
        const lastSyncTime = new Date(match.last_api_sync).getTime();
        const timeSinceLastSync = now.getTime() - lastSyncTime;
        if (timeSinceLastSync < syncIntervalSeconds * 1000) {
          console.log(`[sync-api-scores] Skipping match ${match.id} - synced ${Math.round(timeSinceLastSync / 1000)}s ago`);
          return false;
        }
      }
      
      if (match.status === 'live') return true;
      
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

    let syncedCount = 0;

    // Process each match
    for (const match of matchesToSync) {
      const teamA = (match.team_a as unknown as { name: string; short_name: string }) || null;
      const teamB = (match.team_b as unknown as { name: string; short_name: string }) || null;
      const teamAName = teamA?.name || '';
      const teamBName = teamB?.name || '';
      const teamANormalized = normalizeTeamName(teamAName);
      const teamBNormalized = normalizeTeamName(teamBName);

      // Find matching event
      const matchingEvent = events.find((event: any) => {
        const homeNormalized = normalizeTeamName(event.event_home_team);
        const awayNormalized = normalizeTeamName(event.event_away_team);
        
        return (
          (homeNormalized.includes(teamANormalized) || teamANormalized.includes(homeNormalized) ||
           homeNormalized.includes(teamBNormalized) || teamBNormalized.includes(homeNormalized)) &&
          (awayNormalized.includes(teamANormalized) || teamANormalized.includes(awayNormalized) ||
           awayNormalized.includes(teamBNormalized) || teamBNormalized.includes(awayNormalized))
        );
      });

      if (!matchingEvent) {
        console.log(`[sync-api-scores] No matching event found for ${teamAName} vs ${teamBName}`);
        continue;
      }

      console.log(`[sync-api-scores] Found match: ${matchingEvent.event_home_team} vs ${matchingEvent.event_away_team}`);

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

      // Parse scorecard data
      let batsmen: any[] = [];
      let bowlers: any[] = [];
      let extras: any[] = [];
      
      if (detailedEvent.scorecard && typeof detailedEvent.scorecard === 'object') {
        Object.entries(detailedEvent.scorecard).forEach(([inningsKey, players]: [string, any]) => {
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
              }
            });
          }
        });
      }

      // Parse extras data
      if (detailedEvent.extra && typeof detailedEvent.extra === 'object') {
        Object.entries(detailedEvent.extra).forEach(([inningsKey, extrasData]: [string, any]) => {
          if (Array.isArray(extrasData) && extrasData.length > 0) {
            const firstEntry = extrasData[0];
            extras.push({
              innings: inningsKey,
              team: inningsKey.replace(/ \d+ INN$/, ''),
              wides: parseInt(firstEntry.wides) || 0,
              noballs: parseInt(firstEntry.noballs) || 0,
              byes: parseInt(firstEntry.byes) || 0,
              legbyes: parseInt(firstEntry.legbyes) || 0,
              total: parseInt(firstEntry.extras_total) || 0,
              total_overs: firstEntry.total_overs || null,
            });
          }
        });
      }

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
      const uniqueInnings = [...new Set(batsmen.map(b => b.innings).filter(Boolean))];
      
      for (const inningsName of uniqueInnings) {
        const inningsBatsmen = batsmen.filter(b => b.innings === inningsName);
        const teamName = inningsName.replace(/ \d+ INN$/i, '').trim();
        
        // Calculate total runs from batsmen
        let totalRuns = 0;
        let wickets = 0;
        
        inningsBatsmen.forEach(b => {
          totalRuns += parseInt(b.runs) || 0;
          if (b.how_out && b.how_out.toLowerCase() !== 'not out') {
            wickets++;
          }
        });
        
        // Add extras
        const inningsExtras = extras.find(e => e.innings === inningsName);
        if (inningsExtras) {
          totalRuns += inningsExtras.total || 0;
        }
        
        // Calculate overs from BOWLERS data
        const inningsBowlers = bowlers.filter(b => b.innings === inningsName);
        let totalBalls = 0;
        
        inningsBowlers.forEach(b => {
          const overs = parseFloat(b.overs) || 0;
          const fullOvers = Math.floor(overs);
          const balls = Math.round((overs - fullOvers) * 10);
          totalBalls += (fullOvers * 6) + balls;
        });
        
        const fullOvers = Math.floor(totalBalls / 6);
        const remainingBalls = totalBalls % 6;
        const oversStr = totalBalls > 0 
          ? (remainingBalls > 0 ? `${fullOvers}.${remainingBalls}` : `${fullOvers}`)
          : null;
        
        const scoreStr = `${totalRuns}/${wickets}`;
        const scoreWithOvers = oversStr ? `${scoreStr} (${oversStr} ov)` : scoreStr;
        
        console.log(`[sync-api-scores] Innings "${inningsName}": ${scoreWithOvers} from ${inningsBatsmen.length} batsmen, ${inningsBowlers.length} bowlers`);
        
        inningsStats.push({
          inningsName,
          teamName,
          totalRuns,
          wickets,
          overs: oversStr,
          scoreWithOvers,
        });
      }

      // NOW: Match innings to teamA/teamB directly (not home/away)
      // This is the key fix - use teamA/teamB names from our database
      let scoreA: string | null = null;
      let scoreB: string | null = null;
      let oversA: string | null = null;
      let oversB: string | null = null;
      
      for (const stats of inningsStats) {
        // Check if this innings belongs to teamA
        if (teamsMatch(stats.teamName, teamAName)) {
          if (!scoreA || stats.totalRuns > 0) {
            scoreA = stats.scoreWithOvers;
            oversA = stats.overs;
            console.log(`[sync-api-scores] Matched "${stats.teamName}" -> teamA "${teamAName}": ${scoreA}`);
          }
        }
        // Check if this innings belongs to teamB
        else if (teamsMatch(stats.teamName, teamBName)) {
          if (!scoreB || stats.totalRuns > 0) {
            scoreB = stats.scoreWithOvers;
            oversB = stats.overs;
            console.log(`[sync-api-scores] Matched "${stats.teamName}" -> teamB "${teamBName}": ${scoreB}`);
          }
        }
      }

      // Also map to home/away for the API scores table
      const homeTeamLower = (detailedEvent.event_home_team || '').toLowerCase().trim();
      const awayTeamLower = (detailedEvent.event_away_team || '').toLowerCase().trim();
      
      let homeScore: string | null = null;
      let homeOvers: string | null = null;
      let awayScore: string | null = null;
      let awayOvers: string | null = null;
      
      for (const stats of inningsStats) {
        if (teamsMatch(stats.teamName, homeTeamLower)) {
          homeScore = stats.scoreWithOvers;
          homeOvers = stats.overs;
        } else if (teamsMatch(stats.teamName, awayTeamLower)) {
          awayScore = stats.scoreWithOvers;
          awayOvers = stats.overs;
        }
      }

      // Fallback to API data if no batsmen data
      if (!homeScore && detailedEvent.event_home_final_result) {
        homeScore = detailedEvent.event_home_final_result;
      }
      if (!awayScore && detailedEvent.event_away_final_result) {
        awayScore = detailedEvent.event_away_final_result;
      }

      console.log(`[sync-api-scores] Final scores: scoreA=${scoreA}, scoreB=${scoreB} | home=${homeScore}, away=${awayScore}`);

      // Determine match status
      let matchStatus: 'upcoming' | 'live' | 'completed' = 'upcoming';
      if (detailedEvent.event_live === '1') {
        matchStatus = 'live';
      } else if (detailedEvent.event_status === 'Finished' || detailedEvent.event_final_result) {
        matchStatus = 'completed';
      }

      // Upsert to match_api_scores
      const { error: upsertError } = await supabase
        .from('match_api_scores')
        .upsert({
          match_id: match.id,
          home_team: detailedEvent.event_home_team,
          away_team: detailedEvent.event_away_team,
          home_score: homeScore,
          away_score: awayScore,
          home_overs: homeOvers,
          away_overs: awayOvers,
          status: detailedEvent.event_status,
          status_info: detailedEvent.event_status_info,
          event_live: detailedEvent.event_live === '1',
          venue: detailedEvent.event_stadium,
          toss: detailedEvent.event_toss,
          batsmen: batsmen,
          bowlers: bowlers,
          extras: extras,
          api_event_key: detailedEvent.event_key,
          last_synced_at: new Date().toISOString(),
        }, {
          onConflict: 'match_id',
        });

      if (upsertError) {
        console.error(`[sync-api-scores] Error upserting score for match ${match.id}:`, upsertError);
        continue;
      }

      // UPDATE matches table with correct teamA/teamB scores
      const matchUpdate: any = { 
        last_api_sync: new Date().toISOString(),
      };
      
      if (scoreA) matchUpdate.score_a = scoreA;
      if (scoreB) matchUpdate.score_b = scoreB;
      if (match.status !== matchStatus) matchUpdate.status = matchStatus;

      await supabase
        .from('matches')
        .update(matchUpdate)
        .eq('id', match.id);

      console.log(`[sync-api-scores] Synced match: ${teamAName} vs ${teamBName}`);
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
