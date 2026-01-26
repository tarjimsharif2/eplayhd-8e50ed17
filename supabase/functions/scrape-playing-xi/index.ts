import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Player {
  name: string;
  isCaptain: boolean;
  isWicketKeeper: boolean;
  role?: string;
}

// Clean and validate player name
function cleanPlayerName(name: string): string {
  return name
    .replace(/\s*\(c\)\s*/gi, '')
    .replace(/\s*\(wk\)\s*/gi, '')
    .replace(/\s*\(c & wk\)\s*/gi, '')
    .replace(/\s*\(wk & c\)\s*/gi, '')
    .replace(/\s*captain\s*/gi, '')
    .replace(/\s*wicket-?keeper\s*/gi, '')
    .replace(/\s*†\s*/g, '')
    .replace(/\s*\*\s*/g, '')
    .replace(/^\d+\.\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isValidPlayerName(name: string): boolean {
  const cleaned = cleanPlayerName(name);
  if (!cleaned || cleaned.length < 3 || cleaned.length > 50) return false;
  
  // Reject URLs
  if (/^https?:\/\//i.test(cleaned)) return false;
  
  // Reject common non-player patterns
  const invalidPatterns = [
    /^(home|away|team|squad|playing|bench|substitute|match|live|score|cricket|batting|bowling|fielding|innings)$/i,
    /^(view|more|less|show|hide|click|tap|scroll|load|loading)$/i,
    /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+\d/i,
    /^\d{1,2}:\d{2}/,
    /^vs\.?$/i,
    /^(1st|2nd|3rd|4th)\s+(test|odi|t20)/i,
    /advertisement/i,
    /^\s*$/,
    /^[^a-zA-Z]*$/,
    /^(runs?|wickets?|overs?|balls?|extras?|total|target)$/i,
    /^(yet to bat|did not bat|retired|absent)$/i,
    // Navigation and menu items
    /^(live scores?|schedule|archives?|news|all stories|premium|editorials|latest|topics|series|teams|videos|photos|rankings|icc|world cup|matches|fixtures|results)$/i,
    /^(sign in|sign up|login|logout|register|subscribe|contact|about|privacy|terms|help|faq|support|settings|profile)$/i,
    /^(home|cricket|football|sports|menu|navigation|search|filter)$/i,
    /^(read more|see all|load more|show more|view all|expand|collapse|close|open)$/i,
    // JSON schema types
    /^(SiteNavigationElement|ItemList|ListItem|WebPage|Organization|BreadcrumbList|SportsEvent|Person)$/i,
    /^(http|https|www\.|\.com|\.org|\.net)/i,
    /instagram|facebook|twitter|youtube|linkedin/i,
  ];
  
  for (const pattern of invalidPatterns) {
    if (pattern.test(cleaned)) return false;
  }
  
  // Must have at least 2 words for a valid cricket player name
  const words = cleaned.split(' ').filter(w => w.length > 1);
  if (words.length < 2) return false;
  
  // Must contain at least 2 consecutive letters
  if (!/[a-zA-Z]{2,}/.test(cleaned)) return false;
  
  // Must start with a letter (player names start with letters)
  if (!/^[a-zA-Z]/.test(cleaned)) return false;
  
  // Reject if contains special navigation characters
  if (/[@#$%^&*()=+\[\]{}|\\<>\/]/.test(cleaned)) return false;
  
  return true;
}

function parsePlayer(text: string): Player | null {
  const cleaned = text.trim();
  if (!isValidPlayerName(cleaned)) return null;
  
  const isCaptain = /\(c\)|\bcaptain\b|\*$/i.test(cleaned);
  const isWicketKeeper = /\(wk\)|†|wicket-?keeper/i.test(cleaned);
  
  const name = cleanPlayerName(cleaned);
  if (!name || name.length < 3) return null;
  
  return { name, isCaptain, isWicketKeeper };
}

// Source 0: Get players from match_api_scores table (API Cricket data)
async function fetchFromApiScores(supabase: any, matchId: string, teamAName: string, teamBName: string): Promise<{ teamA: Player[], teamB: Player[] } | null> {
  console.log(`[API Scores] Checking match_api_scores for match ${matchId}`);
  
  try {
    const { data: apiScore, error } = await supabase
      .from('match_api_scores')
      .select('batsmen, bowlers, scorecard, extras, home_team, away_team')
      .eq('match_id', matchId)
      .single();
    
    if (error || !apiScore) {
      console.log(`[API Scores] No API score data found`);
      return null;
    }
    
    const teamAPlayers: Player[] = [];
    const teamBPlayers: Player[] = [];
    const seenNames = new Set<string>();
    
    const homeTeam = (apiScore.home_team || '').toLowerCase();
    const awayTeam = (apiScore.away_team || '').toLowerCase();
    const teamALower = teamAName.toLowerCase();
    
    // Determine which API team maps to which DB team
    const homeIsTeamA = teamALower.includes(homeTeam.split(' ')[0]) || 
                        homeTeam.includes(teamALower.split(' ')[0]) ||
                        teamALower.includes(homeTeam.replace(/\s+/g, '').substring(0, 4));
    
    console.log(`[API Scores] homeTeam=${homeTeam}, awayTeam=${awayTeam}, homeIsTeamA=${homeIsTeamA}`);
    
    const addPlayer = (name: string, playerTeam: string, isCaptain = false, isWicketKeeper = false) => {
      if (!name || typeof name !== 'string') return;
      
      const cleanedName = name
        .replace(/\s*\(c\)\s*/gi, '')
        .replace(/\s*\(wk\)\s*/gi, '')
        .replace(/,\s*$/, '')
        .trim();
      
      if (!cleanedName || cleanedName.length < 3 || seenNames.has(cleanedName.toLowerCase())) return;
      
      // Skip invalid names
      if (/^(extras?|total|fall of wickets|did not bat|yet to bat)$/i.test(cleanedName)) return;
      
      seenNames.add(cleanedName.toLowerCase());
      
      const player: Player = {
        name: cleanedName,
        isCaptain: isCaptain || /\(c\)/i.test(name),
        isWicketKeeper: isWicketKeeper || /\(wk\)/i.test(name),
      };
      
      const playerTeamLower = (playerTeam || '').toLowerCase();
      const isHomeTeamPlayer = playerTeamLower.includes(homeTeam.split(' ')[0]) || 
                               homeTeam.includes(playerTeamLower.split(' ')[0]);
      
      if (homeIsTeamA) {
        if (isHomeTeamPlayer && teamAPlayers.length < 11) {
          teamAPlayers.push(player);
        } else if (!isHomeTeamPlayer && teamBPlayers.length < 11) {
          teamBPlayers.push(player);
        }
      } else {
        if (isHomeTeamPlayer && teamBPlayers.length < 11) {
          teamBPlayers.push(player);
        } else if (!isHomeTeamPlayer && teamAPlayers.length < 11) {
          teamAPlayers.push(player);
        }
      }
    };
    
    // Process scorecard first (most complete data)
    if (Array.isArray(apiScore.scorecard)) {
      for (const innings of apiScore.scorecard) {
        const inningsTeam = innings.team || innings.batting_team || '';
        if (Array.isArray(innings.batting)) {
          for (const b of innings.batting) {
            addPlayer(b.player || b.batsman || b.name, inningsTeam, b.isCaptain, b.isWicketKeeper);
          }
        }
        if (Array.isArray(innings.bowling)) {
          for (const b of innings.bowling) {
            addPlayer(b.player || b.bowler || b.name, inningsTeam === homeTeam ? awayTeam : homeTeam);
          }
        }
      }
    }
    
    // Process batsmen array
    if (Array.isArray(apiScore.batsmen)) {
      for (const b of apiScore.batsmen) {
        addPlayer(b.player || b.name, b.team || '');
      }
    }
    
    // Process bowlers array
    if (Array.isArray(apiScore.bowlers)) {
      for (const b of apiScore.bowlers) {
        addPlayer(b.player || b.name, b.team || '');
      }
    }
    
    // Process extras to get team info
    if (Array.isArray(apiScore.extras)) {
      for (const e of apiScore.extras) {
        const inningsTeam = e.team || '';
        console.log(`[API Scores] Extras for team: ${inningsTeam}`);
      }
    }
    
    console.log(`[API Scores] Found ${teamAPlayers.length} Team A + ${teamBPlayers.length} Team B players`);
    
    if (teamAPlayers.length >= 3 || teamBPlayers.length >= 3) {
      return { 
        teamA: teamAPlayers.slice(0, 11), 
        teamB: teamBPlayers.slice(0, 11) 
      };
    }
    
    return null;
  } catch (error) {
    console.log(`[API Scores] Error: ${error}`);
    return null;
  }
}

// Source 1: Cricbuzz Mobile API
async function fetchFromCricbuzzMobileAPI(cricbuzzId: string): Promise<{ teamA: Player[], teamB: Player[] } | null> {
  console.log(`[Cricbuzz Mobile API] Trying match ID: ${cricbuzzId}`);
  
  const endpoints = [
    `https://www.cricbuzz.com/api/cricket-match/${cricbuzzId}/full-scorecard`,
    `https://www.cricbuzz.com/api/cricket-match/${cricbuzzId}/commentary`,
    `https://www.cricbuzz.com/api/cricket-match/${cricbuzzId}/info`,
    `https://m.cricbuzz.com/api/match/${cricbuzzId}/scorecard`,
  ];
  
  for (const url of endpoints) {
    try {
      console.log(`[Cricbuzz Mobile API] Fetching: ${url}`);
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
          'Accept': 'application/json, text/plain, */*',
        },
      });
      
      if (!response.ok) continue;
      
      const text = await response.text();
      try {
        const data = JSON.parse(text);
        const players = extractPlayersFromJson(data);
        if (players.teamA.length >= 5 || players.teamB.length >= 5) {
          console.log(`[Cricbuzz Mobile API] Found ${players.teamA.length} + ${players.teamB.length} players`);
          return players;
        }
      } catch {
        // Not JSON, continue
      }
    } catch (error) {
      console.log(`[Cricbuzz Mobile API] Error: ${error}`);
    }
  }
  
  return null;
}

// Source 2: Cricbuzz HTML Scorecard
async function fetchFromCricbuzzHtml(cricbuzzId: string): Promise<{ teamA: Player[], teamB: Player[] } | null> {
  console.log(`[Cricbuzz HTML] Trying match ID: ${cricbuzzId}`);
  
  const urls = [
    `https://www.cricbuzz.com/api/html/cricket-scorecard/${cricbuzzId}`,
    `https://www.cricbuzz.com/live-cricket-scorecard/${cricbuzzId}/match`,
    `https://m.cricbuzz.com/live-cricket-scorecard/${cricbuzzId}/match`,
    `https://www.cricbuzz.com/cricket-match-squads/${cricbuzzId}/match`,
  ];
  
  for (const url of urls) {
    try {
      console.log(`[Cricbuzz HTML] Fetching: ${url}`);
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      });
      
      if (!response.ok) continue;
      
      const html = await response.text();
      const players = extractPlayersFromHtml(html);
      if (players.teamA.length >= 5 || players.teamB.length >= 5) {
        console.log(`[Cricbuzz HTML] Found ${players.teamA.length} + ${players.teamB.length} players`);
        return players;
      }
    } catch (error) {
      console.log(`[Cricbuzz HTML] Error: ${error}`);
    }
  }
  
  return null;
}

// Source 3: CricAPI / Free Cricket APIs
async function fetchFromFreeCricketAPIs(teamAName: string, teamBName: string): Promise<{ teamA: Player[], teamB: Player[] } | null> {
  console.log(`[Free APIs] Searching for ${teamAName} vs ${teamBName}`);
  
  // Try cricketdata.org (free tier available)
  const freeApis = [
    'https://api.cricapi.com/v1/currentMatches?apikey=demo',
    'https://cricket.sportmonks.com/api/v2.0/livescores',
  ];
  
  for (const url of freeApis) {
    try {
      const response = await fetch(url, {
        headers: { 'Accept': 'application/json' },
      });
      
      if (!response.ok) continue;
      
      const data = await response.json();
      // Try to find matching match
      if (data.data && Array.isArray(data.data)) {
        for (const match of data.data) {
          if (matchContainsTeams(match, teamAName, teamBName)) {
            const players = extractPlayersFromJson(match);
            if (players.teamA.length >= 5) return players;
          }
        }
      }
    } catch (error) {
      console.log(`[Free APIs] Error: ${error}`);
    }
  }
  
  return null;
}

// Source 4: ESPN Cricinfo Web Scrape
async function fetchFromESPNWeb(teamAName: string, teamBName: string): Promise<{ teamA: Player[], teamB: Player[] } | null> {
  console.log(`[ESPN Web] Searching for ${teamAName} vs ${teamBName}`);
  
  try {
    // First get live matches
    const searchUrl = 'https://www.espncricinfo.com/live-cricket-score';
    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      },
    });
    
    if (!response.ok) return null;
    
    const html = await response.text();
    
    // Find match URL
    const matchUrlRegex = /href="(\/series\/[^"]+\/[^"]+\/full-scorecard)"/gi;
    let match;
    while ((match = matchUrlRegex.exec(html)) !== null) {
      const fullUrl = `https://www.espncricinfo.com${match[1]}`;
      console.log(`[ESPN Web] Checking: ${fullUrl}`);
      
      try {
        const scorecardResponse = await fetch(fullUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          },
        });
        
        if (scorecardResponse.ok) {
          const scorecardHtml = await scorecardResponse.text();
          if (scorecardHtml.toLowerCase().includes(teamAName.toLowerCase().split(' ')[0]) ||
              scorecardHtml.toLowerCase().includes(teamBName.toLowerCase().split(' ')[0])) {
            const players = extractPlayersFromHtml(scorecardHtml);
            if (players.teamA.length >= 5) {
              console.log(`[ESPN Web] Found match with ${players.teamA.length} + ${players.teamB.length} players`);
              return players;
            }
          }
        }
      } catch {
        // Continue to next match
      }
    }
  } catch (error) {
    console.log(`[ESPN Web] Error: ${error}`);
  }
  
  return null;
}

// Source 5: Google Search + Scrape
async function fetchViaGoogleSearch(teamAName: string, teamBName: string): Promise<{ teamA: Player[], teamB: Player[] } | null> {
  console.log(`[Google Search] Searching for ${teamAName} vs ${teamBName} playing xi`);
  
  const searchQuery = encodeURIComponent(`${teamAName} vs ${teamBName} playing xi squad 2025`);
  const searchUrls = [
    `https://www.google.com/search?q=${searchQuery}`,
    `https://duckduckgo.com/html/?q=${searchQuery}`,
  ];
  
  for (const searchUrl of searchUrls) {
    try {
      const response = await fetch(searchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml',
        },
      });
      
      if (!response.ok) continue;
      
      const html = await response.text();
      
      // Extract links to cricket sites
      const urlRegex = /href="(https?:\/\/(?:www\.)?(?:cricbuzz|espncricinfo|cricket\.com)[^"]+)"/gi;
      let match;
      const visitedUrls = new Set<string>();
      
      while ((match = urlRegex.exec(html)) !== null && visitedUrls.size < 3) {
        const url = match[1];
        if (visitedUrls.has(url)) continue;
        visitedUrls.add(url);
        
        try {
          const pageResponse = await fetch(url, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            },
          });
          
          if (pageResponse.ok) {
            const pageHtml = await pageResponse.text();
            const players = extractPlayersFromHtml(pageHtml);
            if (players.teamA.length >= 5 || players.teamB.length >= 5) {
              console.log(`[Google Search] Found ${players.teamA.length} + ${players.teamB.length} players from ${url}`);
              return players;
            }
          }
        } catch {
          // Continue to next URL
        }
      }
    } catch (error) {
      console.log(`[Google Search] Error: ${error}`);
    }
  }
  
  return null;
}

// Source 6: Direct Team Squad Pages
async function fetchFromSquadPages(teamAName: string, teamBName: string): Promise<{ teamA: Player[], teamB: Player[] } | null> {
  console.log(`[Squad Pages] Fetching squad for ${teamAName} and ${teamBName}`);
  
  const teamA: Player[] = [];
  const teamB: Player[] = [];
  
  const normalizeTeamName = (name: string) => name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  
  const teamASlug = normalizeTeamName(teamAName);
  const teamBSlug = normalizeTeamName(teamBName);
  
  const squadUrls = [
    `https://www.espncricinfo.com/team/${teamASlug}/players`,
    `https://www.espncricinfo.com/team/${teamBSlug}/players`,
    `https://www.cricbuzz.com/cricket-team/${teamASlug}/players`,
    `https://www.cricbuzz.com/cricket-team/${teamBSlug}/players`,
  ];
  
  for (let i = 0; i < squadUrls.length; i++) {
    try {
      const response = await fetch(squadUrls[i], {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });
      
      if (!response.ok) continue;
      
      const html = await response.text();
      const players = extractPlayersFromHtml(html);
      
      // First 2 URLs are for Team A, next 2 for Team B
      if (i < 2 && players.teamA.length > 0) {
        teamA.push(...players.teamA.slice(0, 11));
      } else if (i >= 2 && players.teamA.length > 0) {
        teamB.push(...players.teamA.slice(0, 11));
      }
    } catch {
      // Continue to next URL
    }
  }
  
  if (teamA.length >= 5 || teamB.length >= 5) {
    console.log(`[Squad Pages] Found ${teamA.length} + ${teamB.length} players`);
    return { teamA, teamB };
  }
  
  return null;
}

// Source 7: Cricket News Sites (CricketAddictor, CricTracker, NDTV, India Today, etc.)
async function fetchFromCricketNewsSites(teamAName: string, teamBName: string): Promise<{ teamA: Player[], teamB: Player[] } | null> {
  console.log(`[Cricket News Sites] Searching for ${teamAName} vs ${teamBName}`);
  
  const teamASlug = teamAName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  const teamBSlug = teamBName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  const searchQuery = encodeURIComponent(`${teamAName} vs ${teamBName} playing xi squad`);
  
  const newsUrls = [
    // CricketAddictor
    `https://cricketaddictor.com/?s=${searchQuery}`,
    // CricTracker
    `https://www.crictracker.com/?s=${searchQuery}`,
    // NDTV Sports
    `https://sports.ndtv.com/search?searchtext=${searchQuery}`,
    // India Today
    `https://www.indiatoday.in/search/${searchQuery}`,
    // ICC Official
    `https://www.icc-cricket.com/search?q=${searchQuery}`,
    // Cricket.com.au
    `https://www.cricket.com.au/search?query=${searchQuery}`,
    // Hindustan Times Cricket
    `https://www.hindustantimes.com/search?q=${searchQuery}`,
    // Times of India
    `https://timesofindia.indiatimes.com/topic/${teamASlug}-vs-${teamBSlug}`,
    // Sportskeeda
    `https://www.sportskeeda.com/go?q=${searchQuery}`,
  ];
  
  for (const url of newsUrls) {
    try {
      console.log(`[Cricket News Sites] Trying: ${url}`);
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      });
      
      if (!response.ok) continue;
      
      const html = await response.text();
      
      // Look for links to playing XI articles
      const playingXiLinks: string[] = [];
      const linkRegex = /href=["'](https?:\/\/[^"']+(?:playing.?xi|squad|line.?up|team.?sheet)[^"']*)["']/gi;
      let match;
      while ((match = linkRegex.exec(html)) !== null && playingXiLinks.length < 5) {
        if (!playingXiLinks.includes(match[1])) {
          playingXiLinks.push(match[1]);
        }
      }
      
      // Also check direct article links containing team names
      const articleRegex = /href=["'](https?:\/\/[^"']*(?:${teamASlug}|${teamBSlug})[^"']*(?:playing|squad|xi|lineup)[^"']*)["']/gi;
      while ((match = articleRegex.exec(html)) !== null && playingXiLinks.length < 8) {
        if (!playingXiLinks.includes(match[1])) {
          playingXiLinks.push(match[1]);
        }
      }
      
      // Visit found links
      for (const articleUrl of playingXiLinks) {
        try {
          const articleResponse = await fetch(articleUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            },
          });
          
          if (!articleResponse.ok) continue;
          
          const articleHtml = await articleResponse.text();
          const players = extractPlayersFromHtml(articleHtml);
          
          if (players.teamA.length >= 5 || players.teamB.length >= 5) {
            console.log(`[Cricket News Sites] Found ${players.teamA.length} + ${players.teamB.length} from ${articleUrl}`);
            return players;
          }
        } catch {
          // Continue to next link
        }
      }
      
      // Also try direct extraction from search page
      const players = extractPlayersFromHtml(html);
      if (players.teamA.length >= 5 || players.teamB.length >= 5) {
        console.log(`[Cricket News Sites] Found ${players.teamA.length} + ${players.teamB.length} from search page`);
        return players;
      }
      
    } catch (error) {
      console.log(`[Cricket News Sites] Error with ${url}: ${error}`);
    }
  }
  
  return null;
}

function matchContainsTeams(match: any, teamA: string, teamB: string): boolean {
  const matchStr = JSON.stringify(match).toLowerCase();
  const teamAWords = teamA.toLowerCase().split(' ');
  const teamBWords = teamB.toLowerCase().split(' ');
  
  const hasTeamA = teamAWords.some(word => word.length > 3 && matchStr.includes(word));
  const hasTeamB = teamBWords.some(word => word.length > 3 && matchStr.includes(word));
  
  return hasTeamA && hasTeamB;
}

function extractPlayersFromJson(data: any): { teamA: Player[], teamB: Player[] } {
  const teamA: Player[] = [];
  const teamB: Player[] = [];
  const allPlayers: Player[] = [];
  
  const extractFromObject = (obj: any, depth = 0) => {
    if (depth > 10 || !obj) return;
    
    if (typeof obj === 'string') {
      const player = parsePlayer(obj);
      if (player) allPlayers.push(player);
      return;
    }
    
    if (Array.isArray(obj)) {
      for (const item of obj) {
        extractFromObject(item, depth + 1);
      }
      return;
    }
    
    if (typeof obj === 'object') {
      // Check for player-like objects
      const playerKeys = ['name', 'fullName', 'playerName', 'batsman', 'bowler', 'fieldsman'];
      for (const key of playerKeys) {
        if (obj[key] && typeof obj[key] === 'string') {
          const player = parsePlayer(obj[key]);
          if (player) {
            if (obj.isCaptain || obj.captain) player.isCaptain = true;
            if (obj.isWicketKeeper || obj.keeper || obj.wicketkeeper) player.isWicketKeeper = true;
            allPlayers.push(player);
          }
        }
      }
      
      // Check for squad/players arrays
      const squadKeys = ['squad', 'players', 'playingXI', 'playing11', 'team', 'batting', 'bowling'];
      for (const key of squadKeys) {
        if (obj[key]) {
          extractFromObject(obj[key], depth + 1);
        }
      }
      
      // Recurse into other properties
      for (const key in obj) {
        if (typeof obj[key] === 'object') {
          extractFromObject(obj[key], depth + 1);
        }
      }
    }
  };
  
  extractFromObject(data);
  
  // Split players into two teams
  const uniquePlayers = allPlayers.filter((p, i, arr) => 
    arr.findIndex(x => x.name.toLowerCase() === p.name.toLowerCase()) === i
  );
  
  const half = Math.ceil(uniquePlayers.length / 2);
  teamA.push(...uniquePlayers.slice(0, Math.min(11, half)));
  teamB.push(...uniquePlayers.slice(half, half + 11));
  
  return { teamA, teamB };
}

function extractPlayersFromHtml(html: string): { teamA: Player[], teamB: Player[] } {
  const allPlayers: Player[] = [];
  
  // Pattern 1: Player links with data attributes
  const linkPatterns = [
    /<a[^>]*href="[^"]*player[^"]*"[^>]*>([^<]+)<\/a>/gi,
    /<a[^>]*href="[^"]*profile[^"]*"[^>]*>([^<]+)<\/a>/gi,
    /<a[^>]*class="[^"]*player[^"]*"[^>]*>([^<]+)<\/a>/gi,
  ];
  
  for (const pattern of linkPatterns) {
    let match;
    while ((match = pattern.exec(html)) !== null) {
      const player = parsePlayer(match[1]);
      if (player) allPlayers.push(player);
    }
  }
  
  // Pattern 2: Table cells with player names
  const cellPatterns = [
    /<td[^>]*class="[^"]*batsman[^"]*"[^>]*>([^<]+)</gi,
    /<td[^>]*class="[^"]*bowler[^"]*"[^>]*>([^<]+)</gi,
    /<td[^>]*class="[^"]*player[^"]*"[^>]*>([^<]+)</gi,
  ];
  
  for (const pattern of cellPatterns) {
    let match;
    while ((match = pattern.exec(html)) !== null) {
      const player = parsePlayer(match[1]);
      if (player) allPlayers.push(player);
    }
  }
  
  // Pattern 3: List items in squad sections
  const listPatterns = [
    /<li[^>]*class="[^"]*squad[^"]*"[^>]*>([^<]+)</gi,
    /<li[^>]*class="[^"]*player[^"]*"[^>]*>([^<]+)</gi,
    /<li[^>]*>([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)(?:\s*\([^)]+\))?<\/li>/gi,
  ];
  
  for (const pattern of listPatterns) {
    let match;
    while ((match = pattern.exec(html)) !== null) {
      const player = parsePlayer(match[1]);
      if (player) allPlayers.push(player);
    }
  }
  
  // Pattern 4: Span elements with player info
  const spanPatterns = [
    /<span[^>]*class="[^"]*name[^"]*"[^>]*>([^<]+)<\/span>/gi,
    /<span[^>]*class="[^"]*player[^"]*"[^>]*>([^<]+)<\/span>/gi,
  ];
  
  for (const pattern of spanPatterns) {
    let match;
    while ((match = pattern.exec(html)) !== null) {
      const player = parsePlayer(match[1]);
      if (player) allPlayers.push(player);
    }
  }
  
  // Pattern 5: JSON-LD structured data
  const jsonLdRegex = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  let jsonMatch;
  while ((jsonMatch = jsonLdRegex.exec(html)) !== null) {
    try {
      const jsonData = JSON.parse(jsonMatch[1]);
      const extracted = extractPlayersFromJson(jsonData);
      allPlayers.push(...extracted.teamA, ...extracted.teamB);
    } catch {
      // Invalid JSON, continue
    }
  }
  
  // Pattern 6: __NEXT_DATA__ or similar hydration data
  const nextDataRegex = /<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/gi;
  while ((jsonMatch = nextDataRegex.exec(html)) !== null) {
    try {
      const jsonData = JSON.parse(jsonMatch[1]);
      const extracted = extractPlayersFromJson(jsonData);
      allPlayers.push(...extracted.teamA, ...extracted.teamB);
    } catch {
      // Invalid JSON, continue
    }
  }
  
  // Pattern 7: Any JSON-like data in scripts
  const scriptRegex = /<script[^>]*>([\s\S]*?)<\/script>/gi;
  while ((jsonMatch = scriptRegex.exec(html)) !== null) {
    const scriptContent = jsonMatch[1];
    // Look for player arrays
    const playerArrayRegex = /\[[\s\S]*?"(?:name|playerName|fullName)"[\s\S]*?\]/g;
    let arrayMatch;
    while ((arrayMatch = playerArrayRegex.exec(scriptContent)) !== null) {
      try {
        const parsed = JSON.parse(arrayMatch[0]);
        const extracted = extractPlayersFromJson(parsed);
        allPlayers.push(...extracted.teamA, ...extracted.teamB);
      } catch {
        // Invalid JSON, continue
      }
    }
  }
  
  // Deduplicate
  const uniquePlayers = allPlayers.filter((p, i, arr) => 
    arr.findIndex(x => x.name.toLowerCase() === p.name.toLowerCase()) === i
  );
  
  // Split into two teams
  const half = Math.ceil(uniquePlayers.length / 2);
  const teamA = uniquePlayers.slice(0, Math.min(11, half));
  const teamB = uniquePlayers.slice(half, half + 11);
  
  return { teamA, teamB };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { matchId, cricbuzzMatchId, teamAId, teamBId, teamAName, teamBName } = await req.json();
    
    if (!matchId) {
      return new Response(
        JSON.stringify({ error: 'Match ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[Scrape Playing XI] Starting for match ${matchId}`);

    // Get match details
    const { data: match, error: matchError } = await supabase
      .from('matches')
      .select(`
        *,
        team_a:teams!matches_team_a_id_fkey(id, name, short_name),
        team_b:teams!matches_team_b_id_fkey(id, name, short_name)
      `)
      .eq('id', matchId)
      .single();

    if (matchError || !match) {
      return new Response(
        JSON.stringify({ error: 'Match not found', details: matchError }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const cbzId = cricbuzzMatchId || match.cricbuzz_match_id;
    const tAName = teamAName || match.team_a?.name || '';
    const tBName = teamBName || match.team_b?.name || '';
    const tAId = teamAId || match.team_a_id;
    const tBId = teamBId || match.team_b_id;

    console.log(`[Scrape Playing XI] Teams: ${tAName} vs ${tBName}, Cricbuzz ID: ${cbzId}`);

    let result: { teamA: Player[], teamB: Player[] } | null = null;

    // Try all sources in sequence - API Scores first (most reliable)
    const sources = [
      { name: 'API Scores (Database)', fn: () => fetchFromApiScores(supabase, matchId, tAName, tBName) },
      { name: 'Cricbuzz Mobile API', fn: () => cbzId ? fetchFromCricbuzzMobileAPI(cbzId) : null },
      { name: 'Cricbuzz HTML', fn: () => cbzId ? fetchFromCricbuzzHtml(cbzId) : null },
      { name: 'ESPN Web', fn: () => fetchFromESPNWeb(tAName, tBName) },
      { name: 'Cricket News Sites', fn: () => fetchFromCricketNewsSites(tAName, tBName) },
      { name: 'Free Cricket APIs', fn: () => fetchFromFreeCricketAPIs(tAName, tBName) },
      { name: 'Squad Pages', fn: () => fetchFromSquadPages(tAName, tBName) },
      { name: 'Google Search', fn: () => fetchViaGoogleSearch(tAName, tBName) },
    ];

    for (const source of sources) {
      console.log(`[Scrape Playing XI] Trying ${source.name}...`);
      try {
        result = await source.fn();
        if (result && (result.teamA.length >= 5 || result.teamB.length >= 5)) {
          console.log(`[Scrape Playing XI] Success with ${source.name}: ${result.teamA.length} + ${result.teamB.length} players`);
          break;
        }
      } catch (error) {
        console.log(`[Scrape Playing XI] ${source.name} failed: ${error}`);
      }
    }

    if (!result || (result.teamA.length < 3 && result.teamB.length < 3)) {
      return new Response(
        JSON.stringify({ 
          error: 'Could not find Playing XI from any source',
          triedSources: sources.map(s => s.name),
          suggestion: 'Please use Bulk Add feature to manually enter players'
        }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Delete existing players
    await supabase
      .from('match_playing_xi')
      .delete()
      .eq('match_id', matchId);

    // Insert new players
    const playersToInsert = [
      ...result.teamA.map((p, i) => ({
        match_id: matchId,
        team_id: tAId,
        player_name: p.name,
        is_captain: p.isCaptain,
        is_wicket_keeper: p.isWicketKeeper,
        batting_order: i + 1,
        player_role: p.role || null,
      })),
      ...result.teamB.map((p, i) => ({
        match_id: matchId,
        team_id: tBId,
        player_name: p.name,
        is_captain: p.isCaptain,
        is_wicket_keeper: p.isWicketKeeper,
        batting_order: i + 1,
        player_role: p.role || null,
      })),
    ];

    const { error: insertError } = await supabase
      .from('match_playing_xi')
      .insert(playersToInsert);

    if (insertError) {
      console.error('[Scrape Playing XI] Insert error:', insertError);
      return new Response(
        JSON.stringify({ error: 'Failed to save players', details: insertError }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[Scrape Playing XI] Successfully saved ${playersToInsert.length} players`);

    return new Response(
      JSON.stringify({
        success: true,
        teamA: result.teamA,
        teamB: result.teamB,
        totalPlayers: playersToInsert.length,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[Scrape Playing XI] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
