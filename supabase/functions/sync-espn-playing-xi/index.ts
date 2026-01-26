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

// Check if team names match
const teamsMatch = (dbTeamName: string, dbShortName: string, apiTeamName: string): boolean => {
  const dbNorm = normalizeTeamName(dbTeamName);
  const dbShortNorm = normalizeTeamName(dbShortName);
  const apiNorm = normalizeTeamName(apiTeamName);
  
  if (!apiNorm) return false;
  
  // Exact match on short name
  if (dbShortNorm === apiNorm) return true;
  
  // Check if names include each other
  if (dbNorm.includes(apiNorm) || apiNorm.includes(dbNorm)) return true;
  if (dbShortNorm && (apiNorm.includes(dbShortNorm) || dbShortNorm.includes(apiNorm))) return true;
  
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

    const body = await req.json();
    const { matchId, teamAId, teamBId, teamAName, teamAShortName, teamBName, teamBShortName } = body;

    if (!matchId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Match ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[sync-espn-playing-xi] Syncing playing XI for match: ${matchId}`);

    // Check if playing XI already exists for this match
    const { data: existingPlayers, error: existingError } = await supabase
      .from('match_playing_xi')
      .select('id')
      .eq('match_id', matchId)
      .limit(1);

    if (existingError) {
      console.error('[sync-espn-playing-xi] Error checking existing players:', existingError);
    }

    // If players already exist, skip API call
    if (existingPlayers && existingPlayers.length > 0) {
      console.log(`[sync-espn-playing-xi] Players already exist for match ${matchId}, skipping API call`);
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Playing XI already exists',
          alreadyExists: true,
          playersAdded: 0
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get match details to find espn_event_id
    const { data: matchData, error: matchError } = await supabase
      .from('matches')
      .select('espn_event_id, match_date')
      .eq('id', matchId)
      .single();

    if (matchError) {
      console.error('[sync-espn-playing-xi] Error fetching match:', matchError);
    }

    let espnEventId = matchData?.espn_event_id;
    const playersToAdd: any[] = [];

    // Check if this is a U19 match (ESPN doesn't support U19 tournaments)
    const isU19Match = teamAName.toLowerCase().includes('u19') || 
                       teamAName.toLowerCase().includes('under-19') ||
                       teamAName.toLowerCase().includes('under 19') ||
                       teamBName.toLowerCase().includes('u19') || 
                       teamBName.toLowerCase().includes('under-19') ||
                       teamBName.toLowerCase().includes('under 19');

    if (isU19Match) {
      console.log(`[sync-espn-playing-xi] U19 match detected - ESPN does not support U19 tournaments`);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'ESPN does not support U19 matches. Use Cricbuzz or API Cricket instead, or add players manually.',
          playersAdded: 0
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // If no ESPN event ID, try to find match by searching
    if (!espnEventId) {
      console.log(`[sync-espn-playing-xi] No ESPN event ID, searching for: ${teamAName} vs ${teamBName}`);
      
      // Try to find match in ESPN schedule
      const matchDate = matchData?.match_date;
      // Handle various date formats
      let dateRange: string;
      if (matchDate) {
        // Try to parse date - could be "26th January 2026" or "2026-01-26" format
        const dateMatch = matchDate.match(/(\d{4})-(\d{2})-(\d{2})/);
        if (dateMatch) {
          dateRange = `${matchDate.replace(/-/g, '')}-${matchDate.replace(/-/g, '')}`;
        } else {
          // Try to parse readable date format
          const today = new Date();
          const weekLater = new Date(today);
          weekLater.setDate(today.getDate() + 7);
          dateRange = `${today.toISOString().slice(0, 10).replace(/-/g, '')}-${weekLater.toISOString().slice(0, 10).replace(/-/g, '')}`;
        }
      } else {
        const today = new Date();
        const weekLater = new Date(today);
        weekLater.setDate(today.getDate() + 7);
        dateRange = `${today.toISOString().slice(0, 10).replace(/-/g, '')}-${weekLater.toISOString().slice(0, 10).replace(/-/g, '')}`;
      }

      // Search multiple league endpoints
      const leagues = [
        'icc.cricket',       // ICC tournaments
        'intl.cricket',      // International cricket  
        'cricket.world.cup', // World cups
        'cricket.t20blast',  // T20 Blast
        'big.bash',          // Big Bash
        'indian.premier',    // IPL
        'psl',               // PSL
        'bbl',               // BBL
        'sa20',              // SA20
        'bpl',               // BPL
        'cricket',           // Generic cricket
      ];

      for (const league of leagues) {
        if (espnEventId) break;
        
        try {
          const scheduleUrl = `https://site.api.espn.com/apis/site/v2/sports/cricket/${league}/scoreboard?dates=${dateRange}`;
          console.log(`[sync-espn-playing-xi] Searching in: ${scheduleUrl}`);
          
          const response = await fetchWithRetry(scheduleUrl, {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
          });

          if (!response.ok) {
            console.log(`[sync-espn-playing-xi] ${league} endpoint error: ${response.status}`);
            continue;
          }

          const data = await response.json();
          const events = data.events || [];
          
          for (const event of events) {
            const competitors = event.competitions?.[0]?.competitors || [];
            if (competitors.length < 2) continue;
            
            const team1Name = competitors[0]?.team?.name || competitors[0]?.team?.shortDisplayName || '';
            const team2Name = competitors[1]?.team?.name || competitors[1]?.team?.shortDisplayName || '';
            
            const team1Matches = teamsMatch(teamAName, teamAShortName, team1Name) || teamsMatch(teamBName, teamBShortName, team1Name);
            const team2Matches = teamsMatch(teamAName, teamAShortName, team2Name) || teamsMatch(teamBName, teamBShortName, team2Name);
            
            if (team1Matches && team2Matches) {
              espnEventId = event.id;
              console.log(`[sync-espn-playing-xi] Found match: ${espnEventId} - ${team1Name} vs ${team2Name}`);
              break;
            }
          }
        } catch (err) {
          console.error(`[sync-espn-playing-xi] Error searching ${league}:`, err);
        }
      }

      if (!espnEventId) {
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: `Match not found in ESPN. Try Cricbuzz instead, or add players manually.`,
            playersAdded: 0
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Fetch match summary which includes lineups
    console.log(`[sync-espn-playing-xi] Fetching ESPN match summary for event: ${espnEventId}`);
    
    // Try multiple sport paths
    const sportPaths = [
      'icc.cricket',
      'intl.cricket', 
      'big.bash',
      'indian.premier',
      'psl',
      'bbl',
      'cricket'
    ];

    let summaryData: any = null;
    
    for (const sportPath of sportPaths) {
      try {
        const summaryUrl = `https://site.api.espn.com/apis/site/v2/sports/cricket/${sportPath}/summary?event=${espnEventId}`;
        console.log(`[sync-espn-playing-xi] Trying: ${summaryUrl}`);
        
        const summaryResponse = await fetchWithRetry(summaryUrl, {
          method: 'GET',
          headers: { 'Accept': 'application/json' },
        });

        if (summaryResponse.ok) {
          summaryData = await summaryResponse.json();
          if (summaryData.header || summaryData.roster || summaryData.boxscore) {
            console.log(`[sync-espn-playing-xi] Found data in ${sportPath}`);
            break;
          }
        }
      } catch (err) {
        console.log(`[sync-espn-playing-xi] ${sportPath} error: ${err}`);
      }
    }

    if (!summaryData) {
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to fetch match summary from ESPN', playersAdded: 0 }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Extract team info
    const competition = summaryData.header?.competitions?.[0] || {};
    const competitors = competition.competitors || [];
    
    console.log(`[sync-espn-playing-xi] Found ${competitors.length} teams in summary`);

    // Try to get rosters from different sources in the response
    // 1. Check roster endpoint
    // 2. Check boxscore
    // 3. Check lineup data

    // First try roster data if available
    const rosters = summaryData.rosters || summaryData.roster || [];
    console.log(`[sync-espn-playing-xi] Roster data: ${rosters.length} entries`);

    // Process each team
    for (let i = 0; i < competitors.length; i++) {
      const competitor = competitors[i];
      const teamName = competitor.team?.name || competitor.team?.displayName || '';
      const teamShortName = competitor.team?.shortDisplayName || competitor.team?.abbreviation || '';
      
      console.log(`[sync-espn-playing-xi] Processing team: ${teamName} (${teamShortName})`);
      
      // Determine which team this is
      let dbTeamId: string | null = null;
      if (teamsMatch(teamAName, teamAShortName, teamName) || teamsMatch(teamAName, teamAShortName, teamShortName)) {
        dbTeamId = teamAId;
      } else if (teamsMatch(teamBName, teamBShortName, teamName) || teamsMatch(teamBName, teamBShortName, teamShortName)) {
        dbTeamId = teamBId;
      }

      if (!dbTeamId) {
        console.log(`[sync-espn-playing-xi] Could not match team ${teamName} to database`);
        continue;
      }

      // Try to get players from roster
      const teamRoster = rosters.find((r: any) => {
        const rosterTeamName = r.team?.name || r.team?.displayName || '';
        return teamsMatch(teamName, teamShortName, rosterTeamName);
      });

      let players: any[] = [];
      
      if (teamRoster?.roster) {
        players = teamRoster.roster;
        console.log(`[sync-espn-playing-xi] Found ${players.length} players in roster`);
      }

      // Also check boxscore for lineup
      if (players.length === 0 && summaryData.boxscore) {
        const boxPlayers = summaryData.boxscore.players?.[i]?.statistics || [];
        if (boxPlayers.length > 0) {
          // Extract player names from boxscore
          for (const stat of boxPlayers) {
            const athleteData = stat.athletes || [];
            for (const athlete of athleteData) {
              if (athlete.athlete?.displayName) {
                players.push({ 
                  athlete: { 
                    displayName: athlete.athlete.displayName,
                    position: athlete.athlete.position?.name || null
                  }
                });
              }
            }
          }
          console.log(`[sync-espn-playing-xi] Found ${players.length} players in boxscore`);
        }
      }

      // Check for lineup data
      if (players.length === 0 && competitor.lineup) {
        players = competitor.lineup;
        console.log(`[sync-espn-playing-xi] Found ${players.length} players in lineup`);
      }

      // Process players (limit to 11)
      const uniquePlayers = new Set<string>();
      let battingOrder = 1;
      
      for (const player of players) {
        if (uniquePlayers.size >= 11) break;
        
        const playerName = player.displayName || 
                          player.athlete?.displayName || 
                          player.fullName ||
                          player.name || 
                          '';
        
        if (!playerName || uniquePlayers.has(playerName.toLowerCase())) continue;
        
        uniquePlayers.add(playerName.toLowerCase());
        
        // Detect player attributes
        const playerRole = player.position?.name || 
                          player.athlete?.position?.name ||
                          player.role || 
                          null;
        
        const isCaptain = playerName.includes('(c)') || 
                         playerName.toLowerCase().includes('captain') ||
                         player.captain === true;
        
        const isWicketKeeper = playerName.includes('(wk)') || 
                               playerName.toLowerCase().includes('wicket') ||
                               playerRole?.toLowerCase()?.includes('wicket');

        // Clean player name
        let cleanName = playerName
          .replace(/\(c\)/gi, '')
          .replace(/\(wk\)/gi, '')
          .replace(/\(vc\)/gi, '')
          .trim();

        playersToAdd.push({
          match_id: matchId,
          team_id: dbTeamId,
          player_name: cleanName,
          player_role: playerRole,
          is_captain: isCaptain,
          is_vice_captain: false,
          is_wicket_keeper: isWicketKeeper,
          batting_order: battingOrder++,
        });
      }

      console.log(`[sync-espn-playing-xi] Added ${uniquePlayers.size} players for ${teamName}`);
    }

    // Insert players into database
    if (playersToAdd.length > 0) {
      const { error: insertError } = await supabase
        .from('match_playing_xi')
        .insert(playersToAdd);

      if (insertError) {
        console.error('[sync-espn-playing-xi] Error inserting players:', insertError);
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to save players', playersAdded: 0 }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    console.log(`[sync-espn-playing-xi] Successfully added ${playersToAdd.length} players`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        playersAdded: playersToAdd.length,
        message: playersToAdd.length > 0 
          ? `Added ${playersToAdd.length} players from ESPN Cricinfo`
          : 'No player data found in ESPN'
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[sync-espn-playing-xi] Unexpected error:', error);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage, playersAdded: 0 }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
