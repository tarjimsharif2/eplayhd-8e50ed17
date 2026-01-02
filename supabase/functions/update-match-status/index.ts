import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    const now = new Date();
    console.log(`[${now.toISOString()}] Running match status update check...`);

    let updatedCount = 0;

    // ============================================
    // 1. Auto-start matches based on match_start_time
    // ============================================
    const { data: matchesToStart, error: startFetchError } = await supabase
      .from('matches')
      .select('id, match_format, match_start_time, status, day_start_time')
      .eq('status', 'upcoming')
      .not('match_start_time', 'is', null)
      .lte('match_start_time', now.toISOString());

    if (startFetchError) {
      console.error('Error fetching upcoming matches:', startFetchError);
    } else if (matchesToStart && matchesToStart.length > 0) {
      console.log(`Found ${matchesToStart.length} matches to auto-start`);
      
      for (const match of matchesToStart) {
        const updateData: Record<string, unknown> = { status: 'live' };
        
        // For Test matches, set to Day 1
        if (match.match_format === 'test') {
          updateData.test_day = 1;
        }

        const { error: updateError } = await supabase
          .from('matches')
          .update(updateData)
          .eq('id', match.id);

        if (updateError) {
          console.error(`Error starting match ${match.id}:`, updateError);
        } else {
          console.log(`Match ${match.id} auto-started${match.match_format === 'test' ? ' (Day 1)' : ''}`);
          updatedCount++;
        }
      }
    }

    // ============================================
    // 2. Auto-complete matches based on match_end_time
    // ============================================
    const { data: matchesToComplete, error: completeFetchError } = await supabase
      .from('matches')
      .select('id, match_end_time, match_format, status')
      .eq('status', 'live')
      .not('match_end_time', 'is', null)
      .lte('match_end_time', now.toISOString());

    if (completeFetchError) {
      console.error('Error fetching matches to complete:', completeFetchError);
    } else if (matchesToComplete && matchesToComplete.length > 0) {
      console.log(`Found ${matchesToComplete.length} matches to auto-complete based on end time`);
      
      for (const match of matchesToComplete) {
        // Skip Test matches - they should be completed manually
        if (match.match_format === 'test') {
          console.log(`Skipping Test match ${match.id} - Test matches are completed manually`);
          continue;
        }

        const { error: updateError } = await supabase
          .from('matches')
          .update({ status: 'completed' })
          .eq('id', match.id);

        if (updateError) {
          console.error(`Error completing match ${match.id}:`, updateError);
        } else {
          console.log(`Match ${match.id} auto-completed (past end time)`);
          updatedCount++;
        }
      }
    }

    // ============================================
    // 3. Auto-increment Test day when day_start_time is reached
    // For live Test matches, check if we're past the next day's start time
    // ============================================
    const { data: testMatchesForDayUpdate, error: testDayFetchError } = await supabase
      .from('matches')
      .select('id, match_format, test_day, is_stumps, next_day_start, day_start_time, match_start_time')
      .eq('match_format', 'test')
      .eq('status', 'live')
      .eq('is_stumps', true)
      .not('next_day_start', 'is', null);

    if (testDayFetchError) {
      console.error('Error fetching Test matches for day update:', testDayFetchError);
    } else if (testMatchesForDayUpdate && testMatchesForDayUpdate.length > 0) {
      console.log(`Checking ${testMatchesForDayUpdate.length} Test matches for day increment...`);
      
      for (const match of testMatchesForDayUpdate) {
        const nextDayStart = new Date(match.next_day_start);
        
        // If current time is past next_day_start, increment day and resume play
        if (now >= nextDayStart) {
          const newDay = (match.test_day || 1) + 1;
          
          const { error: updateError } = await supabase
            .from('matches')
            .update({
              test_day: newDay,
              is_stumps: false,
              stumps_time: null,
              next_day_start: null, // Clear until next stumps is called
            })
            .eq('id', match.id);

          if (updateError) {
            console.error(`Error updating Test match ${match.id} to Day ${newDay}:`, updateError);
          } else {
            console.log(`Match ${match.id} advanced to Day ${newDay} and resumed from STUMPS`);
            updatedCount++;
          }
        }
      }
    }

    // ============================================
    // 4. Auto-set STUMPS at stumps_time for live Test matches
    // ============================================
    const { data: testMatchesForStumps, error: stumpsFetchError } = await supabase
      .from('matches')
      .select('id, match_format, test_day, is_stumps, stumps_time, next_day_start')
      .eq('match_format', 'test')
      .eq('status', 'live')
      .eq('is_stumps', false)
      .not('stumps_time', 'is', null);

    if (stumpsFetchError) {
      console.error('Error fetching Test matches for STUMPS:', stumpsFetchError);
    } else if (testMatchesForStumps && testMatchesForStumps.length > 0) {
      console.log(`Checking ${testMatchesForStumps.length} Test matches for STUMPS...`);
      
      for (const match of testMatchesForStumps) {
        const stumpsTime = new Date(match.stumps_time);
        
        // If current time is past stumps_time, set STUMPS
        if (now >= stumpsTime) {
          const { error: updateError } = await supabase
            .from('matches')
            .update({
              is_stumps: true,
            })
            .eq('id', match.id);

          if (updateError) {
            console.error(`Error setting STUMPS for match ${match.id}:`, updateError);
          } else {
            console.log(`Match ${match.id} Day ${match.test_day} - STUMPS called automatically`);
            updatedCount++;
          }
        }
      }
    }

    // ============================================
    // 5. Resume from STUMPS (legacy check - for matches where next_day_start passed)
    // ============================================
    const { data: matchesToResume, error: fetchError } = await supabase
      .from('matches')
      .select('id, team_a_id, team_b_id, match_format, test_day, is_stumps, next_day_start, status')
      .eq('match_format', 'test')
      .eq('is_stumps', true)
      .eq('status', 'live')
      .not('next_day_start', 'is', null)
      .lte('next_day_start', now.toISOString());

    if (fetchError) {
      console.error('Error fetching matches to resume:', fetchError);
    } else {
      console.log(`Found ${matchesToResume?.length || 0} matches to resume from STUMPS`);
    }

    // Log summary
    console.log(`[${now.toISOString()}] Update complete. ${updatedCount} matches updated.`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Updated ${updatedCount} matches`,
        timestamp: now.toISOString()
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in update-match-status:', error);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});
