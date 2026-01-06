import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { verifyAdminAuth, unauthorizedResponse, forbiddenResponse } from '../_shared/auth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
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
    console.log('[auto-sync-scores] Authenticated via cron secret');
  } else if (isInternalCall) {
    console.log('[auto-sync-scores] Internal/cron call (anon key or no auth)');
  } else {
    // Has non-anon auth header - verify admin authentication
    const { user, error: authError } = await verifyAdminAuth(req);
    if (authError) {
      console.log('[auto-sync-scores] Auth failed:', authError);
      if (authError === 'Admin access required') {
        return forbiddenResponse(authError, corsHeaders);
      }
      return unauthorizedResponse(authError, corsHeaders);
    }
    console.log(`[auto-sync-scores] Authenticated admin: ${user.id}`);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('Auto-sync started at:', new Date().toISOString());

    // Find all live matches with API sync enabled
    const { data: matches, error: matchesError } = await supabase
      .from('matches')
      .select(`
        id,
        team_a:teams!matches_team_a_id_fkey(name, short_name),
        team_b:teams!matches_team_b_id_fkey(name, short_name)
      `)
      .eq('status', 'live')
      .eq('api_score_enabled', true)
      .eq('auto_sync_enabled', true);

    if (matchesError) {
      console.error('Error fetching matches:', matchesError);
      return new Response(
        JSON.stringify({ success: false, error: matchesError.message }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    if (!matches || matches.length === 0) {
      console.log('No live matches with auto-sync enabled found');
      return new Response(
        JSON.stringify({ success: true, message: 'No matches to sync', synced: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${matches.length} matches to sync`);

    const results: { matchId: string; success: boolean; error?: string }[] = [];

    // Sync each match
    for (const match of matches) {
      try {
        // Handle the joined data - it comes as an array with one element
        const teamAData = match.team_a as unknown;
        const teamBData = match.team_b as unknown;
        
        let teamAName = '';
        let teamBName = '';
        
        if (Array.isArray(teamAData) && teamAData.length > 0) {
          teamAName = (teamAData[0] as { name: string }).name || '';
        } else if (teamAData && typeof teamAData === 'object') {
          teamAName = (teamAData as { name: string }).name || '';
        }
        
        if (Array.isArray(teamBData) && teamBData.length > 0) {
          teamBName = (teamBData[0] as { name: string }).name || '';
        } else if (teamBData && typeof teamBData === 'object') {
          teamBName = (teamBData as { name: string }).name || '';
        }

        console.log(`Syncing match ${match.id}: ${teamAName} vs ${teamBName}`);

        // Call the api-cricket function to sync this match
        const response = await fetch(`${supabaseUrl}/functions/v1/api-cricket`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({
            action: 'syncMatch',
            matchId: match.id,
            teamAName,
            teamBName,
          }),
        });

        const result = await response.json();

        if (result.success) {
          console.log(`Successfully synced match ${match.id}`);
          results.push({ matchId: match.id, success: true });
        } else {
          console.error(`Failed to sync match ${match.id}:`, result.error);
          results.push({ matchId: match.id, success: false, error: result.error });
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        console.error(`Error syncing match ${match.id}:`, errorMessage);
        results.push({ matchId: match.id, success: false, error: errorMessage });
      }
    }

    const successCount = results.filter(r => r.success).length;
    console.log(`Auto-sync completed. ${successCount}/${matches.length} matches synced successfully`);

    return new Response(
      JSON.stringify({
        success: true,
        synced: successCount,
        total: matches.length,
        results,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error('Auto-sync error:', errorMessage);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
