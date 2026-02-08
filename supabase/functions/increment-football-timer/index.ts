import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface FootballMatch {
  id: string;
  match_minute: number | null;
  status: string;
  sport_id: string;
}

interface Sport {
  id: string;
  name: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('[increment-football-timer] Starting timer increment...');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // First, get all sports that are football/soccer
    const { data: sports, error: sportsError } = await supabase
      .from('sports')
      .select('id, name')
      .or('name.ilike.%football%,name.ilike.%soccer%');

    if (sportsError) {
      console.error('[increment-football-timer] Error fetching sports:', sportsError);
      throw sportsError;
    }

    if (!sports || sports.length === 0) {
      console.log('[increment-football-timer] No football/soccer sports found');
      return new Response(JSON.stringify({ message: 'No football sports configured' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    const footballSportIds = sports.map((s: Sport) => s.id);
    console.log(`[increment-football-timer] Football sport IDs: ${footballSportIds.join(', ')}`);

    // Fetch live football matches with a running timer (match_minute is not null and > 0)
    // SKIP matches with auto_sync_enabled — those get minutes from ESPN via auto-sync-football
    const { data: matches, error: matchesError } = await supabase
      .from('matches')
      .select('id, match_minute, status, sport_id, match_start_time, auto_sync_enabled')
      .eq('status', 'live')
      .in('sport_id', footballSportIds)
      .not('match_minute', 'is', null)
      .gt('match_minute', -1); // match_minute >= 0 means timer was started

    if (matchesError) {
      console.error('[increment-football-timer] Error fetching matches:', matchesError);
      throw matchesError;
    }

    if (!matches || matches.length === 0) {
      console.log('[increment-football-timer] No live football matches with active timers');
      return new Response(JSON.stringify({ message: 'No matches to update', updated: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    console.log(`[increment-football-timer] Found ${matches.length} live football matches with timers`);

    let updatedCount = 0;
    const updates: { id: string; from: number; to: number | null; paused?: boolean; autoResumed?: boolean }[] = [];

    for (const match of matches) {
      
      const currentMinute = match.match_minute ?? 0;
      
      // Pause points where timer should stop temporarily:
      // - 45: Halftime (end of 1st half) — auto-resumes after ~15 min break
      // - 90: Full Time (end of regular time) — needs manual resume for extra time
      // - 105: Extra Time Halftime (end of ET 1st half) — auto-resumes after ~5 min
      // - 120: After Extra Time (end of ET 2nd half) — permanent stop
      
      // Check if at a pause point
      if (currentMinute === 45 || currentMinute === 105) {
        // Auto-resume logic: check if enough break time has passed using match_start_time
        let shouldResume = false;
        
        if (match.match_start_time) {
          const startTime = new Date(match.match_start_time).getTime();
          const elapsedMinutes = (Date.now() - startTime) / 1000 / 60;
          
          if (currentMinute === 45) {
            // 1st half = 45 min + ~2 min stoppage + 15 min break = ~62 min from start
            // Resume 2nd half if at least 60 min have passed from kick-off
            shouldResume = elapsedMinutes >= 60;
            if (shouldResume) {
              console.log(`[increment-football-timer] Match ${match.id}: Auto-resuming after HALFTIME (elapsed: ${Math.floor(elapsedMinutes)} min from start)`);
            }
          } else if (currentMinute === 105) {
            // ET 1st half done. ET halftime is ~5 min.
            // Total from start: 45+15+45+2+15+5 = ~127 min
            shouldResume = elapsedMinutes >= 125;
            if (shouldResume) {
              console.log(`[increment-football-timer] Match ${match.id}: Auto-resuming after ET HALFTIME (elapsed: ${Math.floor(elapsedMinutes)} min from start)`);
            }
          }
        }
        
        if (!shouldResume) {
          const pauseLabels: Record<number, string> = { 45: 'HALFTIME', 105: 'ET HALFTIME' };
          console.log(`[increment-football-timer] Match ${match.id} at pause point: ${pauseLabels[currentMinute]} (${currentMinute}')`);
          updates.push({ id: match.id, from: currentMinute, to: null, paused: true });
          continue;
        }
        
        // Auto-resume: calculate correct minute from match_start_time
        const startTime = new Date(match.match_start_time!).getTime();
        const elapsedMinutes = (Date.now() - startTime) / 1000 / 60;
        
        let newMinute: number;
        if (currentMinute === 45) {
          // 2nd half: subtract ~15 min break from elapsed
          newMinute = Math.min(Math.floor(elapsedMinutes - 15), 90);
        } else {
          // ET 2nd half: subtract ~35 min total breaks (15 HT + 15 before ET + 5 ET HT)
          newMinute = Math.min(Math.floor(elapsedMinutes - 35), 120);
        }
        
        // Ensure we move forward
        newMinute = Math.max(newMinute, currentMinute + 1);
        
        const { error: updateError } = await supabase
          .from('matches')
          .update({ match_minute: newMinute })
          .eq('id', match.id);
          
        if (!updateError) {
          console.log(`[increment-football-timer] Match ${match.id}: AUTO-RESUMED ${currentMinute}' → ${newMinute}'`);
          updates.push({ id: match.id, from: currentMinute, to: newMinute, autoResumed: true });
          updatedCount++;
        }
        continue;
      }
      
      // Full Time (90) and After Extra Time (120) - require manual intervention
      if (currentMinute === 90 || currentMinute >= 120) {
        const label = currentMinute >= 120 ? 'AFTER EXTRA TIME' : 'FULL TIME';
        console.log(`[increment-football-timer] Match ${match.id} at ${label} (${currentMinute}') - needs manual action`);
        updates.push({ id: match.id, from: currentMinute, to: null, paused: true });
        continue;
      }

      const newMinute = currentMinute + 1;
      
      // Update the match minute
      const { error: updateError } = await supabase
        .from('matches')
        .update({ match_minute: newMinute })
        .eq('id', match.id);

      if (updateError) {
        console.error(`[increment-football-timer] Error updating match ${match.id}:`, updateError);
        continue;
      }

      console.log(`[increment-football-timer] Match ${match.id}: ${currentMinute}' → ${newMinute}'`);
      updates.push({ id: match.id, from: currentMinute, to: newMinute });
      updatedCount++;
    }

    console.log(`[increment-football-timer] Completed. Updated ${updatedCount}/${matches.length} matches`);

    return new Response(JSON.stringify({ 
      message: 'Timer increment complete',
      updated: updatedCount,
      total: matches.length,
      details: updates
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[increment-football-timer] Error:', errorMessage);
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
