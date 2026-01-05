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
    // 2. Auto-complete matches based on match_end_time or calculated duration
    // This applies to BOTH 'live' AND 'upcoming' matches that have passed their end time
    // ============================================
    const { data: matchesToComplete, error: completeFetchError } = await supabase
      .from('matches')
      .select('id, match_end_time, match_start_time, match_duration_minutes, match_format, status')
      .in('status', ['live', 'upcoming']);

    if (completeFetchError) {
      console.error('Error fetching matches for completion check:', completeFetchError);
    } else if (matchesToComplete && matchesToComplete.length > 0) {
      console.log(`Checking ${matchesToComplete.length} matches for auto-complete...`);
      
      for (const match of matchesToComplete) {
        let shouldComplete = false;
        let completionReason = '';

        // Check if match_end_time is set and passed
        if (match.match_end_time) {
          const endTime = new Date(match.match_end_time);
          if (now >= endTime) {
            shouldComplete = true;
            completionReason = `past end time (was ${match.status})`;
          }
        } 
        // Fallback: calculate end time from start time + duration
        else if (match.match_start_time && match.match_duration_minutes) {
          const startTime = new Date(match.match_start_time);
          const durationMs = match.match_duration_minutes * 60 * 1000;
          const calculatedEndTime = new Date(startTime.getTime() + durationMs);
          
          if (now >= calculatedEndTime) {
            shouldComplete = true;
            completionReason = `past calculated duration ${match.match_duration_minutes} mins (was ${match.status})`;
          }
        }

        if (shouldComplete) {
          const { error: updateError } = await supabase
            .from('matches')
            .update({ status: 'completed' })
            .eq('id', match.id);

          if (updateError) {
            console.error(`Error completing match ${match.id}:`, updateError);
          } else {
            console.log(`Match ${match.id} auto-completed - ${completionReason}${match.match_format === 'test' ? ' (Test match)' : ''}`);
            updatedCount++;
          }
        }
      }
    }

    // ============================================
    // 3. Auto-resume Test matches from STUMPS when day_start_time is reached
    // Uses day_start_time (daily play start) to determine when to resume
    // ============================================
    const { data: testMatchesForDayUpdate, error: testDayFetchError } = await supabase
      .from('matches')
      .select('id, match_format, test_day, is_stumps, next_day_start, day_start_time, match_start_time')
      .eq('match_format', 'test')
      .eq('status', 'live')
      .eq('is_stumps', true);

    if (testDayFetchError) {
      console.error('Error fetching Test matches for day update:', testDayFetchError);
    } else if (testMatchesForDayUpdate && testMatchesForDayUpdate.length > 0) {
      console.log(`Checking ${testMatchesForDayUpdate.length} Test matches for resume from STUMPS...`);
      
      for (const match of testMatchesForDayUpdate) {
        let shouldResume = false;
        let resumeTime: Date | null = null;

        // Priority 1: Use next_day_start if set
        if (match.next_day_start) {
          resumeTime = new Date(match.next_day_start);
          if (now >= resumeTime) {
            shouldResume = true;
            console.log(`Match ${match.id}: Using next_day_start ${resumeTime.toISOString()}`);
          }
        }
        // Priority 2: Use day_start_time (HH:MM format) to calculate today's resume time
        else if (match.day_start_time) {
          // day_start_time is in HH:MM format, calculate today's resume datetime
          const [hours, minutes] = match.day_start_time.split(':').map(Number);
          const todayResumeTime = new Date();
          todayResumeTime.setHours(hours, minutes, 0, 0);
          
          // If current time is past today's day_start_time, resume play
          if (now >= todayResumeTime) {
            shouldResume = true;
            resumeTime = todayResumeTime;
            console.log(`Match ${match.id}: Using day_start_time ${match.day_start_time} -> ${todayResumeTime.toISOString()}`);
          }
        }

        if (shouldResume) {
          const newDay = (match.test_day || 1) + 1;
          
          const { error: updateError } = await supabase
            .from('matches')
            .update({
              test_day: newDay,
              is_stumps: false,
              next_day_start: null, // Clear until next stumps is called
            })
            .eq('id', match.id);

          if (updateError) {
            console.error(`Error updating Test match ${match.id} to Day ${newDay}:`, updateError);
          } else {
            console.log(`Match ${match.id} advanced to Day ${newDay} and resumed from STUMPS at ${resumeTime?.toISOString()}`);
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
    // 5. Clear stale cache - force refetch for any updated match
    // ============================================
    if (updatedCount > 0) {
      console.log(`${updatedCount} matches updated - clients should refetch data`);
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
