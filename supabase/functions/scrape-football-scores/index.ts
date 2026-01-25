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
  homeGoals?: GoalEvent[];
  awayGoals?: GoalEvent[];
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
async function fetchESPNScores(league: string = 'epl'): Promise<FootballMatch[]> {
  const matches: FootballMatch[] = [];
  const leagueCode = ESPN_LEAGUES[league as keyof typeof ESPN_LEAGUES] || league;
  
  try {
    const apiUrl = `https://site.api.espn.com/apis/site/v2/sports/soccer/${leagueCode}/scoreboard`;
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
    console.log(`ESPN API returned ${data.events?.length || 0} events`);
    
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
      
      // Also try to get scorers from linescores if details not available
      if (homeGoals.length === 0 && awayGoals.length === 0) {
        // Check scorer info from headlines/notes
        const headlines = competition.headlines || [];
        for (const headline of headlines) {
          if (headline.type === 'Key Plays' || headline.type === 'Recap') {
            // Parse scorer names from headline description
            const description = headline.shortLinkText || headline.description || '';
            console.log(`Match headline: ${description}`);
          }
        }
      }
      
      matches.push({
        homeTeam: homeTeam.team?.displayName || homeTeam.team?.name || 'Unknown',
        awayTeam: awayTeam.team?.displayName || awayTeam.team?.name || 'Unknown',
        homeScore: homeTeam.score?.toString() || null,
        awayScore: awayTeam.score?.toString() || null,
        status,
        minute,
        competition: data.leagues?.[0]?.name || event.name || null,
        matchUrl: event.links?.[0]?.href || null,
        startTime: event.date || null,
        homeGoals: homeGoals.length > 0 ? homeGoals : undefined,
        awayGoals: awayGoals.length > 0 ? awayGoals : undefined,
      });
    }
    
  } catch (error) {
    console.error('ESPN API error:', error);
  }
  
  return matches;
}

// Fetch all major leagues at once
async function fetchAllLeagues(): Promise<FootballMatch[]> {
  const allMatches: FootballMatch[] = [];
  const leaguesToFetch = ['epl', 'laliga', 'bundesliga', 'seriea', 'ligue1', 'ucl'];
  
  const promises = leaguesToFetch.map(league => fetchESPNScores(league));
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
    const { url, league, allLeagues, matchId } = body;

    console.log(`Football scores request - league: ${league}, allLeagues: ${allLeagues}, url: ${url}`);

    let matches: FootballMatch[] = [];

    // Option 1: Fetch all major leagues
    if (allLeagues) {
      console.log('Fetching all major leagues...');
      matches = await fetchAllLeagues();
    }
    // Option 2: Fetch specific league from ESPN
    else if (league) {
      console.log(`Fetching league: ${league}`);
      matches = await fetchESPNScores(league);
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
      matches = await fetchESPNScores('epl');
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
