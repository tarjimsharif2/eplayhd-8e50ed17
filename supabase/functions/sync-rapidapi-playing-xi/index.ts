import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Player {
  name: string;
  isCaptain: boolean;
  isWicketKeeper: boolean;
  isViceCaptain: boolean;
  role: string | null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const { matchId, teamAId, teamBId, teamAName, teamAShortName, teamBName, teamBShortName, cricbuzzMatchId } = body;

    if (!matchId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Match ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[sync-rapidapi-playing-xi] Syncing for match: ${matchId}`);

    // Get site settings for RapidAPI key and endpoints
    const { data: settings, error: settingsError } = await supabase
      .from('site_settings')
      .select('rapidapi_key, rapidapi_enabled, rapidapi_endpoints')
      .limit(1)
      .single();

    if (settingsError || !settings?.rapidapi_key || !settings?.rapidapi_enabled) {
      console.error('[sync-rapidapi-playing-xi] RapidAPI not configured or disabled');
      return new Response(
        JSON.stringify({ success: false, error: 'RapidAPI is not configured or disabled' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const endpoints = settings.rapidapi_endpoints as Record<string, string> || {};
    const cricbuzzHost = endpoints.cricbuzz_host || 'cricbuzz-cricket.p.rapidapi.com';
    
    // Check if COMPLETE playing XI already exists
    const { data: existingPlayers } = await supabase
      .from('match_playing_xi')
      .select('id, team_id')
      .eq('match_id', matchId);

    const teamAPlayerCount = existingPlayers?.filter(p => p.team_id === teamAId).length || 0;
    const teamBPlayerCount = existingPlayers?.filter(p => p.team_id === teamBId).length || 0;

    if (teamAPlayerCount >= 11 && teamBPlayerCount >= 11) {
      console.log(`[sync-rapidapi-playing-xi] Playing XI already complete (11+11)`);
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Playing XI already complete (11+11)',
          alreadyExists: true,
          playersAdded: 0
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get Cricbuzz match ID if not provided
    let cbMatchId = cricbuzzMatchId;
    if (!cbMatchId) {
      const { data: matchData } = await supabase
        .from('matches')
        .select('cricbuzz_match_id')
        .eq('id', matchId)
        .single();
      
      cbMatchId = matchData?.cricbuzz_match_id;
    }

    if (!cbMatchId) {
      console.log(`[sync-rapidapi-playing-xi] No Cricbuzz match ID found`);
      return new Response(
        JSON.stringify({ success: false, error: 'Cricbuzz match ID is required. Set it in match settings first.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[sync-rapidapi-playing-xi] Using Cricbuzz match ID: ${cbMatchId}`);

    // Try multiple endpoints to get Playing XI
    const playersToAdd: any[] = [];
    let teamAPlayers: Player[] = [];
    let teamBPlayers: Player[] = [];
    let foundData = false;

    // Endpoint 1: /mcenter/v1/{match_id}/hsquad (Match Squad)
    const squadEndpoint = endpoints.squad_endpoint || '/mcenter/v1/{match_id}/hsquad';
    const squadUrl = `https://${cricbuzzHost}${squadEndpoint.replace('{match_id}', cbMatchId)}`;
    
    console.log(`[sync-rapidapi-playing-xi] Trying squad endpoint: ${squadUrl}`);
    
    try {
      const response = await fetch(squadUrl, {
        method: 'GET',
        headers: {
          'X-RapidAPI-Key': settings.rapidapi_key,
          'X-RapidAPI-Host': cricbuzzHost,
        },
      });

      if (response.ok) {
        const data = await response.json();
        console.log(`[sync-rapidapi-playing-xi] Squad response:`, JSON.stringify(data).substring(0, 500));
        
        // Parse squad data
        const result = parseSquadData(data, teamAName, teamAShortName, teamBName, teamBShortName);
        if (result.teamA.length >= 11 && result.teamB.length >= 11) {
          teamAPlayers = result.teamA;
          teamBPlayers = result.teamB;
          foundData = true;
          console.log(`[sync-rapidapi-playing-xi] Found ${teamAPlayers.length}+${teamBPlayers.length} from hsquad`);
        }
      }
    } catch (error) {
      console.error(`[sync-rapidapi-playing-xi] Squad endpoint error:`, error);
    }

    // Endpoint 2: Try team-specific endpoints if hsquad failed
    if (!foundData) {
      for (let teamNum = 1; teamNum <= 2; teamNum++) {
        const teamEndpoint = endpoints.team_squad_endpoint || '/mcenter/v1/{match_id}/team/{team_num}';
        const teamUrl = `https://${cricbuzzHost}${teamEndpoint.replace('{match_id}', cbMatchId).replace('{team_num}', String(teamNum))}`;
        
        console.log(`[sync-rapidapi-playing-xi] Trying team endpoint: ${teamUrl}`);
        
        try {
          const response = await fetch(teamUrl, {
            method: 'GET',
            headers: {
              'X-RapidAPI-Key': settings.rapidapi_key,
              'X-RapidAPI-Host': cricbuzzHost,
            },
          });

          if (response.ok) {
            const data = await response.json();
            console.log(`[sync-rapidapi-playing-xi] Team ${teamNum} response:`, JSON.stringify(data).substring(0, 500));
            
            const players = parseTeamPlayers(data);
            if (players.length >= 11) {
              if (teamNum === 1) {
                teamAPlayers = players.slice(0, 11);
              } else {
                teamBPlayers = players.slice(0, 11);
              }
            }
          }
        } catch (error) {
          console.error(`[sync-rapidapi-playing-xi] Team ${teamNum} endpoint error:`, error);
        }
      }

      if (teamAPlayers.length >= 11 && teamBPlayers.length >= 11) {
        foundData = true;
      }
    }

    // Endpoint 3: Try scorecard as fallback
    if (!foundData) {
      const scardEndpoint = endpoints.scorecard_endpoint || '/mcenter/v1/{match_id}/scard';
      const scardUrl = `https://${cricbuzzHost}${scardEndpoint.replace('{match_id}', cbMatchId)}`;
      
      console.log(`[sync-rapidapi-playing-xi] Trying scorecard endpoint: ${scardUrl}`);
      
      try {
        const response = await fetch(scardUrl, {
          method: 'GET',
          headers: {
            'X-RapidAPI-Key': settings.rapidapi_key,
            'X-RapidAPI-Host': cricbuzzHost,
          },
        });

        if (response.ok) {
          const data = await response.json();
          console.log(`[sync-rapidapi-playing-xi] Scorecard response:`, JSON.stringify(data).substring(0, 500));
          
          const result = parseScorecardPlayers(data, teamAName, teamAShortName, teamBName, teamBShortName);
          if (result.teamA.length >= 5 || result.teamB.length >= 5) {
            teamAPlayers = result.teamA;
            teamBPlayers = result.teamB;
            foundData = true;
            console.log(`[sync-rapidapi-playing-xi] Found ${teamAPlayers.length}+${teamBPlayers.length} from scorecard`);
          }
        }
      } catch (error) {
        console.error(`[sync-rapidapi-playing-xi] Scorecard endpoint error:`, error);
      }
    }

    if (!foundData || (teamAPlayers.length < 11 && teamBPlayers.length < 11)) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Playing XI not available yet. Team A: ${teamAPlayers.length}, Team B: ${teamBPlayers.length} players found.`,
          playersAdded: 0
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Delete existing incomplete data
    if (existingPlayers && existingPlayers.length > 0) {
      console.log(`[sync-rapidapi-playing-xi] Deleting ${existingPlayers.length} incomplete players`);
      await supabase
        .from('match_playing_xi')
        .delete()
        .eq('match_id', matchId);
    }

    // Add Team A players
    let battingOrder = 1;
    for (const player of teamAPlayers.slice(0, 11)) {
      playersToAdd.push({
        match_id: matchId,
        team_id: teamAId,
        player_name: player.name,
        player_role: player.role,
        is_captain: player.isCaptain,
        is_vice_captain: player.isViceCaptain,
        is_wicket_keeper: player.isWicketKeeper,
        batting_order: battingOrder++,
      });
    }

    // Add Team B players
    battingOrder = 1;
    for (const player of teamBPlayers.slice(0, 11)) {
      playersToAdd.push({
        match_id: matchId,
        team_id: teamBId,
        player_name: player.name,
        player_role: player.role,
        is_captain: player.isCaptain,
        is_vice_captain: player.isViceCaptain,
        is_wicket_keeper: player.isWicketKeeper,
        batting_order: battingOrder++,
      });
    }

    // Insert players
    if (playersToAdd.length > 0) {
      const { error: insertError } = await supabase
        .from('match_playing_xi')
        .insert(playersToAdd);

      if (insertError) {
        console.error('[sync-rapidapi-playing-xi] Insert error:', insertError);
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to save players', playersAdded: 0 }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    console.log(`[sync-rapidapi-playing-xi] Successfully added ${playersToAdd.length} players`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        playersAdded: playersToAdd.length,
        teamAPlayers: teamAPlayers.length,
        teamBPlayers: teamBPlayers.length,
        message: `Added ${playersToAdd.length} players from RapidAPI Cricbuzz`
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[sync-rapidapi-playing-xi] Error:', errorMessage);
    
    return new Response(
      JSON.stringify({ success: false, error: errorMessage, playersAdded: 0 }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Parse squad data from /mcenter/v1/{match_id}/hsquad
function parseSquadData(data: any, teamAName: string, teamAShort: string, teamBName: string, teamBShort: string): { teamA: Player[], teamB: Player[] } {
  const teamA: Player[] = [];
  const teamB: Player[] = [];
  
  const normalizeTeam = (name: string) => (name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const teamANorm = normalizeTeam(teamAName);
  const teamAShortNorm = normalizeTeam(teamAShort);
  const teamBNorm = normalizeTeam(teamBName);
  const teamBShortNorm = normalizeTeam(teamBShort);

  // Try different data structures
  const squads = data.squads || data.squad || data.players || data.team || [];
  
  // Also check for team1/team2 structure
  if (data.team1 || data.team2) {
    const team1Players = extractPlayersFromTeam(data.team1);
    const team2Players = extractPlayersFromTeam(data.team2);
    
    const team1Name = normalizeTeam(data.team1?.teamName || data.team1?.name || '');
    
    if (team1Name.includes(teamANorm) || team1Name.includes(teamAShortNorm) || 
        teamANorm.includes(team1Name) || teamAShortNorm === team1Name) {
      teamA.push(...team1Players);
      teamB.push(...team2Players);
    } else {
      teamB.push(...team1Players);
      teamA.push(...team2Players);
    }
    return { teamA: teamA.slice(0, 11), teamB: teamB.slice(0, 11) };
  }

  // Handle array of squads
  if (Array.isArray(squads)) {
    for (const squad of squads) {
      const squadTeamName = normalizeTeam(squad.teamName || squad.name || squad.team || '');
      const players = extractPlayersFromTeam(squad);
      
      const isTeamA = squadTeamName.includes(teamANorm) || squadTeamName.includes(teamAShortNorm) ||
                      teamANorm.includes(squadTeamName) || teamAShortNorm === squadTeamName;
      
      if (isTeamA && teamA.length === 0) {
        teamA.push(...players);
      } else if (!isTeamA && teamB.length === 0) {
        teamB.push(...players);
      } else if (teamA.length === 0) {
        teamA.push(...players);
      } else if (teamB.length === 0) {
        teamB.push(...players);
      }
    }
  }

  return { teamA: teamA.slice(0, 11), teamB: teamB.slice(0, 11) };
}

// Extract players from a team object
function extractPlayersFromTeam(team: any): Player[] {
  if (!team) return [];
  
  const players: Player[] = [];
  
  // Try different player array locations
  const playerArrays = [
    team.playingXI,
    team.playing11,
    team.playingEleven,
    team.squad,
    team.players,
    team.player,
    team.xi,
  ];
  
  for (const arr of playerArrays) {
    if (Array.isArray(arr) && arr.length > 0) {
      for (const p of arr) {
        const player = extractPlayerInfo(p);
        if (player) {
          players.push(player);
        }
      }
      if (players.length >= 11) break;
    }
  }
  
  return players;
}

// Extract player info from various formats
function extractPlayerInfo(p: any): Player | null {
  if (!p) return null;
  
  let name = '';
  let isCaptain = false;
  let isWicketKeeper = false;
  let isViceCaptain = false;
  let role: string | null = null;
  
  if (typeof p === 'string') {
    name = p;
  } else if (typeof p === 'object') {
    name = p.name || p.fullName || p.playerName || p.displayName || p.shortName || '';
    isCaptain = p.isCaptain === true || p.captain === true || p.isC === true || 
                (typeof p.role === 'string' && p.role.toLowerCase().includes('captain'));
    isWicketKeeper = p.isWicketkeeper === true || p.isKeeper === true || p.isWk === true ||
                     (typeof p.role === 'string' && p.role.toLowerCase().includes('keeper'));
    isViceCaptain = p.isViceCaptain === true || p.isVc === true;
    role = p.role || p.playingRole || p.playerRole || null;
  }
  
  // Clean up name
  name = cleanPlayerName(name);
  
  if (!name || name.length < 3) return null;
  
  // Check for captain/keeper markers in name
  if (name.toLowerCase().includes('(c)') || name.endsWith(' c')) {
    isCaptain = true;
    name = name.replace(/\s*\(c\)\s*/gi, '').replace(/\s+c$/i, '').trim();
  }
  if (name.toLowerCase().includes('(wk)') || name.endsWith(' wk')) {
    isWicketKeeper = true;
    name = name.replace(/\s*\(wk\)\s*/gi, '').replace(/\s+wk$/i, '').trim();
  }
  
  return { name, isCaptain, isWicketKeeper, isViceCaptain, role };
}

// Parse team-specific endpoint data
function parseTeamPlayers(data: any): Player[] {
  const players: Player[] = [];
  
  // Try direct players array
  const playerArrays = [
    data.playingXI,
    data.playing11,
    data.players,
    data.squad,
    data.team?.playingXI,
    data.team?.players,
  ];
  
  for (const arr of playerArrays) {
    if (Array.isArray(arr)) {
      for (const p of arr) {
        const player = extractPlayerInfo(p);
        if (player) {
          players.push(player);
        }
      }
      if (players.length >= 11) break;
    }
  }
  
  return players;
}

// Parse scorecard data to extract players
function parseScorecardPlayers(data: any, teamAName: string, teamAShort: string, teamBName: string, teamBShort: string): { teamA: Player[], teamB: Player[] } {
  const teamA: Player[] = [];
  const teamB: Player[] = [];
  const seenA = new Set<string>();
  const seenB = new Set<string>();
  
  const normalizeTeam = (name: string) => (name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const teamANorm = normalizeTeam(teamAName);
  const teamAShortNorm = normalizeTeam(teamAShort);

  // Try to find innings data
  const innings = data.scoreCard || data.innings || data.inningsData || [];
  
  for (const inn of (Array.isArray(innings) ? innings : [])) {
    const inningsTeam = normalizeTeam(inn.batTeamName || inn.teamName || inn.team || '');
    const isTeamA = inningsTeam.includes(teamANorm) || inningsTeam.includes(teamAShortNorm) ||
                    teamANorm.includes(inningsTeam) || teamAShortNorm === inningsTeam;
    
    // Get batsmen
    const batsmen = inn.batTeamDetails?.batsmenData || inn.batsmen || inn.batting || [];
    const batsmenArr = typeof batsmen === 'object' && !Array.isArray(batsmen) ? Object.values(batsmen) : batsmen;
    
    for (const b of (Array.isArray(batsmenArr) ? batsmenArr : [])) {
      const player = extractPlayerInfo(b);
      if (player) {
        if (isTeamA && !seenA.has(player.name.toLowerCase()) && teamA.length < 11) {
          seenA.add(player.name.toLowerCase());
          teamA.push(player);
        } else if (!isTeamA && !seenB.has(player.name.toLowerCase()) && teamB.length < 11) {
          seenB.add(player.name.toLowerCase());
          teamB.push(player);
        }
      }
    }
    
    // Get bowlers (they belong to the OTHER team)
    const bowlers = inn.bowlTeamDetails?.bowlersData || inn.bowlers || inn.bowling || [];
    const bowlersArr = typeof bowlers === 'object' && !Array.isArray(bowlers) ? Object.values(bowlers) : bowlers;
    
    for (const b of (Array.isArray(bowlersArr) ? bowlersArr : [])) {
      const player = extractPlayerInfo(b);
      if (player) {
        // Bowlers belong to the opposite team
        if (!isTeamA && !seenA.has(player.name.toLowerCase()) && teamA.length < 11) {
          seenA.add(player.name.toLowerCase());
          teamA.push(player);
        } else if (isTeamA && !seenB.has(player.name.toLowerCase()) && teamB.length < 11) {
          seenB.add(player.name.toLowerCase());
          teamB.push(player);
        }
      }
    }
  }
  
  return { teamA, teamB };
}

// Clean player name
function cleanPlayerName(name: string): string {
  return (name || '')
    .replace(/\s*\(c\)\s*/gi, '')
    .replace(/\s*\(wk\)\s*/gi, '')
    .replace(/\s*\(vc\)\s*/gi, '')
    .replace(/\s*captain\s*/gi, '')
    .replace(/\s*wicket-?keeper\s*/gi, '')
    .replace(/\s*†\s*/g, '')
    .replace(/\s*\*\s*/g, '')
    .replace(/^\d+\.\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
}
