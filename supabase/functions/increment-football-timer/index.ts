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
    const { data: matches, error: matchesError } = await supabase
      .from('matches')
      .select('id, match_minute, status, sport_id')
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
    const updates: { id: string; from: number; to: number | null; paused?: boolean }[] = [];

    for (const match of matches as FootballMatch[]) {
      const currentMinute = match.match_minute ?? 0;
      
      // Pause points where timer should stop:
      // - 45: Halftime (end of 1st half)
      // - 90: Full Time (end of regular time) - needs manual resume for extra time
      // - 105: Extra Time Halftime (end of ET 1st half)
      // - 120: After Extra Time (end of ET 2nd half)
      const pausePoints = [45, 90, 105, 120];
      
      if (pausePoints.includes(currentMinute)) {
        const pauseLabels: Record<number, string> = {
          45: 'HALFTIME',
          90: 'FULL TIME',
          105: 'ET HALFTIME',
          120: 'AFTER EXTRA TIME'
        };
        console.log(`[increment-football-timer] Match ${match.id} at pause point: ${pauseLabels[currentMinute]} (${currentMinute}')`);
        updates.push({ id: match.id, from: currentMinute, to: null, paused: true });
        continue;
      }
      
      // Don't increment beyond 120 minutes
      if (currentMinute >= 120) {
        console.log(`[increment-football-timer] Match ${match.id} has completed extra time (${currentMinute}')`);
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

      // Log when reaching pause points
      if (newMinute === 45) {
        console.log(`[increment-football-timer] Match ${match.id} reached HALFTIME (45') - Timer paused`);
      } else if (newMinute === 90) {
        console.log(`[increment-football-timer] Match ${match.id} reached FULL TIME (90') - Timer paused. Start Extra Time manually if needed.`);
      } else if (newMinute === 105) {
        console.log(`[increment-football-timer] Match ${match.id} reached ET HALFTIME (105') - Timer paused`);
      } else if (newMinute === 120) {
        console.log(`[increment-football-timer] Match ${match.id} reached AFTER EXTRA TIME (120') - Match should end`);
      }
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
