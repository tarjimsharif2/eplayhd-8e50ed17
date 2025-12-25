import { useQuery } from '@tanstack/react-query';

const CRICKET_API_KEY = 'abd0d45e-09e6-4d37-b0b1-88e0b553901e';
const API_BASE_URL = 'https://api.cricapi.com/v1';

export interface CricketScore {
  r: number;  // runs
  w: number;  // wickets
  o: number;  // overs
  inning: string;
}

export interface CricketMatch {
  id: string;
  name: string;
  matchType: string;
  status: string;
  venue: string;
  date: string;
  dateTimeGMT: string;
  teams: string[];
  score: CricketScore[];
  series_id: string;
  fantasyEnabled: boolean;
  bbbEnabled: boolean;
  hasSquad: boolean;
  matchStarted: boolean;
  matchEnded: boolean;
}

export interface CricketAPIResponse {
  apikey: string;
  data: CricketMatch[];
  status: string;
  info: {
    hitsToday: number;
    hitsLimit: number;
    credits: number;
    server: number;
    offsetRows: number;
    totalRows: number;
    queryTime: number;
  };
}

// Find best matching match from API based on team names
export const findMatchingMatch = (
  apiMatches: CricketMatch[],
  teamAName: string,
  teamBName: string
): CricketMatch | null => {
  if (!apiMatches || apiMatches.length === 0) return null;
  
  const normalizeTeamName = (name: string) => name.toLowerCase().replace(/[^a-z]/g, '');
  
  const teamANormalized = normalizeTeamName(teamAName);
  const teamBNormalized = normalizeTeamName(teamBName);
  
  for (const match of apiMatches) {
    if (!match.teams || match.teams.length < 2) continue;
    
    const apiTeam1 = normalizeTeamName(match.teams[0]);
    const apiTeam2 = normalizeTeamName(match.teams[1]);
    
    // Check if both teams match (in any order)
    const team1Match = apiTeam1.includes(teamANormalized) || teamANormalized.includes(apiTeam1) ||
                       apiTeam1.includes(teamBNormalized) || teamBNormalized.includes(apiTeam1);
    const team2Match = apiTeam2.includes(teamANormalized) || teamANormalized.includes(apiTeam2) ||
                       apiTeam2.includes(teamBNormalized) || teamBNormalized.includes(apiTeam2);
    
    if (team1Match && team2Match) {
      return match;
    }
  }
  
  return null;
};

export const useLiveCricketScore = (teamAName: string, teamBName: string, enabled: boolean = true) => {
  return useQuery({
    queryKey: ['cricketScore', teamAName, teamBName],
    queryFn: async () => {
      const response = await fetch(`${API_BASE_URL}/currentMatches?apikey=${CRICKET_API_KEY}&offset=0`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch cricket scores');
      }
      
      const data: CricketAPIResponse = await response.json();
      
      if (data.status !== 'success' || !data.data) {
        return null;
      }
      
      return findMatchingMatch(data.data, teamAName, teamBName);
    },
    enabled: enabled && !!teamAName && !!teamBName,
    refetchInterval: 30000, // Refetch every 30 seconds for live updates
    staleTime: 15000, // Consider data stale after 15 seconds
    retry: 2,
  });
};
