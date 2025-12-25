import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, teamAName, teamBName, teamAShort, teamBShort } = await req.json();
    
    console.log(`Cricket API request: action=${action}, teamA=${teamAName}, teamB=${teamBName}`);

    // Get Supabase client with service role to access protected settings
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch site settings with service role (bypasses RLS)
    const { data: settings, error: settingsError } = await supabase
      .from('site_settings')
      .select('cricket_api_key, cricket_api_enabled')
      .limit(1)
      .maybeSingle();

    if (settingsError) {
      console.error('Error fetching site settings:', settingsError);
      throw new Error('Failed to fetch site settings');
    }

    if (!settings?.cricket_api_enabled || !settings?.cricket_api_key) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Cricket API not configured or disabled' 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const apiKey = settings.cricket_api_key;

    if (action === 'getCurrentMatches') {
      // Fetch current matches from CricAPI
      const response = await fetch(
        `https://api.cricapi.com/v1/currentMatches?apikey=${apiKey}&offset=0`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch from CricAPI');
      }

      const data = await response.json();
      
      if (data.status !== 'success' || !data.data) {
        return new Response(JSON.stringify({ 
          success: false, 
          error: data.reason || 'No match data available' 
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // If team names provided, find matching match
      if (teamAName && teamBName) {
        const normalizeTeamName = (name: string) => 
          name.toLowerCase().replace(/[^a-z0-9]/g, '');

        const teamANormalized = normalizeTeamName(teamAName);
        const teamBNormalized = normalizeTeamName(teamBName);
        const teamAShortNorm = teamAShort ? normalizeTeamName(teamAShort) : '';
        const teamBShortNorm = teamBShort ? normalizeTeamName(teamBShort) : '';

        const matchingMatch = data.data.find((match: any) => {
          if (!match.teams || match.teams.length < 2) return false;
          
          const matchTeams = match.teams.map((t: string) => normalizeTeamName(t));
          
          const hasTeamA = matchTeams.some((t: string) => 
            t.includes(teamANormalized) || teamANormalized.includes(t) ||
            (teamAShortNorm && (t.includes(teamAShortNorm) || teamAShortNorm.includes(t)))
          );
          const hasTeamB = matchTeams.some((t: string) => 
            t.includes(teamBNormalized) || teamBNormalized.includes(t) ||
            (teamBShortNorm && (t.includes(teamBShortNorm) || teamBShortNorm.includes(t)))
          );
          
          return hasTeamA && hasTeamB;
        });

        return new Response(JSON.stringify({ 
          success: true, 
          match: matchingMatch || null 
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ 
        success: true, 
        matches: data.data 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ 
      success: false, 
      error: 'Unknown action' 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in cricket-api function:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
