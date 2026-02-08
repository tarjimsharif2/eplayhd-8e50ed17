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

    // Get RapidAPI settings (still needed for API key)
    const { data: siteSettings, error: settingsError } = await supabase
      .from('site_settings')
      .select('rapidapi_key, rapidapi_enabled, rapidapi_endpoints')
      .limit(1)
      .maybeSingle();

    if (settingsError) {
      console.error('[auto-sync-points-table] Settings error:', settingsError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to fetch settings' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

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

    // Get all active tournaments with series_id that have daily sync enabled
    const { data: tournaments, error: tournamentError } = await supabase
      .from('tournaments')
      .select('id, name, series_id, points_table_sync_time, points_table_daily_sync_enabled')
      .eq('is_active', true)
      .eq('is_completed', false)
      .eq('points_table_daily_sync_enabled', true)
      .not('series_id', 'is', null);

    if (tournamentError || !tournaments || tournaments.length === 0) {
      console.log('[auto-sync-points-table] No active tournaments with daily sync enabled');
      return new Response(
        JSON.stringify({ success: true, message: 'No active tournaments with daily sync enabled' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Current UTC time for time-window check
    const now = new Date();
    const currentHour = now.getUTCHours();
    const currentMinute = now.getUTCMinutes();
    const currentTotalMinutes = currentHour * 60 + currentMinute;

    // Filter tournaments by their individual sync time
    const tournamentsToSync = tournaments.filter(t => {
      const syncTimeRaw = t.points_table_sync_time;
      if (!syncTimeRaw) return false;

      // Parse sync time - may contain timezone offset like "03:00+06:00"
      const timePart = syncTimeRaw.split(/[+-]/)[0]; // Get HH:MM part
      const [syncHourStr, syncMinuteStr] = timePart.split(':');
      let syncHour = parseInt(syncHourStr) || 0;
      let syncMinute = parseInt(syncMinuteStr) || 0;

      // If timezone offset exists, convert to UTC
      const offsetMatch = syncTimeRaw.match(/([+-])(\d{2}):(\d{2})$/);
      if (offsetMatch) {
        const sign = offsetMatch[1] === '+' ? -1 : 1; // Reverse sign for UTC conversion
        const offsetHours = parseInt(offsetMatch[2]) || 0;
        const offsetMinutes = parseInt(offsetMatch[3]) || 0;
        let totalMinutes = (syncHour * 60 + syncMinute) + sign * (offsetHours * 60 + offsetMinutes);
        // Normalize to 0-1439 range
        totalMinutes = ((totalMinutes % 1440) + 1440) % 1440;
        syncHour = Math.floor(totalMinutes / 60);
        syncMinute = totalMinutes % 60;
      }

      const syncTotalMinutes = syncHour * 60 + syncMinute;
      const diff = Math.abs(currentTotalMinutes - syncTotalMinutes);
      
      // Allow a 2-minute window
      return diff <= 2 || diff >= (24 * 60 - 2);
    });

    if (tournamentsToSync.length === 0) {
      const currentTime = `${currentHour.toString().padStart(2, '0')}:${currentMinute.toString().padStart(2, '0')}`;
      console.log(`[auto-sync-points-table] No tournaments matched sync time. Current UTC: ${currentTime}`);
      return new Response(
        JSON.stringify({ success: true, message: `No tournaments to sync at ${currentTime} UTC`, skipped: true }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[auto-sync-points-table] ${tournamentsToSync.length} tournaments matched sync time`);

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
    for (const tournament of tournamentsToSync) {
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
        const { data: allEntries } = await supabase
          .from('tournament_points_table')
          .select('id, group_name, points, net_run_rate, won')
          .eq('tournament_id', tournament.id)
          .order('group_name')
          .order('points', { ascending: false })
          .order('net_run_rate', { ascending: false })
          .order('won', { ascending: false });
        
        if (allEntries && allEntries.length > 0) {
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
