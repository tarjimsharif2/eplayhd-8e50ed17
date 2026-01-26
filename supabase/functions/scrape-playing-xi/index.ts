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
    .replace(/,\s*$/, '') // Remove trailing comma
    .replace(/\s+/g, ' ')
    .trim();
}

function isValidPlayerName(name: string): boolean {
  const cleaned = cleanPlayerName(name);
  if (!cleaned || cleaned.length < 3 || cleaned.length > 50) return false;
  
  // Reject URLs
  if (/^https?:\/\//i.test(cleaned)) return false;
  
  // Reject common non-player patterns - EXPANDED LIST
  const invalidPatterns = [
    // Generic terms
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
    
    // Fantasy/Dream11/Prediction garbage - NEW
    /dream\s*11/i,
    /fantasy/i,
    /prediction/i,
    /^cricket\s*(news|addictor|tracker|times)/i,
    /^match\s*prediction/i,
    /^(icc|bcci|odi|test|t20|wc|ipl|bpl|psl|cpl|bbl|wpl)?\s*(mens?|womens?)?\s*rankings?$/i,
    /tips?$/i,
    /^[a-z]+\s+vs\s+[a-z]+$/i, // "India vs Australia" patterns
    /^(today|tomorrow|yesterday)/i,
    /^(best|top|winning|perfect)\s/i,
    /pitch\s*report/i,
    /injury\s*(update|news)/i,
    /weather\s*(update|report|forecast)/i,
    /head\s*to\s*head/i,
    /captain(cy)?/i,
    /vice\s*captain/i,
    /^(vc|c)\s*choice/i,
    /^squad\s*(list|update)/i,
    /probable\s*(xi|11)/i,
    /expected\s*(xi|11)/i,
    
    // Common website noise
    /^(author|editor|reporter|correspondent|staff|writer|admin)$/i,
    /^(published|updated|posted|modified)\s/i,
    /^(share|comment|like|follow|tweet|post)$/i,
    /copyright/i,
    /all\s*rights?\s*reserved/i,
    /^(related|recommended|popular|trending|featured)/i,
    /^(advertisement|sponsored|promo)/i,
    
    // Team name patterns (not player names)
    /^(india|australia|england|pakistan|bangladesh|sri\s*lanka|new\s*zealand|south\s*africa|west\s*indies|afghanistan|ireland|zimbabwe|nepal|scotland|netherlands|oman|uae|usa|canada)\s*(u19|under.?19|women|womens|men|mens)?$/i,
    /^[a-z]+\s*(royal|kings|capitals|riders|warriors|titans|giants|super|challengers|sunrisers|knights|strikers|daredevils|legends)/i,
    
    // Article/content patterns
    /^(breaking|exclusive|just\s*in|update|alert|flash)/i,
    /^(key|main|important|crucial|vital)\s*(player|match|game)/i,
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
  
  // Additional validation: Check for common non-name words - EXPANDED
  const lowerCleaned = cleaned.toLowerCase();
  const garbageWords = [
    'cricket', 'dream11', 'fantasy', 'prediction', 'tips', 'news', 'update', 
    'report', 'ranking', 'rankings', 'match', 'today', 'tomorrow', 'live', 
    'score', 'scores', 'addictor', 'tracker', 'premium', 'editorials', 
    'editorial', 'videos', 'video', 'photos', 'photo', 'ads', 'advertisement',
    'bhogle', 'harsha', 'sanjay', 'manjrekar', 'commentator', 'commentary',
    'championship', 'tournament', 'series', 'league', 'cup', 'trophy',
    'cricbuzz', 'espn', 'espncricinfo', 'cricinfo', 'wisden', 'icc',
    'tv', 'streaming', 'broadcast', 'channel', 'highlights', 'replay',
    'subscribe', 'download', 'app', 'website', 'official', 'exclusive'
  ];
  for (const word of garbageWords) {
    if (lowerCleaned.includes(word)) return false;
  }
  
  // Reject if name ends with comma (indicates incomplete parsing)
  if (cleaned.endsWith(',')) return false;
  
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

// Source 2: Cricbuzz HTML Scorecard with dedicated Playing XI parsing
async function fetchFromCricbuzzHtml(cricbuzzId: string): Promise<{ teamA: Player[], teamB: Player[] } | null> {
  console.log(`[Cricbuzz HTML] Trying match ID: ${cricbuzzId}`);
  
  // Try squads page first - most reliable for playing XI
  const squadUrl = `https://www.cricbuzz.com/cricket-match-squads/${cricbuzzId}/match`;
  
  try {
    console.log(`[Cricbuzz HTML] Fetching squad page: ${squadUrl}`);
    const response = await fetch(squadUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });
    
    if (response.ok) {
      const html = await response.text();
      const result = extractCricbuzzSquad(html);
      if (result && result.teamA.length === 11 && result.teamB.length === 11) {
        console.log(`[Cricbuzz HTML] Found full squad: ${result.teamA.length} + ${result.teamB.length} players`);
        return result;
      }
    }
  } catch (error) {
    console.log(`[Cricbuzz HTML] Squad page error: ${error}`);
  }
  
  // Try scorecard pages
  const urls = [
    `https://www.cricbuzz.com/api/html/cricket-scorecard/${cricbuzzId}`,
    `https://www.cricbuzz.com/live-cricket-scorecard/${cricbuzzId}/match`,
    `https://m.cricbuzz.com/live-cricket-scorecard/${cricbuzzId}/match`,
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
      const players = extractCricbuzzScorecard(html);
      if (players.teamA.length >= 8 || players.teamB.length >= 8) {
        console.log(`[Cricbuzz HTML] Found ${players.teamA.length} + ${players.teamB.length} players from scorecard`);
        return players;
      }
    } catch (error) {
      console.log(`[Cricbuzz HTML] Error: ${error}`);
    }
  }
  
  return null;
}

// Dedicated Cricbuzz squad page parser
function extractCricbuzzSquad(html: string): { teamA: Player[], teamB: Player[] } | null {
  const teamA: Player[] = [];
  const teamB: Player[] = [];
  
  // Look for Playing XI sections
  // Cricbuzz typically has "Playing XI" header followed by player list
  const playingXiSections = html.split(/playing\s*xi|playing\s*11/i);
  
  if (playingXiSections.length < 2) {
    console.log(`[Cricbuzz Squad] No Playing XI sections found`);
    return null;
  }
  
  // Extract player names from each section
  for (let i = 1; i < playingXiSections.length && i <= 2; i++) {
    const section = playingXiSections[i].substring(0, 3000); // Limit to relevant part
    const players = extractPlayersFromSection(section);
    
    if (i === 1 && players.length >= 11) {
      teamA.push(...players.slice(0, 11));
    } else if (i === 2 && players.length >= 11) {
      teamB.push(...players.slice(0, 11));
    }
  }
  
  if (teamA.length === 11 && teamB.length === 11) {
    return { teamA, teamB };
  }
  
  return null;
}

// Extract players from Cricbuzz scorecard HTML
function extractCricbuzzScorecard(html: string): { teamA: Player[], teamB: Player[] } {
  const teamA: Player[] = [];
  const teamB: Player[] = [];
  const seenNames = new Set<string>();
  
  // Pattern for player links in scorecard
  // Cricbuzz uses: <a class="cb-text-link" href="/profiles/...">Player Name</a>
  const playerLinkPattern = /<a[^>]*href="\/profiles\/\d+\/[^"]*"[^>]*>([^<]+)<\/a>/gi;
  
  let match;
  let isFirstTeam = true;
  let playerCount = 0;
  
  while ((match = playerLinkPattern.exec(html)) !== null) {
    const name = match[1].trim();
    const player = parsePlayerStrict(name);
    
    if (player && !seenNames.has(player.name.toLowerCase())) {
      seenNames.add(player.name.toLowerCase());
      
      if (isFirstTeam && teamA.length < 11) {
        teamA.push(player);
      } else if (!isFirstTeam && teamB.length < 11) {
        teamB.push(player);
      } else if (teamA.length === 11 && teamB.length < 11) {
        isFirstTeam = false;
        teamB.push(player);
      }
      
      playerCount++;
      // After finding 11 players, switch to second team
      if (playerCount === 11) {
        isFirstTeam = false;
      }
    }
  }
  
  // Also try batsman/bowler cells
  const batsmanPattern = /<a[^>]*class="[^"]*cb-text-link[^"]*"[^>]*>([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/gi;
  
  while ((match = batsmanPattern.exec(html)) !== null) {
    const name = match[1].trim();
    const player = parsePlayerStrict(name);
    
    if (player && !seenNames.has(player.name.toLowerCase())) {
      seenNames.add(player.name.toLowerCase());
      
      if (teamA.length < 11) {
        teamA.push(player);
      } else if (teamB.length < 11) {
        teamB.push(player);
      }
    }
  }
  
  return { teamA, teamB };
}

// Extract players from a section of HTML
function extractPlayersFromSection(section: string): Player[] {
  const players: Player[] = [];
  const seenNames = new Set<string>();
  
  // Multiple patterns to find player names
  const patterns = [
    // Player profile links
    /<a[^>]*href="[^"]*profiles?[^"]*"[^>]*>([^<]+)<\/a>/gi,
    // Player names in specific classes
    /<[^>]*class="[^"]*(?:player|batsman|bowler|cb-player)[^"]*"[^>]*>([^<]+)</gi,
    // Names in divs/spans following specific patterns
    /<(?:span|div)[^>]*>([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})\s*(?:\(c\)|\(wk\))?<\/(?:span|div)>/gi,
  ];
  
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(section)) !== null) {
      const name = match[1].trim();
      const player = parsePlayerStrict(name);
      
      if (player && !seenNames.has(player.name.toLowerCase()) && players.length < 15) {
        seenNames.add(player.name.toLowerCase());
        players.push(player);
      }
    }
  }
  
  return players;
}

// Strict player name parser - rejects anything suspicious
function parsePlayerStrict(text: string): Player | null {
  if (!text || typeof text !== 'string') return null;
  
  const cleaned = text
    .replace(/\s*\(c\)\s*/gi, '')
    .replace(/\s*\(wk\)\s*/gi, '')
    .replace(/\s*\(c & wk\)\s*/gi, '')
    .replace(/,\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
  
  if (!cleaned || cleaned.length < 4 || cleaned.length > 40) return null;
  
  // Must have at least 2 words
  const words = cleaned.split(' ').filter(w => w.length >= 2);
  if (words.length < 2) return null;
  
  // Must start with uppercase letter
  if (!/^[A-Z]/.test(cleaned)) return null;
  
  // Each word should start with uppercase (proper name format)
  for (const word of words) {
    if (!/^[A-Z]/.test(word) && word.length > 2) return null;
  }
  
  // Reject common garbage patterns
  const garbage = [
    /cricket/i, /dream/i, /fantasy/i, /prediction/i, /news/i,
    /video/i, /photo/i, /highlight/i, /premium/i, /editorial/i,
    /ranking/i, /championship/i, /tournament/i, /series/i,
    /bhogle/i, /manjrekar/i, /commentat/i, /tv\s*ads/i,
    /subscribe/i, /download/i, /official/i, /exclusive/i,
    /^\d+$/, /^vs$/i, /\d{4}/, /^all\s/i, /^icc\s/i,
    /live\s*score/i, /match\s*preview/i, /squad\s*update/i,
  ];
  
  for (const pattern of garbage) {
    if (pattern.test(cleaned)) return null;
  }
  
  // Check for (c) and (wk) markers in original
  const isCaptain = /\(c\)/i.test(text);
  const isWicketKeeper = /\(wk\)/i.test(text);
  
  return { name: cleaned, isCaptain, isWicketKeeper };
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

// Source 8: Cricbuzz RapidAPI - Commentary/Match Details (has Playing XI in commentary)
async function fetchFromCricbuzzRapidAPI(supabase: any, cricbuzzId: string, teamAName: string, teamBName: string): Promise<{ teamA: Player[], teamB: Player[] } | null> {
  console.log(`[Cricbuzz RapidAPI] Trying match ID: ${cricbuzzId}`);
  
  try {
    // Get RapidAPI key and endpoints from site_settings
    const { data: settings, error } = await supabase
      .from('site_settings')
      .select('rapidapi_key, rapidapi_enabled, rapidapi_endpoints')
      .limit(1)
      .maybeSingle();
    
    if (error || !settings?.rapidapi_enabled || !settings?.rapidapi_key) {
      console.log(`[Cricbuzz RapidAPI] RapidAPI not enabled or key not configured`);
      return null;
    }
    
    const rapidApiKey = settings.rapidapi_key;
    const endpointConfig = settings.rapidapi_endpoints || {};
    const cricbuzzHost = endpointConfig.cricbuzz_host || 'cricbuzz-cricket.p.rapidapi.com';
    
    const teamA: Player[] = [];
    const teamB: Player[] = [];
    const seenNames = new Set<string>();
    
    // Build endpoints from configuration
    const matchInfoPath = (endpointConfig.match_info_endpoint || '/mcenter/v1/{match_id}').replace('{match_id}', cricbuzzId);
    const commPath = (endpointConfig.match_commentary_endpoint || '/mcenter/v1/{match_id}/comm').replace('{match_id}', cricbuzzId);
    const squadPath = (endpointConfig.squad_endpoint || '/mcenter/v1/{match_id}/hsquad').replace('{match_id}', cricbuzzId);
    const team1Path = (endpointConfig.team_squad_endpoint || '/mcenter/v1/{match_id}/team/{team_num}').replace('{match_id}', cricbuzzId).replace('{team_num}', '1');
    const team2Path = (endpointConfig.team_squad_endpoint || '/mcenter/v1/{match_id}/team/{team_num}').replace('{match_id}', cricbuzzId).replace('{team_num}', '2');
    
    // Try multiple endpoints that may have Playing XI data
    const endpoints = [
      `https://${cricbuzzHost}${matchInfoPath}`,
      `https://${cricbuzzHost}${commPath}`,
      `https://${cricbuzzHost}${squadPath}`,
      `https://${cricbuzzHost}${team1Path}`,
      `https://${cricbuzzHost}${team2Path}`,
    ];
    
    for (const endpoint of endpoints) {
      if (teamA.length === 11 && teamB.length === 11) break;
      
      try {
        console.log(`[Cricbuzz RapidAPI] Fetching: ${endpoint}`);
        const response = await fetch(endpoint, {
          method: 'GET',
          headers: {
            'x-rapidapi-host': cricbuzzHost,
            'x-rapidapi-key': rapidApiKey,
          },
        });
        
        if (!response.ok) {
          console.log(`[Cricbuzz RapidAPI] ${endpoint} returned ${response.status}`);
          continue;
        }
        
        const text = await response.text();
        if (!text || text.trim() === '') continue;
        
        const data = JSON.parse(text);
        
        // Extract players from hsquad endpoint
        if (data.team1?.players || data.team2?.players) {
          const t1Players = data.team1?.players || [];
          const t2Players = data.team2?.players || [];
          
          for (const p of t1Players) {
            if (teamA.length >= 11) break;
            const name = p.name || p.fullName || p.nickName || '';
            if (name && !seenNames.has(name.toLowerCase()) && isValidPlayerName(name)) {
              seenNames.add(name.toLowerCase());
              teamA.push({
                name: cleanPlayerName(name),
                isCaptain: p.captain === true || p.isCaptain === true,
                isWicketKeeper: p.keeper === true || p.isKeeper === true || p.role?.toLowerCase().includes('keeper'),
                role: p.role,
              });
            }
          }
          
          for (const p of t2Players) {
            if (teamB.length >= 11) break;
            const name = p.name || p.fullName || p.nickName || '';
            if (name && !seenNames.has(name.toLowerCase()) && isValidPlayerName(name)) {
              seenNames.add(name.toLowerCase());
              teamB.push({
                name: cleanPlayerName(name),
                isCaptain: p.captain === true || p.isCaptain === true,
                isWicketKeeper: p.keeper === true || p.isKeeper === true || p.role?.toLowerCase().includes('keeper'),
                role: p.role,
              });
            }
          }
          
          console.log(`[Cricbuzz RapidAPI] hsquad found ${teamA.length} + ${teamB.length} players`);
        }
        
        // From team endpoint
        if (data.players?.squad) {
          const squadPlayers = data.players.squad || [];
          const targetTeam = endpoint.includes('/team/1') ? teamA : teamB;
          
          for (const p of squadPlayers) {
            if (targetTeam.length >= 11) break;
            const name = p.name || p.fullName || p.nickName || '';
            if (name && !seenNames.has(name.toLowerCase()) && isValidPlayerName(name)) {
              seenNames.add(name.toLowerCase());
              targetTeam.push({
                name: cleanPlayerName(name),
                isCaptain: p.captain === true || p.isCaptain === true,
                isWicketKeeper: p.keeper === true || p.isKeeper === true,
                role: p.role,
              });
            }
          }
        }
        
      } catch (err) {
        console.log(`[Cricbuzz RapidAPI] Error with ${endpoint}: ${err}`);
      }
    }
    
    console.log(`[Cricbuzz RapidAPI] Total found: ${teamA.length} + ${teamB.length} players`);
    
    if (teamA.length >= 5 || teamB.length >= 5) {
      return { teamA: teamA.slice(0, 11), teamB: teamB.slice(0, 11) };
    }
    
    return null;
  } catch (error) {
    console.log(`[Cricbuzz RapidAPI] Error: ${error}`);
    return null;
  }
}

// Source 9: Cricketapi Live RapidAPI - Live match data with squad info
async function fetchFromCricketapiLive(supabase: any, teamAName: string, teamBName: string): Promise<{ teamA: Player[], teamB: Player[] } | null> {
  console.log(`[Cricketapi Live] Searching for ${teamAName} vs ${teamBName}`);
  
  try {
    // Get RapidAPI key and endpoints from site_settings
    const { data: settings, error } = await supabase
      .from('site_settings')
      .select('rapidapi_key, rapidapi_enabled, rapidapi_endpoints')
      .limit(1)
      .maybeSingle();
    
    if (error || !settings?.rapidapi_enabled || !settings?.rapidapi_key) {
      console.log(`[Cricketapi Live] RapidAPI not enabled or key not configured`);
      return null;
    }
    
    const rapidApiKey = settings.rapidapi_key;
    const endpointConfig = settings.rapidapi_endpoints || {};
    const cricketapiHost = endpointConfig.cricketapi_live_host || 'cricketapi-live.p.rapidapi.com';
    const liveMatchesPath = endpointConfig.live_matches_endpoint || '/matches/live';
    const matchSquadPath = endpointConfig.match_squad_endpoint || '/match/{match_id}/squad';
    
    // Fetch live matches
    console.log(`[Cricketapi Live] Fetching live matches...`);
    const liveResponse = await fetch(`https://${cricketapiHost}${liveMatchesPath}`, {
      method: 'GET',
      headers: {
        'x-rapidapi-host': cricketapiHost,
        'x-rapidapi-key': rapidApiKey,
      },
    });
    
    if (!liveResponse.ok) {
      console.log(`[Cricketapi Live] Live matches returned ${liveResponse.status}`);
      return null;
    }
    
    const liveData = await liveResponse.json();
    console.log(`[Cricketapi Live] Got ${liveData?.matches?.length || 0} live matches`);
    
    if (!liveData?.matches || !Array.isArray(liveData.matches)) {
      return null;
    }
    
    // Normalize team names for matching
    const normalizeForMatch = (name: string) => {
      return name.toLowerCase()
        .replace(/u19|under.?19|u-19/gi, 'u19')
        .replace(/\s+/g, '')
        .replace(/[^a-z0-9]/g, '');
    };
    
    const teamANorm = normalizeForMatch(teamAName);
    const teamBNorm = normalizeForMatch(teamBName);
    
    // Find matching match
    let targetMatch: any = null;
    for (const match of liveData.matches) {
      const team1Name = normalizeForMatch(match.team1?.teamName || match.team1?.name || '');
      const team2Name = normalizeForMatch(match.team2?.teamName || match.team2?.name || '');
      const team1Short = normalizeForMatch(match.team1?.teamSName || match.team1?.shortName || '');
      const team2Short = normalizeForMatch(match.team2?.teamSName || match.team2?.shortName || '');
      
      const hasTeamA = team1Name.includes(teamANorm) || teamANorm.includes(team1Name) ||
                       team2Name.includes(teamANorm) || teamANorm.includes(team2Name) ||
                       team1Short.includes(teamANorm.substring(0, 4)) || 
                       team2Short.includes(teamANorm.substring(0, 4));
      
      const hasTeamB = team1Name.includes(teamBNorm) || teamBNorm.includes(team1Name) ||
                       team2Name.includes(teamBNorm) || teamBNorm.includes(team2Name) ||
                       team1Short.includes(teamBNorm.substring(0, 4)) || 
                       team2Short.includes(teamBNorm.substring(0, 4));
      
      if (hasTeamA && hasTeamB) {
        console.log(`[Cricketapi Live] Found matching match: ${match.team1?.teamName} vs ${match.team2?.teamName}`);
        targetMatch = match;
        break;
      }
    }
    
    if (!targetMatch) {
      console.log(`[Cricketapi Live] No matching match found`);
      return null;
    }
    
    // Get match ID and fetch squad data
    const matchId = targetMatch.id || targetMatch.matchId;
    if (!matchId) {
      console.log(`[Cricketapi Live] No match ID found`);
      return null;
    }
    
    // Build squad endpoints from configuration
    const squadPath = matchSquadPath.replace('{match_id}', matchId);
    const scorecardPath = `/match/${matchId}/scorecard`;
    const matchDetailPath = `/match/${matchId}`;
    
    // Try to get squad/playing XI from various endpoints
    const squadEndpoints = [
      `https://${cricketapiHost}${squadPath}`,
      `https://${cricketapiHost}${scorecardPath}`,
      `https://${cricketapiHost}${matchDetailPath}`,
    ];
    
    const teamA: Player[] = [];
    const teamB: Player[] = [];
    const seenNames = new Set<string>();
    
    for (const endpoint of squadEndpoints) {
      if (teamA.length === 11 && teamB.length === 11) break;
      
      try {
        console.log(`[Cricketapi Live] Fetching: ${endpoint}`);
        const response = await fetch(endpoint, {
          method: 'GET',
          headers: {
            'x-rapidapi-host': cricketapiHost,
            'x-rapidapi-key': rapidApiKey,
          },
        });
        
        if (!response.ok) {
          console.log(`[Cricketapi Live] ${endpoint} returned ${response.status}`);
          continue;
        }
        
        const data = await response.json();
        console.log(`[Cricketapi Live] Endpoint data keys: ${Object.keys(data || {}).join(', ')}`);
        
        // Extract from squad/players arrays
        const extractPlayers = (playersArray: any[], targetTeamArray: Player[], maxPlayers = 11) => {
          if (!Array.isArray(playersArray)) return;
          
          for (const p of playersArray) {
            if (targetTeamArray.length >= maxPlayers) break;
            const name = p.name || p.playerName || p.fullName || p.batsman || p.bowler || '';
            if (name && !seenNames.has(name.toLowerCase()) && isValidPlayerName(name)) {
              seenNames.add(name.toLowerCase());
              targetTeamArray.push({
                name: cleanPlayerName(name),
                isCaptain: p.isCaptain === true || p.captain === true || /\(c\)/i.test(name),
                isWicketKeeper: p.isKeeper === true || p.keeper === true || /\(wk\)/i.test(name),
                role: p.role || p.playerRole,
              });
            }
          }
        };
        
        // Try different data structures
        if (data.team1?.players) extractPlayers(data.team1.players, teamA);
        if (data.team2?.players) extractPlayers(data.team2.players, teamB);
        if (data.team1?.squad) extractPlayers(data.team1.squad, teamA);
        if (data.team2?.squad) extractPlayers(data.team2.squad, teamB);
        if (data.team1?.playingXI) extractPlayers(data.team1.playingXI, teamA);
        if (data.team2?.playingXI) extractPlayers(data.team2.playingXI, teamB);
        
        // From scorecard batting/bowling arrays
        if (data.scorecard) {
          const scorecards = Array.isArray(data.scorecard) ? data.scorecard : [data.scorecard];
          for (const sc of scorecards) {
            if (sc.batting) extractPlayers(sc.batting, teamA.length < 11 ? teamA : teamB);
            if (sc.bowling) extractPlayers(sc.bowling, teamB.length < 11 ? teamB : teamA);
          }
        }
        
        // From innings data
        if (data.innings) {
          const inningsArr = Array.isArray(data.innings) ? data.innings : [data.innings];
          for (let i = 0; i < inningsArr.length; i++) {
            const inn = inningsArr[i];
            const target = i % 2 === 0 ? teamA : teamB;
            if (inn.batsmen) extractPlayers(inn.batsmen, target);
            if (inn.bowlers) extractPlayers(inn.bowlers, i % 2 === 0 ? teamB : teamA);
          }
        }
        
      } catch (err) {
        console.log(`[Cricketapi Live] Error with ${endpoint}: ${err}`);
      }
    }
    
    console.log(`[Cricketapi Live] Total found: ${teamA.length} + ${teamB.length} players`);
    
    if (teamA.length >= 5 || teamB.length >= 5) {
      return { teamA: teamA.slice(0, 11), teamB: teamB.slice(0, 11) };
    }
    
    return null;
  } catch (error) {
    console.log(`[Cricketapi Live] Error: ${error}`);
    return null;
  }
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
    const sourceResults: { name: string; teamA: number; teamB: number }[] = [];

    // Try all sources in sequence - API Scores first (most reliable)
    const sources = [
      { name: 'API Scores (Database)', fn: () => fetchFromApiScores(supabase, matchId, tAName, tBName) },
      { name: 'Cricketapi Live RapidAPI', fn: () => fetchFromCricketapiLive(supabase, tAName, tBName) },
      { name: 'Cricbuzz RapidAPI', fn: () => cbzId ? fetchFromCricbuzzRapidAPI(supabase, cbzId, tAName, tBName) : null },
      { name: 'Cricbuzz Mobile API', fn: () => cbzId ? fetchFromCricbuzzMobileAPI(cbzId) : null },
      { name: 'Cricbuzz HTML', fn: () => cbzId ? fetchFromCricbuzzHtml(cbzId) : null },
      { name: 'ESPN Web', fn: () => fetchFromESPNWeb(tAName, tBName) },
      { name: 'Cricket News Sites', fn: () => fetchFromCricketNewsSites(tAName, tBName) },
      { name: 'Free Cricket APIs', fn: () => fetchFromFreeCricketAPIs(tAName, tBName) },
      { name: 'Squad Pages', fn: () => fetchFromSquadPages(tAName, tBName) },
      { name: 'Google Search', fn: () => fetchViaGoogleSearch(tAName, tBName) },
    ];

    // STRICT MODE: Only accept if we get exactly 11+11 players
    for (const source of sources) {
      console.log(`[Scrape Playing XI] Trying ${source.name}...`);
      try {
        const tempResult = await source.fn();
        if (tempResult) {
          console.log(`[Scrape Playing XI] ${source.name} found: ${tempResult.teamA.length} + ${tempResult.teamB.length} players`);
          sourceResults.push({ name: source.name, teamA: tempResult.teamA.length, teamB: tempResult.teamB.length });
          
          // Only accept if BOTH teams have exactly 11 players
          if (tempResult.teamA.length === 11 && tempResult.teamB.length === 11) {
            result = tempResult;
            console.log(`[Scrape Playing XI] ✅ Full 11+11 found with ${source.name}`);
            break;
          } else {
            console.log(`[Scrape Playing XI] ❌ Rejected ${source.name} - need exactly 11+11 players`);
          }
        }
      } catch (error) {
        console.log(`[Scrape Playing XI] ${source.name} failed: ${error}`);
      }
    }

    if (!result || result.teamA.length !== 11 || result.teamB.length !== 11) {
      // Find best partial result for reporting
      const bestResult = sourceResults.reduce((best, curr) => {
        const currTotal = curr.teamA + curr.teamB;
        const bestTotal = best ? best.teamA + best.teamB : 0;
        return currTotal > bestTotal ? curr : best;
      }, null as { name: string; teamA: number; teamB: number } | null);
      
      return new Response(
        JSON.stringify({ 
          error: 'সম্পূর্ণ ১১+১১ প্লেয়ার পাওয়া যায়নি',
          message: bestResult 
            ? `সর্বোচ্চ ${bestResult.teamA} + ${bestResult.teamB} প্লেয়ার পাওয়া গেছে (${bestResult.name} থেকে)`
            : 'কোনো source থেকে প্লেয়ার পাওয়া যায়নি',
          sourceResults,
          suggestion: 'Playing XI এখনো announce হয়নি অথবা Bulk Add ব্যবহার করুন'
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
