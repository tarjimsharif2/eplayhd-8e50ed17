import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GoalEvent {
  player: string;
  minute: string;
  assist?: string;
  type: 'goal' | 'penalty' | 'own_goal';
}

interface SubstitutionEvent {
  playerOut: string;
  playerIn: string;
  minute: string;
}

interface PlayerInfo {
  name: string;
  position: string;
  jerseyNumber?: string;
  isCaptain?: boolean;
}

interface FootballMatch {
  homeTeam: string;
  awayTeam: string;
  homeScore: string | null;
  awayScore: string | null;
  status: string;
  minute: string | null;
  competition: string | null;
  matchUrl: string | null;
  startTime: string | null;
  venue?: string | null;
  eventId?: string;
  round?: string | null;
  homeTeamLogo?: string | null;
  awayTeamLogo?: string | null;
  homeGoals?: GoalEvent[];
  awayGoals?: GoalEvent[];
  homeLineup?: PlayerInfo[];
  awayLineup?: PlayerInfo[];
  homeSubs?: SubstitutionEvent[];
  awaySubs?: SubstitutionEvent[];
}

// ESPN API endpoints for different leagues
const ESPN_LEAGUES = {
  'epl': 'eng.1',          // English Premier League
  'laliga': 'esp.1',       // La Liga
  'bundesliga': 'ger.1',   // Bundesliga
  'seriea': 'ita.1',       // Serie A
  'ligue1': 'fra.1',       // Ligue 1
  'ucl': 'uefa.champions', // UEFA Champions League
  'uel': 'uefa.europa',    // UEFA Europa League
  'mls': 'usa.1',          // MLS
  'worldcup': 'fifa.world',
};

// Fetch from ESPN public API
// Fetch match detail (lineup & substitutions) from ESPN
async function fetchMatchDetails(eventId: string, leagueCode: string): Promise<{
  homeLineup?: PlayerInfo[];
  awayLineup?: PlayerInfo[];
  homeSubs?: SubstitutionEvent[];
  awaySubs?: SubstitutionEvent[];
} | null> {
  try {
    const detailUrl = `https://site.api.espn.com/apis/site/v2/sports/soccer/${leagueCode}/summary?event=${eventId}`;
    console.log(`Fetching match details: ${detailUrl}`);
    
    const response = await fetch(detailUrl, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });
    
    if (!response.ok) return null;
    
    const data = await response.json();
    
    const homeLineup: PlayerInfo[] = [];
    const awayLineup: PlayerInfo[] = [];
    const homeSubs: SubstitutionEvent[] = [];
    const awaySubs: SubstitutionEvent[] = [];
    
    // Get home/away team IDs from header
    const competition = data.header?.competitions?.[0];
    const competitors = competition?.competitors || [];
    const homeTeamData = competitors.find((c: { homeAway: string }) => c.homeAway === 'home');
    const awayTeamData = competitors.find((c: { homeAway: string }) => c.homeAway === 'away');
    const homeTeamId = homeTeamData?.team?.id;
    const awayTeamId = awayTeamData?.team?.id;
    
    // Method 1: Parse from rosters array
    const rosters = data.rosters || [];
    for (const roster of rosters) {
      const isHome = roster.homeAway === 'home';
      const lineup = isHome ? homeLineup : awayLineup;
      
      for (const entry of roster.roster || []) {
        const player = entry.athlete;
        if (player && entry.starter) {
          lineup.push({
            name: player.displayName || player.fullName || 'Unknown',
            position: entry.position?.abbreviation || player.position?.abbreviation || '',
            jerseyNumber: player.jersey || entry.jersey,
            isCaptain: entry.captain || false,
          });
        }
      }
    }
    
    // Method 2: Parse from boxscore.players if rosters empty
    if (homeLineup.length === 0 && awayLineup.length === 0) {
      const boxscorePlayers = data.boxscore?.players || [];
      for (const teamPlayers of boxscorePlayers) {
        const teamId = teamPlayers.team?.id;
        const isHome = teamId === homeTeamId;
        const lineup = isHome ? homeLineup : awayLineup;
        
        // Look for lineup/starters in statistics
        for (const statGroup of teamPlayers.statistics || []) {
          if (statGroup.type === 'starters' || statGroup.name?.toLowerCase().includes('starter')) {
            for (const player of statGroup.athletes || []) {
              const athlete = player.athlete || player;
              lineup.push({
                name: athlete.displayName || athlete.fullName || 'Unknown',
                position: athlete.position?.abbreviation || player.position?.abbreviation || '',
                jerseyNumber: athlete.jersey,
                isCaptain: false,
              });
            }
          }
        }
      }
    }
    
    // Method 3: Parse from gameInfo.officials/formations if available
    if (homeLineup.length === 0 && awayLineup.length === 0) {
      const formations = data.gameInfo?.formations || data.formations || [];
      for (const formation of formations) {
        const teamId = formation.team?.id;
        const isHome = teamId === homeTeamId;
        const lineup = isHome ? homeLineup : awayLineup;
        
        for (const player of formation.players || formation.lineup || []) {
          lineup.push({
            name: player.displayName || player.name || player.fullName || 'Unknown',
            position: player.position?.abbreviation || player.position || '',
            jerseyNumber: player.jersey,
            isCaptain: player.captain || false,
          });
        }
      }
    }
    
    console.log(`[Match ${eventId}] Found ${homeLineup.length} home players, ${awayLineup.length} away players`);
    
    // Helper to extract player name from various ESPN API structures
    const getPlayerName = (playerObj: Record<string, unknown> | undefined | null): string => {
      if (!playerObj) return '';
      // Direct properties
      if (playerObj.displayName) return String(playerObj.displayName);
      if (playerObj.fullName) return String(playerObj.fullName);
      if (playerObj.shortName) return String(playerObj.shortName);
      if (playerObj.name) return String(playerObj.name);
      // Nested athlete object
      const athlete = playerObj.athlete as Record<string, unknown> | undefined;
      if (athlete) {
        if (athlete.displayName) return String(athlete.displayName);
        if (athlete.fullName) return String(athlete.fullName);
        if (athlete.shortName) return String(athlete.shortName);
        if (athlete.name) return String(athlete.name);
      }
      return '';
    };
    
    // Parse substitutions from keyEvents or plays
    const keyEvents = data.keyEvents || data.plays || [];
    for (const event of keyEvents) {
      if (event.type?.text === 'Substitution' || event.type?.id === '18' || 
          event.text?.toLowerCase().includes('substitution')) {
        const teamId = event.team?.id;
        const isHome = teamId === homeTeamId;
        
        const subsList = isHome ? homeSubs : awaySubs;
        
        // Get players from athletesInvolved (usually [playerOut, playerIn])
        const athletes = event.athletesInvolved || event.participants || [];
        
        // Try to extract player names
        let playerOut = '';
        let playerIn = '';
        
        if (athletes.length >= 2) {
          playerOut = getPlayerName(athletes[0]) || getPlayerName(athletes[1]);
          playerIn = getPlayerName(athletes[1]) || getPlayerName(athletes[0]);
          
          // Sometimes the order is reversed, check by type
          for (const a of athletes) {
            const pType = a.playerType || a.type;
            if (pType === 'playerOff' || pType === 'off') {
              playerOut = getPlayerName(a) || playerOut;
            } else if (pType === 'playerOn' || pType === 'on') {
              playerIn = getPlayerName(a) || playerIn;
            }
          }
        } else if (athletes.length === 1) {
          // Single athlete entry with both players nested
          const entry = athletes[0];
          playerOut = getPlayerName(entry.playerOff) || getPlayerName(entry.off) || getPlayerName(entry);
          playerIn = getPlayerName(entry.playerOn) || getPlayerName(entry.on) || '';
        }
        
        // Also try text parsing as fallback
        if ((!playerOut || !playerIn) && event.text) {
          const subText = String(event.text);
          // Pattern: "Substitution, Team. PlayerIn replaces PlayerOut"
          const replaceMatch = subText.match(/([A-Za-z\s\-']+)\s+replaces\s+([A-Za-z\s\-']+)/i);
          if (replaceMatch) {
            playerIn = playerIn || replaceMatch[1].trim();
            playerOut = playerOut || replaceMatch[2].trim();
          }
        }
        
        // Only add if we have BOTH valid player names (skip Unknown entries)
        if (playerOut && playerIn && playerOut !== 'Unknown' && playerIn !== 'Unknown') {
          const minute = event.clock?.displayValue || event.time?.displayValue || event.period?.displayValue || '';
          // Avoid duplicates within this parsing session
          const exists = subsList.some(s => s.minute === minute && s.playerIn === playerIn && s.playerOut === playerOut);
          if (!exists) {
            subsList.push({
              playerOut,
              playerIn,
              minute,
            });
          }
        }
      }
    }
    
    // Also check details array for substitutions (like goals)
    const details = data.details || competition?.details || [];
    for (const detail of details) {
      if (detail.type?.text === 'Substitution' || detail.type?.id === '18') {
        const teamId = detail.team?.id;
        const isHome = teamId === homeTeamId;
        const subsList = isHome ? homeSubs : awaySubs;
        
        const athletes = detail.athletesInvolved || [];
        let playerOut = '';
        let playerIn = '';
        
        for (const a of athletes) {
          const name = getPlayerName(a);
          const pType = a.playerType || a.type;
          if (pType === 'playerOff' || pType === 'off') {
            playerOut = name;
          } else if (pType === 'playerOn' || pType === 'on') {
            playerIn = name;
          }
        }
        
        // Fallback to array order
        if (!playerOut && !playerIn && athletes.length >= 2) {
          playerOut = getPlayerName(athletes[0]);
          playerIn = getPlayerName(athletes[1]);
        }
        
        const minute = detail.clock?.displayValue || detail.time?.displayValue || '';
        
        // Only add if we have BOTH valid player names (skip Unknown entries)
        // Use full duplicate check with minute, playerIn, AND playerOut
        const exists = subsList.some(s => s.minute === minute && s.playerIn === playerIn && s.playerOut === playerOut);
        if (!exists && playerOut && playerIn && playerOut !== 'Unknown' && playerIn !== 'Unknown') {
          subsList.push({
            playerOut,
            playerIn,
            minute,
          });
        }
      }
    }
    
    console.log(`[Match ${eventId}] Found ${homeSubs.length} home subs, ${awaySubs.length} away subs`);
    
    return {
      homeLineup: homeLineup.length > 0 ? homeLineup : undefined,
      awayLineup: awayLineup.length > 0 ? awayLineup : undefined,
      homeSubs: homeSubs.length > 0 ? homeSubs : undefined,
      awaySubs: awaySubs.length > 0 ? awaySubs : undefined,
    };
    
  } catch (error) {
    console.error('Error fetching match details:', error);
    return null;
  }
}

async function fetchESPNScores(league: string = 'epl', includeDetails: boolean = false): Promise<FootballMatch[]> {
  const matches: FootballMatch[] = [];
  const leagueCode = ESPN_LEAGUES[league as keyof typeof ESPN_LEAGUES] || league;
  
  try {
    // Generate date range: today to 7 days ahead (ESPN format: YYYYMMDD-YYYYMMDD)
    const today = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 7);
    
    const formatDate = (d: Date) => d.toISOString().split('T')[0].replace(/-/g, '');
    const dateRange = `${formatDate(today)}-${formatDate(endDate)}`;
    
    const apiUrl = `https://site.api.espn.com/apis/site/v2/sports/soccer/${leagueCode}/scoreboard?dates=${dateRange}`;
    console.log(`Fetching ESPN API: ${apiUrl}`);
    
    const response = await fetch(apiUrl, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });
    
    if (!response.ok) {
      console.error(`ESPN API error: ${response.status}`);
      return matches;
    }
    
    const data = await response.json();
    console.log(`ESPN API returned ${data.events?.length || 0} events for date range ${dateRange}`);
    
    for (const event of data.events || []) {
      const competition = event.competitions?.[0];
      if (!competition) continue;
      
      const competitors = competition.competitors || [];
      if (competitors.length < 2) continue;
      
      const homeTeam = competitors.find((c: { homeAway: string }) => c.homeAway === 'home');
      const awayTeam = competitors.find((c: { homeAway: string }) => c.homeAway === 'away');
      
      if (!homeTeam || !awayTeam) continue;
      
      // Determine match status
      let status = 'Scheduled';
      let minute: string | null = null;
      
      const statusType = competition.status?.type?.name || '';
      const statusDetail = competition.status?.type?.detail || '';
      const displayClock = competition.status?.displayClock || '';
      
      if (statusType === 'STATUS_IN_PROGRESS') {
        status = 'Live';
        minute = displayClock || statusDetail;
      } else if (statusType === 'STATUS_HALFTIME') {
        status = 'Half Time';
        minute = 'HT';
      } else if (statusType === 'STATUS_FINAL' || statusType === 'STATUS_FULL_TIME') {
        status = 'Completed';
        minute = 'FT';
      } else if (statusType === 'STATUS_SCHEDULED' || statusType === 'STATUS_POSTPONED') {
        status = statusType === 'STATUS_POSTPONED' ? 'Postponed' : 'Scheduled';
      }
      
      // Parse goal details from competition details
      const homeGoals: GoalEvent[] = [];
      const awayGoals: GoalEvent[] = [];
      
      // Get goal details from details array
      const details = competition.details || [];
      for (const detail of details) {
        if (detail.type?.text === 'Goal' || detail.type?.id === '8' || 
            detail.type?.text === 'Penalty - Scored' || detail.type?.id === '58' ||
            detail.type?.text === 'Own Goal' || detail.type?.id === '25') {
          
          const goalEvent: GoalEvent = {
            player: detail.athletesInvolved?.[0]?.displayName || detail.athletesInvolved?.[0]?.fullName || 'Unknown',
            minute: detail.clock?.displayValue || detail.time?.displayValue || '',
            type: detail.type?.text?.includes('Penalty') ? 'penalty' : 
                  detail.type?.text?.includes('Own') ? 'own_goal' : 'goal',
          };
          
          // Check for assist
          if (detail.athletesInvolved?.length > 1) {
            goalEvent.assist = detail.athletesInvolved[1]?.displayName || detail.athletesInvolved[1]?.fullName;
          }
          
          // Determine which team scored
          const teamId = detail.team?.id;
          if (teamId === homeTeam.team?.id) {
            homeGoals.push(goalEvent);
          } else if (teamId === awayTeam.team?.id) {
            awayGoals.push(goalEvent);
          }
        }
      }
      
      // Build match object
      // Get venue from competition
      const venue = competition.venue?.fullName || competition.venue?.shortName || null;
      
      // Extract round/matchday info from event or season
      let round: string | null = null;
      // Try week number first (e.g., week.number for league matches)
      if (event.week?.number) {
        round = `${event.week.number}`;
      } else if (event.season?.type?.week?.number) {
        round = `${event.season.type.week.number}`;
      }
      
      // For league stage and knockout rounds, check competition type and event name
      if (!round) {
        // Check competition type for round info
        const competitionType = event.seasonType?.name || event.season?.type?.name || '';
        
        // Check if event name or competition type contains round info
        const eventName = event.name || '';
        const combined = `${eventName} ${competitionType}`;
        
        // Match various round patterns
        const roundPatterns = [
          /(?:Round|Matchday|Week|Gameweek|Match Day)\s*(\d+)/i,
          /(?:League Phase|Group Stage)\s*-?\s*(?:Matchday|Day|Round)?\s*(\d+)/i,
          /MD?\s*(\d+)/i,  // Matchday shortcuts like "MD8", "M8"
        ];
        
        for (const pattern of roundPatterns) {
          const match = combined.match(pattern);
          if (match) {
            round = match[1];
            break;
          }
        }
        
        // Check for knockout stages
        if (!round) {
          const knockoutMatch = combined.match(/(Final|Semi-?Final|Quarter-?Final|Round of \d+|Playoffs?|Group Stage)/i);
          if (knockoutMatch) {
            round = knockoutMatch[1];
          }
        }
      }
      
      // Also try extracting from competition notes
      if (!round && competition.notes) {
        const notes = Array.isArray(competition.notes) ? competition.notes.join(' ') : String(competition.notes);
        const noteMatch = notes.match(/(?:Matchday|Round|Week)\s*(\d+)/i);
        if (noteMatch) {
          round = noteMatch[1];
        }
      }
      
      // Extract team logos from ESPN data
      const homeTeamLogo = homeTeam.team?.logo || homeTeam.team?.logos?.[0]?.href || null;
      const awayTeamLogo = awayTeam.team?.logo || awayTeam.team?.logos?.[0]?.href || null;
      
      const matchObj: FootballMatch = {
        homeTeam: homeTeam.team?.displayName || homeTeam.team?.name || 'Unknown',
        awayTeam: awayTeam.team?.displayName || awayTeam.team?.name || 'Unknown',
        homeScore: homeTeam.score?.toString() || null,
        awayScore: awayTeam.score?.toString() || null,
        status,
        minute,
        competition: data.leagues?.[0]?.name || event.name || null,
        matchUrl: event.links?.[0]?.href || null,
        startTime: event.date || null,
        venue,
        eventId: event.id,
        round,
        homeTeamLogo,
        awayTeamLogo,
        homeGoals: homeGoals.length > 0 ? homeGoals : undefined,
        awayGoals: awayGoals.length > 0 ? awayGoals : undefined,
      };
      
      // Fetch detailed lineup & subs if requested and match is live or completed
      if (includeDetails && (status === 'Live' || status === 'Half Time' || status === 'Completed')) {
        const matchDetails = await fetchMatchDetails(event.id, leagueCode);
        if (matchDetails) {
          matchObj.homeLineup = matchDetails.homeLineup;
          matchObj.awayLineup = matchDetails.awayLineup;
          matchObj.homeSubs = matchDetails.homeSubs;
          matchObj.awaySubs = matchDetails.awaySubs;
        }
      }
      
      matches.push(matchObj);
    }
    
  } catch (error) {
    console.error('ESPN API error:', error);
  }
  
  return matches;
}

// Fetch all major leagues at once
async function fetchAllLeagues(includeDetails: boolean = false): Promise<FootballMatch[]> {
  const allMatches: FootballMatch[] = [];
  const leaguesToFetch = ['epl', 'laliga', 'bundesliga', 'seriea', 'ligue1', 'ucl'];
  
  const promises = leaguesToFetch.map(league => fetchESPNScores(league, includeDetails));
  const results = await Promise.all(promises);
  
  for (const matches of results) {
    allMatches.push(...matches);
  }
  
  return allMatches;
}

// Extract text content from HTML
function extractText(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

// Decode HTML entities
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

// Parse football scores from HTML (fallback for custom URLs)
function parseHTMLScores(html: string): FootballMatch[] {
  const matches: FootballMatch[] = [];
  
  try {
    // Pattern for table rows
    const rowPatterns = [
      /<tr[^>]*>([\s\S]*?)<\/tr>/gi,
      /<div[^>]*class="[^"]*(?:match|game|fixture|result)[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
    ];

    const potentialMatches: string[] = [];
    for (const pattern of rowPatterns) {
      let match;
      pattern.lastIndex = 0;
      while ((match = pattern.exec(html)) !== null) {
        potentialMatches.push(match[1]);
      }
    }

    for (const matchHtml of potentialMatches) {
      if (matchHtml.length < 50) continue;
      
      const linkPattern = /<a[^>]*href="([^"]*)"[^>]*>([^<]+)<\/a>/gi;
      const links: { href: string; text: string }[] = [];
      let linkMatch;
      while ((linkMatch = linkPattern.exec(matchHtml)) !== null) {
        const text = decodeHtmlEntities(extractText(linkMatch[2]));
        if (text.length > 2 && text.length < 50) {
          links.push({ href: linkMatch[1], text });
        }
      }
      
      const numbers = matchHtml.match(/>(\d+)</g)?.map(n => n.replace(/[><]/g, '')) || [];
      
      const teamLinks = links.filter(l => 
        l.href.includes('/club/') || 
        l.href.includes('/team/') || 
        l.href.includes('/en/club/') ||
        l.href.includes('/en/team/')
      );
      
      if (teamLinks.length >= 2) {
        const homeTeam = teamLinks[0].text;
        const awayTeam = teamLinks[1].text;
        
        let homeScore: string | null = null;
        let awayScore: string | null = null;
        
        const scorePattern = /(\d+)\s*[-–:]\s*(\d+)/;
        const scoreMatch = matchHtml.match(scorePattern);
        if (scoreMatch) {
          homeScore = scoreMatch[1];
          awayScore = scoreMatch[2];
        } else if (numbers.length >= 2) {
          homeScore = numbers[0];
          awayScore = numbers[1];
        }
        
        let status = 'Scheduled';
        let minute: string | null = null;
        
        if (matchHtml.toLowerCase().includes('live') || matchHtml.includes("'")) {
          status = 'Live';
        }
        
        const minuteMatch = matchHtml.match(/(\d+(?:\+\d+)?)'|(\d+)\s*min/i);
        if (minuteMatch) {
          minute = (minuteMatch[1] || minuteMatch[2]) + "'";
          status = 'Live';
        }
        
        if (matchHtml.includes('FT') || matchHtml.toLowerCase().includes('full time')) {
          status = 'Completed';
        } else if (matchHtml.includes('HT') || matchHtml.toLowerCase().includes('half time')) {
          status = 'Half Time';
          minute = "45'";
        }
        
        const exists = matches.some(m => 
          m.homeTeam.toLowerCase() === homeTeam.toLowerCase() && 
          m.awayTeam.toLowerCase() === awayTeam.toLowerCase()
        );
        
        if (!exists && homeTeam !== awayTeam) {
          matches.push({
            homeTeam,
            awayTeam,
            homeScore,
            awayScore,
            status,
            minute,
            competition: null,
            matchUrl: teamLinks[0].href.split('/club/')[0] || null,
            startTime: null,
          });
        }
      }
    }
    
  } catch (error) {
    console.error('Error parsing HTML scores:', error);
  }
  
  return matches;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { url, league, allLeagues, matchId, includeDetails } = body;

    console.log(`Football scores request - league: ${league}, allLeagues: ${allLeagues}, includeDetails: ${includeDetails}, url: ${url}`);

    let matches: FootballMatch[] = [];

    // Option 1: Fetch all major leagues
    if (allLeagues) {
      console.log('Fetching all major leagues...');
      matches = await fetchAllLeagues(includeDetails === true);
    }
    // Option 2: Fetch specific league from ESPN
    else if (league) {
      console.log(`Fetching league: ${league}`);
      matches = await fetchESPNScores(league, includeDetails === true);
    }
    // Option 3: Scrape from custom URL (fallback)
    else if (url) {
      console.log(`Scraping custom URL: ${url}`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000);

      const response = await fetch(url, {
        headers: {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Cache-Control': 'no-cache',
        },
        signal: controller.signal,
        redirect: 'follow',
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return new Response(
          JSON.stringify({ error: `Failed to fetch page: ${response.status}` }),
          { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const html = await response.text();
      console.log(`Fetched ${html.length} bytes`);
      matches = parseHTMLScores(html);
    }
    // Default: Fetch EPL
    else {
      console.log('No parameters, fetching EPL by default');
      matches = await fetchESPNScores('epl', includeDetails === true);
    }

    // Filter to only live matches if requested
    const liveOnly = body.liveOnly === true;
    if (liveOnly) {
      matches = matches.filter(m => m.status === 'Live' || m.status === 'Half Time');
    }

    console.log(`Returning ${matches.length} matches`);

    return new Response(
      JSON.stringify({
        success: true,
        matches,
        scrapedAt: new Date().toISOString(),
        matchId: matchId || null,
        totalMatches: matches.length,
        source: league || (allLeagues ? 'all-leagues' : (url ? 'custom-url' : 'epl')),
        availableLeagues: Object.keys(ESPN_LEAGUES),
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error: unknown) {
    console.error('Scrape football scores error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
