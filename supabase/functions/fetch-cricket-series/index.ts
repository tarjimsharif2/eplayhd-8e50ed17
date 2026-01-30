import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SeriesInfo {
  seriesId: string;
  seriesName: string;
  startDate: string | null;
  endDate: string | null;
  matchCount: number;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('[fetch-cricket-series] Starting series fetch...');
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get RapidAPI settings
    const { data: settings } = await supabase
      .from('site_settings')
      .select('rapidapi_key, rapidapi_endpoints, rapidapi_enabled')
      .single();

    if (!settings?.rapidapi_enabled || !settings?.rapidapi_key) {
      console.error('[fetch-cricket-series] RapidAPI not enabled or no key');
      return new Response(
        JSON.stringify({ success: false, error: 'RapidAPI is not enabled or configured' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const endpoints = settings.rapidapi_endpoints as Record<string, string> || {};
    const cricbuzzHost = endpoints.cricbuzz_host || 'cricbuzz-cricket.p.rapidapi.com';
    
    console.log(`[fetch-cricket-series] Using host: ${cricbuzzHost}`);
    
    const allSeries: SeriesInfo[] = [];
    
    // Fetch from multiple endpoints to get comprehensive series list
    const fetchEndpoints = [
      '/series/v1/international',
      '/series/v1/league',
      '/series/v1/domestic',
    ];

    for (const endpoint of fetchEndpoints) {
      try {
        console.log(`[fetch-cricket-series] Fetching from: https://${cricbuzzHost}${endpoint}`);
        
        const response = await fetch(`https://${cricbuzzHost}${endpoint}`, {
          headers: {
            'X-RapidAPI-Key': settings.rapidapi_key,
            'X-RapidAPI-Host': cricbuzzHost,
          },
        });

        console.log(`[fetch-cricket-series] Response status: ${response.status}`);

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`[fetch-cricket-series] Error fetching ${endpoint}: ${response.status} - ${errorText}`);
          continue;
        }

        const data = await response.json();
        console.log(`[fetch-cricket-series] Response keys: ${Object.keys(data || {}).join(', ')}`);
        
        // Parse series from response - Cricbuzz returns nested structure
        // Try different possible structures
        const seriesMapProto = data.seriesMapProto || data.seriesMap || data.series || [];
        
        if (Array.isArray(seriesMapProto)) {
          console.log(`[fetch-cricket-series] Found ${seriesMapProto.length} categories`);
          
          for (const category of seriesMapProto) {
            const seriesArray = category.series || category.seriesList || [];
            
            if (Array.isArray(seriesArray)) {
              console.log(`[fetch-cricket-series] Category has ${seriesArray.length} series`);
              
              for (const series of seriesArray) {
                const seriesId = series.seriesId || series.id;
                const seriesName = series.seriesName || series.name;
                
                if (seriesId && seriesName) {
                  // Skip if already added
                  if (allSeries.some(s => s.seriesId === String(seriesId))) {
                    continue;
                  }
                  
                  // Parse dates - Cricbuzz uses timestamps in milliseconds
                  let startDate: string | null = null;
                  let endDate: string | null = null;
                  
                  if (series.startDt) {
                    try {
                      const ts = parseInt(series.startDt);
                      startDate = new Date(ts).toISOString().split('T')[0];
                    } catch (e) {
                      console.log(`[fetch-cricket-series] Could not parse startDt: ${series.startDt}`);
                    }
                  }
                  
                  if (series.endDt) {
                    try {
                      const ts = parseInt(series.endDt);
                      endDate = new Date(ts).toISOString().split('T')[0];
                    } catch (e) {
                      console.log(`[fetch-cricket-series] Could not parse endDt: ${series.endDt}`);
                    }
                  }
                  
                  allSeries.push({
                    seriesId: String(seriesId),
                    seriesName: seriesName,
                    startDate,
                    endDate,
                    matchCount: series.matches || series.matchCount || 0,
                  });
                  
                  console.log(`[fetch-cricket-series] Found: ${seriesName} (ID: ${seriesId})`);
                }
              }
            }
          }
        } else {
          console.log(`[fetch-cricket-series] seriesMapProto is not an array, type: ${typeof seriesMapProto}`);
          console.log(`[fetch-cricket-series] Raw data sample: ${JSON.stringify(data).substring(0, 500)}`);
        }
      } catch (error) {
        console.error(`[fetch-cricket-series] Error processing ${endpoint}:`, error);
      }
    }

    console.log(`[fetch-cricket-series] Total series found: ${allSeries.length}`);

    // Upsert series to tournaments table
    let insertedCount = 0;
    let updatedCount = 0;

    for (const series of allSeries) {
      // Check if tournament with this series_id already exists
      const { data: existing } = await supabase
        .from('tournaments')
        .select('id, name')
        .eq('series_id', series.seriesId)
        .maybeSingle();

      if (existing) {
        // Update existing tournament's dates if changed
        const { error } = await supabase
          .from('tournaments')
          .update({
            start_date: series.startDate,
            end_date: series.endDate,
            total_matches: series.matchCount || null,
            updated_at: new Date().toISOString(),
          })
          .eq('series_id', series.seriesId);

        if (!error) updatedCount++;
      } else {
        // Generate slug from series name
        const slug = series.seriesName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '');

        // Determine season from dates or current year
        const season = series.startDate 
          ? new Date(series.startDate).getFullYear().toString()
          : new Date().getFullYear().toString();

        // Insert new tournament
        const { error } = await supabase
          .from('tournaments')
          .insert({
            name: series.seriesName,
            series_id: series.seriesId,
            sport: 'Cricket',
            season: season,
            slug: slug,
            start_date: series.startDate,
            end_date: series.endDate,
            total_matches: series.matchCount || null,
            is_active: true,
            show_in_menu: false,
            show_in_homepage: false,
            seo_title: `${series.seriesName} - Live Scores & Updates`,
            seo_description: `Watch ${series.seriesName} live scores, schedules, and streaming links.`,
          });

        if (!error) {
          insertedCount++;
          console.log(`[fetch-cricket-series] Inserted: ${series.seriesName}`);
        } else {
          console.error(`[fetch-cricket-series] Insert error for ${series.seriesName}:`, error);
        }
      }
    }

    console.log(`[fetch-cricket-series] Inserted: ${insertedCount}, Updated: ${updatedCount}`);

    return new Response(
      JSON.stringify({
        success: true,
        total: allSeries.length,
        inserted: insertedCount,
        updated: updatedCount,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[fetch-cricket-series] Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
