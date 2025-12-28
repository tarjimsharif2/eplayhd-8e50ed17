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
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout
      
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
        // Exponential backoff: 1s, 2s, 4s
        const delay = Math.pow(2, attempt - 1) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError || new Error('Failed to fetch after retries');
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get the API key from site_settings
    const { data: settings, error: settingsError } = await supabase
      .from('site_settings')
      .select('api_cricket_key, api_cricket_enabled')
      .limit(1)
      .maybeSingle();

    if (settingsError) {
      console.error('Error fetching settings:', settingsError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to fetch settings' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!settings?.api_cricket_enabled) {
      return new Response(
        JSON.stringify({ success: false, error: 'API Cricket is disabled' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!settings?.api_cricket_key) {
      return new Response(
        JSON.stringify({ success: false, error: 'API Cricket key not configured' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const apiKey = settings.api_cricket_key;
    const body = await req.json();
    const { action, teamAName, teamBName, eventKey, matchId } = body;

    console.log(`API Cricket request - Action: ${action}, Teams: ${teamAName} vs ${teamBName}`);

    // Helper to find matching event
    const findMatchingEvent = async () => {
      const today = new Date().toISOString().split('T')[0];
      const url = `https://apiv2.api-cricket.com/cricket/?method=get_events&APIkey=${apiKey}&date_start=${today}&date_stop=${today}`;
      
      console.log(`Fetching events from api-cricket.com for ${today}`);
      
      const response = await fetchWithRetry(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        console.error(`API Cricket error: ${response.status} ${response.statusText}`);
        return null;
      }

      const data = await response.json();

      if (!data.success || data.success !== 1) {
        console.error('API Cricket returned unsuccessful response:', data);
        return null;
      }

      const events = data.result || [];
      const normalizeTeamName = (name: string) => 
        name?.toLowerCase().replace(/[^a-z0-9]/g, '') || '';

      const teamANormalized = normalizeTeamName(teamAName);
      const teamBNormalized = normalizeTeamName(teamBName);

      return events.find((event: any) => {
        const homeNormalized = normalizeTeamName(event.event_home_team);
        const awayNormalized = normalizeTeamName(event.event_away_team);
        
        return (
          (homeNormalized.includes(teamANormalized) || teamANormalized.includes(homeNormalized) ||
           homeNormalized.includes(teamBNormalized) || teamBNormalized.includes(homeNormalized)) &&
          (awayNormalized.includes(teamANormalized) || teamANormalized.includes(awayNormalized) ||
           awayNormalized.includes(teamBNormalized) || teamBNormalized.includes(awayNormalized))
        );
      });
    };

    if (action === 'syncMatch' && matchId) {
      // Sync match scores from API to database
      const matchingEvent = await findMatchingEvent();
      
      if (!matchingEvent) {
        return new Response(
          JSON.stringify({ success: false, error: 'No matching event found' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log(`Found matching event for sync: ${matchingEvent.event_home_team} vs ${matchingEvent.event_away_team}`);

      // Determine match status
      let status: 'upcoming' | 'live' | 'completed' = 'upcoming';
      if (matchingEvent.event_live === '1') {
        status = 'live';
      } else if (matchingEvent.event_status === 'Finished' || matchingEvent.event_final_result) {
        status = 'completed';
      }

      // Update match in database
      const { error: updateError } = await supabase
        .from('matches')
        .update({
          score_a: matchingEvent.event_home_final_result || null,
          score_b: matchingEvent.event_away_final_result || null,
          status: status,
          updated_at: new Date().toISOString()
        })
        .eq('id', matchId);

      if (updateError) {
        console.error('Error updating match:', updateError);
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to update match in database' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          match: {
            eventKey: matchingEvent.event_key,
            homeTeam: matchingEvent.event_home_team,
            awayTeam: matchingEvent.event_away_team,
            homeScore: matchingEvent.event_home_final_result || '-',
            awayScore: matchingEvent.event_away_final_result || '-',
            status: matchingEvent.event_status,
            statusInfo: matchingEvent.event_status_info,
          }
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'getLiveScore') {
      const matchingEvent = await findMatchingEvent();

      if (matchingEvent) {
        console.log(`Found matching event: ${matchingEvent.event_home_team} vs ${matchingEvent.event_away_team}`);
        
        return new Response(
          JSON.stringify({
            success: true,
            match: {
              eventKey: matchingEvent.event_key,
              homeTeam: matchingEvent.event_home_team,
              awayTeam: matchingEvent.event_away_team,
              homeTeamLogo: matchingEvent.event_home_team_logo,
              awayTeamLogo: matchingEvent.event_away_team_logo,
              homeScore: matchingEvent.event_home_final_result || '-',
              awayScore: matchingEvent.event_away_final_result || '-',
              homeRunRate: matchingEvent.event_home_rr,
              awayRunRate: matchingEvent.event_away_rr,
              status: matchingEvent.event_status,
              statusInfo: matchingEvent.event_status_info,
              eventLive: matchingEvent.event_live === '1',
              eventType: matchingEvent.event_type,
              toss: matchingEvent.event_toss,
              venue: matchingEvent.event_stadium,
              leagueName: matchingEvent.league_name,
              extra: matchingEvent.extra,
            }
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } else {
        console.log('No matching event found for teams:', teamAName, teamBName);
        return new Response(
          JSON.stringify({ success: true, match: null }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    if (action === 'getEventDetails' && eventKey) {
      // Fetch specific event details
      const today = new Date().toISOString().split('T')[0];
      const url = `https://apiv2.api-cricket.com/cricket/?method=get_events&APIkey=${apiKey}&event_key=${eventKey}&date_start=${today}&date_stop=${today}`;
      
      console.log(`Fetching event details for event_key: ${eventKey}`);
      
      const response = await fetchWithRetry(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        return new Response(
          JSON.stringify({ success: false, error: `API request failed: ${response.status}` }),
          { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const data = await response.json();
      
      if (data.success === 1 && data.result?.length > 0) {
        const event = data.result[0];
        return new Response(
          JSON.stringify({
            success: true,
            match: {
              eventKey: event.event_key,
              homeTeam: event.event_home_team,
              awayTeam: event.event_away_team,
              homeTeamLogo: event.event_home_team_logo,
              awayTeamLogo: event.event_away_team_logo,
              homeScore: event.event_home_final_result || '-',
              awayScore: event.event_away_final_result || '-',
              homeRunRate: event.event_home_rr,
              awayRunRate: event.event_away_rr,
              status: event.event_status,
              statusInfo: event.event_status_info,
              eventLive: event.event_live === '1',
              eventType: event.event_type,
              toss: event.event_toss,
              venue: event.event_stadium,
              leagueName: event.league_name,
              extra: event.extra,
              scorecard: event.scorecard,
              comments: event.comments,
              wickets: event.wickets,
            }
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      return new Response(
        JSON.stringify({ success: true, match: null }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: 'Invalid action' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('API Cricket edge function error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
