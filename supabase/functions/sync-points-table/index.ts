import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { verifyAdminAuth, unauthorizedResponse, forbiddenResponse } from '../_shared/auth.ts';

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
const normalizeTeamName = (name: string): string => {
  return (name || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
};

// Split name into words for word-based matching
const getWords = (name: string): string[] => {
  return normalizeTeamName(name).split(/\s+/).filter(w => w.length > 0);
};

// Strict team name matching - must match short_name exactly or significant word overlap
const teamsMatch = (dbTeam: { name: string; short_name: string }, apiTeamName: string, apiTeamFullName?: string): boolean => {
  const dbShort = (dbTeam.short_name || '').toLowerCase().trim();
  const dbName = normalizeTeamName(dbTeam.name);
  const apiShort = (apiTeamName || '').toLowerCase().trim();
  const apiName = normalizeTeamName(apiTeamFullName || '');
  
  if (!dbShort || !apiShort) return false;
  
  // Priority 1: Exact short name match - most reliable
  if (dbShort === apiShort) return true;
  
  // Priority 2: Exact full name match
  if (apiName && dbName && dbName === apiName) return true;
  
  // Priority 3: Word-based matching - check if significant words match
  // Must have at least 2 matching words and high similarity
  if (apiName && dbName) {
    const dbWords = getWords(dbTeam.name);
    const apiWords = getWords(apiTeamFullName || '');
    
    // Skip common words that don't identify teams
    const skipWords = ['women', 'men', 'team', 'cricket', 'the', 'fc', 'united'];
    const dbSignificantWords = dbWords.filter(w => !skipWords.includes(w) && w.length > 2);
    const apiSignificantWords = apiWords.filter(w => !skipWords.includes(w) && w.length > 2);
    
    if (dbSignificantWords.length === 0 || apiSignificantWords.length === 0) {
      return false;
    }
    
    // Count matching significant words
    const matchingWords = dbSignificantWords.filter(dbWord => 
      apiSignificantWords.some(apiWord => dbWord === apiWord)
    );
    
    // Require at least 50% of significant words to match and at least 1 match
    const matchRatio = matchingWords.length / Math.min(dbSignificantWords.length, apiSignificantWords.length);
    if (matchingWords.length >= 1 && matchRatio >= 0.5) {
      return true;
    }
  }
  
  return false;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Verify admin authentication
  const { user, error: authError } = await verifyAdminAuth(req);
  if (authError) {
    console.log('[sync-points-table] Auth failed:', authError);
    if (authError === 'Admin access required') {
      return forbiddenResponse(authError, corsHeaders);
    }
    return unauthorizedResponse(authError, corsHeaders);
  }
  console.log(`[sync-points-table] Authenticated admin: ${user.id}`);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const { tournamentId, seriesId } = body;

    if (!tournamentId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Tournament ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[sync-points-table] Syncing points table for tournament: ${tournamentId}, seriesId: ${seriesId}`);

    // Get the RapidAPI key and endpoints from site_settings
    const { data: siteSettings, error: settingsError } = await supabase
      .from('site_settings')
      .select('rapidapi_key, rapidapi_enabled, rapidapi_endpoints')
      .limit(1)
      .maybeSingle();

    if (settingsError || !siteSettings?.rapidapi_enabled || !siteSettings?.rapidapi_key) {
      console.error('[sync-points-table] RapidAPI is disabled or not configured');
      return new Response(
        JSON.stringify({ success: false, error: 'RapidAPI is disabled or not configured. Please configure RapidAPI key in Settings.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const rapidApiKey = siteSettings.rapidapi_key;

    // Get tournament details
    const { data: tournament, error: tournamentError } = await supabase
      .from('tournaments')
      .select('id, name, season')
      .eq('id', tournamentId)
      .single();

    if (tournamentError || !tournament) {
      return new Response(
        JSON.stringify({ success: false, error: 'Tournament not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get all teams in the system
    const { data: teams, error: teamsError } = await supabase
      .from('teams')
      .select('id, name, short_name');

    if (teamsError || !teams) {
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to fetch teams' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // If no seriesId provided, we need to ask user for it
    if (!seriesId) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Series ID is required. Please enter the Cricbuzz Series ID.',
          requiresSeriesId: true
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get endpoint configuration from site_settings
    const endpoints = siteSettings.rapidapi_endpoints || {};
    const cricbuzzHost = endpoints.cricbuzz_host || 'cricbuzz-cricket.p.rapidapi.com';
    const pointsTablePath = (endpoints.points_table_endpoint || '/stats/v1/series/{series_id}/points-table')
      .replace('{series_id}', seriesId);
    
    // Fetch points table from Cricbuzz RapidAPI
    const pointsTableUrl = `https://${cricbuzzHost}${pointsTablePath}`;
    
    console.log(`[sync-points-table] Fetching points table from: ${pointsTableUrl}`);
    
    const response = await fetchWithRetry(pointsTableUrl, {
      method: 'GET',
      headers: {
        'x-rapidapi-host': cricbuzzHost,
        'x-rapidapi-key': rapidApiKey,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[sync-points-table] API error: ${response.status} - ${errorText}`);
      return new Response(
        JSON.stringify({ success: false, error: `API error: ${response.status}. Please check Series ID and API key.` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    console.log(`[sync-points-table] API response:`, JSON.stringify(data).substring(0, 500));

    // Parse Cricbuzz response structure
    // The response has pointsTable array with groupTable entries
    const pointsTable = data.pointsTable || [];
    
    if (!pointsTable || pointsTable.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'No points table data available for this series' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }


    let updatedCount = 0;
    let insertedCount = 0;
    let skippedTeams: string[] = [];

    // Process each group in points table
    for (const group of pointsTable) {
      const groupTable = group.pointsTableInfo || [];
      
      for (const standing of groupTable) {
        const apiTeamName = standing.teamName || '';
        const apiTeamFullName = standing.teamFullName || '';
        
        if (!apiTeamName) continue;

        // Find matching team in our database using strict matching
        const matchingTeam = teams.find(team => 
          teamsMatch(team, apiTeamName, apiTeamFullName)
        );

        if (!matchingTeam) {
          console.log(`[sync-points-table] No matching team found for: ${apiTeamName} (${apiTeamFullName})`);
          skippedTeams.push(apiTeamName);
          continue;
        }

        console.log(`[sync-points-table] Matched ${apiTeamName} (${apiTeamFullName}) -> ${matchingTeam.name} (${matchingTeam.short_name})`);

        // Parse Cricbuzz standing data
        const played = parseInt(standing.matchesPlayed || 0) || 0;
        const won = parseInt(standing.matchesWon || 0) || 0;
        const lost = parseInt(standing.matchesLost || 0) || 0;
        const tied = parseInt(standing.matchesTied || 0) || 0;
        const noResult = parseInt(standing.noRes || standing.noResult || 0) || 0;
        const points = parseInt(standing.points || 0) || 0;
        const position = parseInt(standing.position || 0) || 0;
        
        // Get NRR from API - parse the string to float
        const apiNrr = parseFloat(standing.nrr || '0') || 0;

        // Check if entry exists
        const { data: existing } = await supabase
          .from('tournament_points_table')
          .select('id, net_run_rate')
          .eq('tournament_id', tournamentId)
          .eq('team_id', matchingTeam.id)
          .maybeSingle();

        const entryData = {
          tournament_id: tournamentId,
          team_id: matchingTeam.id,
          position,
          played,
          won,
          lost,
          tied,
          no_result: noResult,
          points,
          // Use API NRR directly
          net_run_rate: apiNrr,
          updated_at: new Date().toISOString(),
        };

        if (existing) {
          const { error } = await supabase
            .from('tournament_points_table')
            .update(entryData)
            .eq('id', existing.id);
          
          if (!error) updatedCount++;
        } else {
          const { error } = await supabase
            .from('tournament_points_table')
            .insert(entryData);
          
          if (!error) insertedCount++;
        }
      }
    }

    console.log(`[sync-points-table] Sync complete. Updated: ${updatedCount}, Inserted: ${insertedCount}, Skipped: ${skippedTeams.length}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Points table synced successfully`,
        updated: updatedCount,
        inserted: insertedCount,
        skippedTeams: skippedTeams.length > 0 ? skippedTeams : undefined,
        seriesId,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('[sync-points-table] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
