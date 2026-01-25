import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyAdminAuth, unauthorizedResponse, forbiddenResponse } from '../_shared/auth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // This is a scheduled/cron function - allow calls from:
  // 1. Valid cron secret via x-cron-secret header
  // 2. Internal pg_cron calls (no auth or anon key)
  // 3. Valid admin user authentication (for manual triggers)
  
  const cronSecret = req.headers.get('x-cron-secret');
  const expectedCronSecret = Deno.env.get('CRON_SECRET_TOKEN');
  const authHeader = req.headers.get('authorization');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  
  // Check if this is a cron secret call
  const isCronSecretCall = cronSecret && cronSecret === expectedCronSecret;
  // Check if this is an internal call (no auth or using anon key - pg_cron uses anon key)
  const isInternalCall = !authHeader || (authHeader && authHeader.replace('Bearer ', '') === anonKey);
  
  if (isCronSecretCall) {
    console.log('[update-match-status] Authenticated via cron secret');
  } else if (isInternalCall) {
    console.log('[update-match-status] Internal/cron call (anon key or no auth)');
  } else {
    // Has non-anon auth header - verify admin authentication
    const { user, error: authError } = await verifyAdminAuth(req);
    if (authError) {
      console.log('[update-match-status] Auth failed:', authError);
      if (authError === 'Admin access required') {
        return forbiddenResponse(authError, corsHeaders);
      }
      return unauthorizedResponse(authError, corsHeaders);
    }
    console.log(`[update-match-status] Authenticated admin: ${user.id}`);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    const now = new Date();
    console.log(`[${now.toISOString()}] Running match status update check...`);

    let updatedCount = 0;

    // ============================================
    // 1. Auto-complete matches FIRST - before auto-start
    // This prevents race condition where old matches are started then immediately completed
    // Applies to BOTH 'live' AND 'upcoming' matches that have passed their end time
    // 
    // For Cricket: Only complete matches that have EXPLICIT end time or duration set!
    // For Football: Use default 120 minutes (2 hours) if no explicit duration
    // 
    // ALL matches (including api_score_enabled) are completed based on scheduled time.
    // API sync only updates scores, NOT status. Status is managed here based on time.
    // ============================================
    
    // Default durations by sport (in minutes) - for football matches
    const DEFAULT_DURATIONS: Record<string, number> = {
      'football': 120, // 2 hours including halftime/stoppage
      'soccer': 120,
    };
    
    // Fetch all live/upcoming matches (except Test) for completion check
    // Also exclude matches with manual_status_override = true
    // NOTE: Use .or() for match_format check because .neq() excludes NULL values
    const { data: matchesToComplete, error: completeFetchError } = await supabase
      .from('matches')
      .select(`
        id, match_end_time, match_start_time, match_duration_minutes, match_format, status, manual_status_override,
        sport:sport_id(name)
      `)
      .in('status', ['live', 'upcoming'])
      .or('match_format.is.null,match_format.neq.test') // Don't auto-complete Test matches by time
      .neq('manual_status_override', true); // Skip manually overridden matches

    const completedMatchIds: string[] = [];
    
    if (completeFetchError) {
      console.error('Error fetching matches for completion check:', completeFetchError);
    } else if (matchesToComplete && matchesToComplete.length > 0) {
      // Filter to only those with end criteria (end_time or duration)
      const matchesWithEndCriteria = matchesToComplete.filter(m => 
        m.match_end_time || m.match_duration_minutes || 
        (m.sport as { name?: string })?.name?.toLowerCase()?.includes('football') ||
        (m.sport as { name?: string })?.name?.toLowerCase()?.includes('soccer')
      );
      
      console.log(`Total live/upcoming matches: ${matchesToComplete.length}, with end criteria: ${matchesWithEndCriteria.length}`);
      
      if (matchesWithEndCriteria.length > 0) {
        console.log(`Checking ${matchesWithEndCriteria.length} matches for auto-complete...`);
        
        for (const match of matchesWithEndCriteria) {
          let shouldComplete = false;
          let completionReason = '';
          const sportName = (match.sport as { name?: string })?.name?.toLowerCase() || '';

          // Priority 1: Check if match_end_time is set and passed
          if (match.match_end_time) {
            const endTime = new Date(match.match_end_time);
            if (now >= endTime) {
              shouldComplete = true;
              completionReason = `past explicit end time ${endTime.toISOString()} (was ${match.status})`;
            }
          } 
          // Priority 2: Calculate end time from start time + duration
          else if (match.match_start_time) {
            const startTime = new Date(match.match_start_time);
            
            // Use explicit duration, or sport-based default for football
            let durationMinutes = match.match_duration_minutes;
            if (!durationMinutes) {
              // Check if this is a football match - use default duration
              if (sportName.includes('football') || sportName.includes('soccer')) {
                durationMinutes = DEFAULT_DURATIONS['football'];
              }
            }
            
            // Only complete if we have a duration (explicit or default for football)
            if (durationMinutes) {
              const durationMs = durationMinutes * 60 * 1000;
              const calculatedEndTime = new Date(startTime.getTime() + durationMs);
              
              console.log(`Match ${match.id} (${sportName}): start=${startTime.toISOString()}, duration=${durationMinutes}min, end=${calculatedEndTime.toISOString()}, now=${now.toISOString()}`);
              
              if (now >= calculatedEndTime) {
                shouldComplete = true;
                completionReason = `past duration ${durationMinutes} mins, end: ${calculatedEndTime.toISOString()} (was ${match.status})`;
              }
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
              console.log(`Match ${match.id} auto-completed - ${completionReason}`);
              completedMatchIds.push(match.id);
              updatedCount++;
            }
          }
        }
      }
    }

    // ============================================
    // 2. Auto-start matches based on match_start_time
    // ONLY start matches that weren't just completed above
    // ============================================
    // Also exclude matches with manual_status_override = true
    const { data: matchesToStart, error: startFetchError } = await supabase
      .from('matches')
      .select(`
        id, match_format, match_start_time, status, day_start_time, match_end_time, match_duration_minutes, manual_status_override,
        sport:sport_id(name)
      `)
      .eq('status', 'upcoming')
      .neq('manual_status_override', true) // Skip manually overridden matches
      .not('match_start_time', 'is', null)
      .lte('match_start_time', now.toISOString());

    if (startFetchError) {
      console.error('Error fetching upcoming matches:', startFetchError);
    } else if (matchesToStart && matchesToStart.length > 0) {
      // Filter out matches that were just completed above
      const validMatchesToStart = matchesToStart.filter(m => !completedMatchIds.includes(m.id));
      
      if (validMatchesToStart.length > 0) {
        console.log(`Found ${validMatchesToStart.length} matches to auto-start`);
        
        for (const match of validMatchesToStart) {
          // Additional check: Don't start if match has explicit end time/duration and it's already passed
          // Only skip/complete if there's EXPLICIT end criteria - don't use defaults
          let shouldSkip = false;
          
          if (match.match_end_time) {
            const endTime = new Date(match.match_end_time);
            if (now >= endTime) {
              shouldSkip = true;
              console.log(`Skipping match ${match.id} - already past explicit end time ${endTime.toISOString()}`);
            }
          } else if (match.match_start_time) {
            const startTime = new Date(match.match_start_time);
            
            // Use explicit duration, or sport-based default for football
            let durationMinutes = match.match_duration_minutes;
            if (!durationMinutes) {
              const sportName = (match.sport as { name?: string })?.name?.toLowerCase() || '';
              if (sportName === 'football' || sportName === 'soccer') {
                durationMinutes = DEFAULT_DURATIONS['football'];
              }
            }
            
            if (durationMinutes) {
              const durationMs = durationMinutes * 60 * 1000;
              const calculatedEndTime = new Date(startTime.getTime() + durationMs);
              if (now >= calculatedEndTime) {
                shouldSkip = true;
                console.log(`Skipping match ${match.id} - already past duration ${durationMinutes} mins`);
              }
            }
          }
          
          if (shouldSkip) {
            // Mark as completed instead of starting
            const { error: updateError } = await supabase
              .from('matches')
              .update({ status: 'completed' })
              .eq('id', match.id);
            
            if (!updateError) {
              console.log(`Match ${match.id} marked as completed (was upcoming, past explicit end time)`);
              updatedCount++;
            }
            continue;
          }
          
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
    }

    // ============================================
    // 3. Auto-resume Test matches from STUMPS when day_start_time is reached
    // Uses day_start_time (daily play start) to determine when to resume
    // Also calculates correct test_day based on match start date
    // ============================================
    const { data: testMatchesForDayUpdate, error: testDayFetchError } = await supabase
      .from('matches')
      .select('id, match_format, test_day, is_stumps, next_day_start, day_start_time, match_start_time, stumps_time')
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

        // Priority 1: Use next_day_start if set (already a full timestamp)
        if (match.next_day_start) {
          resumeTime = new Date(match.next_day_start);
          if (now >= resumeTime) {
            shouldResume = true;
            console.log(`Match ${match.id}: Using next_day_start ${resumeTime.toISOString()}`);
          }
        }
        // Priority 2: Use day_start_time with stumps_time to derive timezone
        else if (match.day_start_time && match.stumps_time) {
          // stumps_time is a full ISO timestamp with timezone, use it to determine the match timezone
          const stumpsDate = new Date(match.stumps_time);
          
          // Get the next day after stumps
          const nextDay = new Date(stumpsDate);
          nextDay.setDate(nextDay.getDate() + 1);
          
          // Parse day_start_time (HH:MM:SS format) and apply to next day
          const [hours, minutes] = match.day_start_time.split(':').map(Number);
          
          // Calculate resume time: next day at day_start_time
          // Use the timezone offset from stumps_time for consistency
          resumeTime = new Date(nextDay);
          resumeTime.setUTCHours(hours, minutes, 0, 0);
          
          // Since stumps_time has the correct timezone, we can use it to calculate the resume time
          // The day_start_time is in local time, so we need to adjust based on the server's interpretation
          // If stumps was at e.g. 09:10 UTC (3:10 PM local), and day starts at 05:30 local (23:30 UTC prev day)
          // We should resume at 23:30 UTC of the stumps day
          
          console.log(`Match ${match.id}: Calculating resume time from stumps ${stumpsDate.toISOString()}, day_start_time ${match.day_start_time}`);
          
          // Simple approach: if current UTC time's hour:minute >= day_start_time, resume
          const nowHours = now.getUTCHours();
          const nowMinutes = now.getUTCMinutes();
          const currentTimeMinutes = nowHours * 60 + nowMinutes;
          const dayStartMinutes = hours * 60 + minutes;
          
          // Check if it's been at least 12 hours since stumps (to ensure it's a new day)
          const hoursSinceStumps = (now.getTime() - stumpsDate.getTime()) / (1000 * 60 * 60);
          
          if (hoursSinceStumps >= 12 && currentTimeMinutes >= dayStartMinutes) {
            shouldResume = true;
            console.log(`Match ${match.id}: ${hoursSinceStumps.toFixed(1)} hours since stumps, current time ${nowHours}:${nowMinutes} >= day_start_time ${hours}:${minutes}`);
          } else {
            console.log(`Match ${match.id}: Not ready to resume. Hours since stumps: ${hoursSinceStumps.toFixed(1)}, current UTC: ${nowHours}:${nowMinutes}, day_start: ${hours}:${minutes}`);
          }
        }
        // Priority 3: Fallback - just check if 16+ hours passed since stumps
        else if (match.stumps_time) {
          const stumpsDate = new Date(match.stumps_time);
          const hoursSinceStumps = (now.getTime() - stumpsDate.getTime()) / (1000 * 60 * 60);
          
          if (hoursSinceStumps >= 16) {
            shouldResume = true;
            console.log(`Match ${match.id}: Fallback - ${hoursSinceStumps.toFixed(1)} hours since stumps, resuming`);
          }
        }

        if (shouldResume) {
          // Calculate correct test_day based on match start
          let correctDay = (match.test_day || 1) + 1;
          
          // If match_start_time exists, calculate the actual day number
          if (match.match_start_time) {
            const startDate = new Date(match.match_start_time);
            const daysDiff = Math.floor((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
            correctDay = daysDiff + 1; // Day 1 is the start day
            if (correctDay > 5) correctDay = 5; // Max 5 days for Test
            if (correctDay < 1) correctDay = 1;
          }
          
          const { error: updateError } = await supabase
            .from('matches')
            .update({
              test_day: correctDay,
              is_stumps: false,
              next_day_start: null, // Clear until next stumps is called
            })
            .eq('id', match.id);

          if (updateError) {
            console.error(`Error updating Test match ${match.id} to Day ${correctDay}:`, updateError);
          } else {
            console.log(`Match ${match.id} advanced to Day ${correctDay} and resumed from STUMPS`);
            updatedCount++;
          }
        }
      }
    }

    // ============================================
    // 4. Auto-set STUMPS at stumps_time for live Test matches
    // Only set STUMPS if stumps_time is TODAY (same calendar day in UTC)
    // This prevents setting STUMPS based on yesterday's stumps_time
    // ============================================
    const { data: testMatchesForStumps, error: stumpsFetchError } = await supabase
      .from('matches')
      .select('id, match_format, test_day, is_stumps, stumps_time, next_day_start, day_start_time')
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
        const todayUTC = now.toISOString().split('T')[0]; // YYYY-MM-DD
        const stumpsDateUTC = stumpsTime.toISOString().split('T')[0];
        
        // Only process stumps if:
        // 1. stumps_time is TODAY (prevents triggering on old stumps_time)
        // 2. Current time has passed stumps_time
        if (stumpsDateUTC === todayUTC && now >= stumpsTime) {
          // Calculate next day's stumps_time (same time, next day)
          const nextDayStumpsTime = new Date(stumpsTime);
          nextDayStumpsTime.setDate(nextDayStumpsTime.getDate() + 1);
          
          const { error: updateError } = await supabase
            .from('matches')
            .update({
              is_stumps: true,
              stumps_time: nextDayStumpsTime.toISOString(), // Update to tomorrow's stumps time
            })
            .eq('id', match.id);

          if (updateError) {
            console.error(`Error setting STUMPS for match ${match.id}:`, updateError);
          } else {
            console.log(`Match ${match.id} Day ${match.test_day} - STUMPS called automatically. Next stumps: ${nextDayStumpsTime.toISOString()}`);
            updatedCount++;
          }
        } else if (stumpsDateUTC !== todayUTC) {
          console.log(`Match ${match.id}: stumps_time (${stumpsDateUTC}) is not today (${todayUTC}), skipping STUMPS check`);
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
