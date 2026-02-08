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
const normalizeTeamName = (name: string): string => {
  return (name || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
};

// STRICT team name matching
const teamsMatchStrict = (dbTeam: { name: string; short_name: string }, apiTeamName: string, apiTeamFullName?: string): boolean => {
  const dbShort = (dbTeam.short_name || '').toLowerCase().trim();
  const dbName = normalizeTeamName(dbTeam.name);
  const apiShort = (apiTeamName || '').toLowerCase().trim();
  const apiName = normalizeTeamName(apiTeamFullName || '');
  
  if (!dbShort || !apiShort) return false;
  
  if (dbShort === apiShort) return true;
  if (apiName && dbName && dbName === apiName) return true;
  if (apiName.includes(dbShort) && dbShort.length >= 2 && apiShort.length === dbShort.length) {
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

    console.log('[auto-sync-points-table] Starting auto sync check...');

    // Get settings
    const { data: siteSettings, error: settingsError } = await supabase
      .from('site_settings')
      .select('points_table_auto_sync_enabled, points_table_sync_time, rapidapi_key, rapidapi_enabled, rapidapi_endpoints')
      .limit(1)
      .maybeSingle();

    if (settingsError) {
      console.error('[auto-sync-points-table] Settings error:', settingsError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to fetch settings' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if auto sync is enabled
    if (!siteSettings?.points_table_auto_sync_enabled) {
      console.log('[auto-sync-points-table] Auto sync is disabled');
      return new Response(
        JSON.stringify({ success: true, message: 'Auto sync is disabled', skipped: true }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if it's the right time (compare HH:MM with configured time)
    const syncTime = siteSettings.points_table_sync_time || '03:00';
    const now = new Date();
    const currentHour = now.getUTCHours().toString().padStart(2, '0');
    const currentMinute = now.getUTCMinutes().toString().padStart(2, '0');
    const currentTime = `${currentHour}:${currentMinute}`;

    // Allow a 2-minute window for the cron to catch the right time
    const [syncHour, syncMinute] = syncTime.split(':').map(Number);
    const syncTotalMinutes = syncHour * 60 + syncMinute;
    const currentTotalMinutes = parseInt(currentHour) * 60 + parseInt(currentMinute);
    const diff = Math.abs(currentTotalMinutes - syncTotalMinutes);

    if (diff > 2 && diff < (24 * 60 - 2)) {
      console.log(`[auto-sync-points-table] Not sync time yet. Current: ${currentTime} UTC, Configured: ${syncTime} UTC`);
      return new Response(
        JSON.stringify({ success: true, message: `Not sync time. Current: ${currentTime} UTC, Target: ${syncTime} UTC`, skipped: true }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[auto-sync-points-table] Sync time matched! Current: ${currentTime} UTC, Target: ${syncTime} UTC`);

    // Check RapidAPI configuration
    if (!siteSettings?.rapidapi_enabled || !siteSettings?.rapidapi_key) {
      console.error('[auto-sync-points-table] RapidAPI not configured');
      return new Response(
        JSON.stringify({ success: false, error: 'RapidAPI is not configured' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const rapidApiKey = siteSettings.rapidapi_key;
    const endpoints = siteSettings.rapidapi_endpoints || {};
    const cricbuzzHost = endpoints.cricbuzz_host || 'cricbuzz-cricket.p.rapidapi.com';

    // Get all active tournaments with series_id
    const { data: tournaments, error: tournamentError } = await supabase
      .from('tournaments')
      .select('id, name, series_id')
      .eq('is_active', true)
      .eq('is_completed', false)
      .not('series_id', 'is', null);

    if (tournamentError || !tournaments || tournaments.length === 0) {
      console.log('[auto-sync-points-table] No active tournaments with series_id found');
      return new Response(
        JSON.stringify({ success: true, message: 'No active tournaments with series_id to sync' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[auto-sync-points-table] Found ${tournaments.length} active tournaments to sync`);

    // Get ALL teams
    const { data: teams, error: teamsError } = await supabase
      .from('teams')
      .select('id, name, short_name');

    if (teamsError || !teams) {
      console.error('[auto-sync-points-table] Failed to fetch teams');
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to fetch teams' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const results: Array<{ tournament: string; seriesId: string; updated: number; inserted: number; skipped: string[] }> = [];

    // Process each tournament
    for (const tournament of tournaments) {
      const seriesId = tournament.series_id;
      if (!seriesId) continue;

      console.log(`[auto-sync-points-table] Syncing: ${tournament.name} (seriesId: ${seriesId})`);

      try {
        const pointsTablePath = (endpoints.points_table_endpoint || '/stats/v1/series/{series_id}/points-table')
          .replace('{series_id}', seriesId);
        
        const pointsTableUrl = `https://${cricbuzzHost}${pointsTablePath}`;
        
        const response = await fetchWithRetry(pointsTableUrl, {
          method: 'GET',
          headers: {
            'x-rapidapi-host': cricbuzzHost,
            'x-rapidapi-key': rapidApiKey,
          },
        });

        if (!response.ok) {
          console.error(`[auto-sync-points-table] API error for ${tournament.name}: ${response.status}`);
          results.push({ tournament: tournament.name, seriesId, updated: 0, inserted: 0, skipped: [`API error: ${response.status}`] });
          continue;
        }

        const data = await response.json();
        const pointsTable = data.pointsTable || [];
        
        if (!pointsTable || pointsTable.length === 0) {
          console.log(`[auto-sync-points-table] No points data for ${tournament.name}`);
          results.push({ tournament: tournament.name, seriesId, updated: 0, inserted: 0, skipped: ['No data available'] });
          continue;
        }

        let updatedCount = 0;
        let insertedCount = 0;
        let skippedTeams: string[] = [];

        for (const group of pointsTable) {
          const groupTable = group.pointsTableInfo || [];
          const groupName = group.groupName || null;

          for (const standing of groupTable) {
            const apiTeamName = standing.teamName || '';
            const apiTeamFullName = standing.teamFullName || '';
            
            if (!apiTeamName) continue;

            const matchingTeam = teams.find(team => 
              teamsMatchStrict(team, apiTeamName, apiTeamFullName)
            );

            if (!matchingTeam) {
              skippedTeams.push(`${apiTeamName} (${apiTeamFullName})`);
              continue;
            }

            const played = parseInt(standing.matchesPlayed || 0) || 0;
            const won = parseInt(standing.matchesWon || 0) || 0;
            const lost = parseInt(standing.matchesLost || 0) || 0;
            const tied = parseInt(standing.matchesTied || 0) || 0;
            const noResult = parseInt(standing.noRes || standing.noResult || 0) || 0;
            const points = parseInt(standing.points || 0) || 0;
            const position = parseInt(standing.position || 0) || 0;
            const apiNrr = parseFloat(standing.nrr || '0') || 0;

            const { data: existing } = await supabase
              .from('tournament_points_table')
              .select('id')
              .eq('tournament_id', tournament.id)
              .eq('team_id', matchingTeam.id)
              .maybeSingle();

            const entryData = {
              tournament_id: tournament.id,
              team_id: matchingTeam.id,
              position,
              played,
              won,
              lost,
              tied,
              no_result: noResult,
              points,
              net_run_rate: apiNrr,
              group_name: groupName,
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

        console.log(`[auto-sync-points-table] ${tournament.name}: Updated ${updatedCount}, Inserted ${insertedCount}, Skipped ${skippedTeams.length}`);
        
        // Auto-recalculate positions within each group after sync
        // Get all entries for this tournament, grouped
        const { data: allEntries } = await supabase
          .from('tournament_points_table')
          .select('id, group_name, points, net_run_rate, won')
          .eq('tournament_id', tournament.id)
          .order('group_name')
          .order('points', { ascending: false })
          .order('net_run_rate', { ascending: false })
          .order('won', { ascending: false });
        
        if (allEntries && allEntries.length > 0) {
          // Group entries by group_name and assign positions within each group
          const groups = new Map<string, typeof allEntries>();
          for (const entry of allEntries) {
            const key = entry.group_name || '__no_group__';
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key)!.push(entry);
          }
          
          for (const [, groupEntries] of groups) {
            for (let i = 0; i < groupEntries.length; i++) {
              await supabase
                .from('tournament_points_table')
                .update({ position: i + 1 })
                .eq('id', groupEntries[i].id);
            }
          }
          console.log(`[auto-sync-points-table] Positions recalculated for ${tournament.name}`);
        }
        
        results.push({ tournament: tournament.name, seriesId, updated: updatedCount, inserted: insertedCount, skipped: skippedTeams });

        // Small delay between tournaments to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (err) {
        console.error(`[auto-sync-points-table] Error syncing ${tournament.name}:`, err);
        results.push({ tournament: tournament.name, seriesId, updated: 0, inserted: 0, skipped: [`Error: ${err}`] });
      }
    }

    console.log('[auto-sync-points-table] Auto sync complete:', JSON.stringify(results));

    return new Response(
      JSON.stringify({ success: true, results }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('[auto-sync-points-table] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
