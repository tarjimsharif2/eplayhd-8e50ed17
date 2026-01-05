import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Verify admin authentication
async function verifyAdminAuth(req: Request): Promise<{ authorized: boolean; error?: string; userId?: string }> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return { authorized: false, error: 'Missing authorization header' };
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  
  const token = authHeader.replace('Bearer ', '');
  const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey);
  
  const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token);
  
  if (authError || !user) {
    return { authorized: false, error: 'Invalid or expired token' };
  }

  // Check if user is admin using service role client
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const { data: roles } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .eq('role', 'admin')
    .single();

  if (!roles) {
    return { authorized: false, error: 'Admin access required' };
  }

  return { authorized: true, userId: user.id };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify admin authentication
    const authResult = await verifyAdminAuth(req);
    if (!authResult.authorized) {
      console.log(`[auto-sync-scores] Auth failed: ${authResult.error}`);
      return new Response(
        JSON.stringify({ success: false, error: authResult.error }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

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
