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

    // Find Test matches that are in STUMPS state and should resume
    const { data: matchesToResume, error: fetchError } = await supabase
      .from('matches')
      .select('id, team_a_id, team_b_id, match_format, test_day, is_stumps, next_day_start, status')
      .eq('match_format', 'test')
      .eq('is_stumps', true)
      .eq('status', 'live')
      .not('next_day_start', 'is', null)
      .lte('next_day_start', now.toISOString());

    if (fetchError) {
      console.error('Error fetching matches:', fetchError);
      throw fetchError;
    }

    console.log(`Found ${matchesToResume?.length || 0} matches to resume from STUMPS`);

    let updatedCount = 0;

    if (matchesToResume && matchesToResume.length > 0) {
      for (const match of matchesToResume) {
        // Update match: remove STUMPS, keep live status
        const { error: updateError } = await supabase
          .from('matches')
          .update({
            is_stumps: false,
            stumps_time: null,
            next_day_start: null, // Clear until next stumps is called
          })
          .eq('id', match.id);

        if (updateError) {
          console.error(`Error updating match ${match.id}:`, updateError);
        } else {
          console.log(`Match ${match.id} resumed from STUMPS (Day ${match.test_day})`);
          updatedCount++;
        }
      }
    }

    // Also check for matches that should auto-start based on match_start_time
    const { data: matchesToStart, error: startFetchError } = await supabase
      .from('matches')
      .select('id, match_format, match_start_time, status')
      .eq('status', 'upcoming')
      .not('match_start_time', 'is', null)
      .lte('match_start_time', now.toISOString());

    if (startFetchError) {
      console.error('Error fetching upcoming matches:', startFetchError);
    } else if (matchesToStart && matchesToStart.length > 0) {
      console.log(`Found ${matchesToStart.length} matches to auto-start`);
      
      for (const match of matchesToStart) {
        const updateData: any = { status: 'live' };
        
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
          console.log(`Match ${match.id} auto-started`);
          updatedCount++;
        }
      }
    }

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
