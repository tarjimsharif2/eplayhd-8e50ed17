import { useMatches } from "@/hooks/useSportsData";
import MatchCard from "@/components/MatchCard";
import MatchFilters, { MatchFilter } from "@/components/MatchFilters";
import BannerSlider from "@/components/BannerSlider";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";

const MatchList = () => {
  const { data: matches, isLoading, error } = useMatches();
  const [activeFilter, setActiveFilter] = useState<MatchFilter>('all');
  const [activeSportFilter, setActiveSportFilter] = useState<string>('all');

  // Filter and sort matches: Live first, then upcoming, then completed - sorted by match start time
  const filteredMatches = useMemo(() => {
    if (!matches) return [];

    const now = new Date();
    const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

    // Helper function to get sort priority based on status and stumps
    const getStatusPriority = (status: string, isStumps?: boolean | null) => {
      if (status === 'live' && !isStumps) return 0; // Live matches first
      if (status === 'live' && isStumps) return 1;   // STUMPS matches after live
      if (status === 'upcoming') return 2;
      if (status === 'completed') return 3;
      return 4;
    };

    // Helper function to parse match date/time into a Date object
    const parseMatchDateTime = (matchDate: string, matchTime: string, matchStartTime: string | null): Date => {
      // Use match_start_time if available (it's already a timestamp)
      if (matchStartTime) {
        return new Date(matchStartTime);
      }
      
      // Otherwise, try to parse from match_date and match_time
      try {
        const dateMatch = matchDate.match(/(\d+)(?:st|nd|rd|th)?\s+(\w+)\s+(\d{4})/i);
        if (dateMatch) {
          const [, day, month, year] = dateMatch;
          const monthMap: Record<string, number> = {
            january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
            july: 6, august: 7, september: 8, october: 9, november: 10, december: 11
          };
          const monthNum = monthMap[month.toLowerCase()];
          
          // Parse time like "7:30 PM IST" or "19:30"
          let hours = 0;
          let minutes = 0;
          const timeMatch = matchTime.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
          if (timeMatch) {
            hours = parseInt(timeMatch[1]);
            minutes = parseInt(timeMatch[2]);
            const period = timeMatch[3]?.toUpperCase();
            if (period === 'PM' && hours < 12) hours += 12;
            if (period === 'AM' && hours === 12) hours = 0;
          }
          
          return new Date(parseInt(year), monthNum, parseInt(day), hours, minutes);
        }
      } catch {
        // Fall back to current time if parsing fails
      }
      return new Date();
    };

    const filtered = matches.filter((match) => {
      // Hide completed matches older than 2 days
      if (match.status === 'completed') {
        try {
          const dateMatch = match.match_date.match(/(\d+)(?:st|nd|rd|th)?\s+(\w+)\s+(\d{4})/i);
          if (dateMatch) {
            const [, day, month, year] = dateMatch;
            const monthMap: Record<string, number> = {
              january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
              july: 6, august: 7, september: 8, october: 9, november: 10, december: 11
            };
            const matchDate = new Date(parseInt(year), monthMap[month.toLowerCase()], parseInt(day));
            if (matchDate < twoDaysAgo) return false;
          }
        } catch {
          // Keep match if date parsing fails
        }
      }

      // Apply sport filter
      if (activeSportFilter !== 'all') {
        const matchSportName = match.sport?.name || match.tournament?.sport;
        if (matchSportName?.toLowerCase() !== activeSportFilter.toLowerCase()) return false;
      }

      // Apply status filter
      if (activeFilter === 'all') return true;
      // STUMPS matches should show in live filter
      if (activeFilter === 'live') {
        return match.status === 'live';
      }
      return match.status === activeFilter;
    });

    // Sort: Priority first, then Live, then upcoming, then completed - all sorted by start time
    return filtered.sort((a, b) => {
      // First, priority matches always come first
      if (a.is_priority && !b.is_priority) return -1;
      if (!a.is_priority && b.is_priority) return 1;

      // Then sort by status priority (considering stumps)
      const priorityDiff = getStatusPriority(a.status, a.is_stumps) - getStatusPriority(b.status, b.is_stumps);
      if (priorityDiff !== 0) return priorityDiff;

      // Within same status, sort by match start time
      const dateA = parseMatchDateTime(a.match_date, a.match_time, a.match_start_time);
      const dateB = parseMatchDateTime(b.match_date, b.match_time, b.match_start_time);
      
      // For live and upcoming matches, sort by start time (earliest first)
      // For completed, show most recent first
      if (a.status === 'live' || a.status === 'upcoming') {
        return dateA.getTime() - dateB.getTime();
      }
      return dateB.getTime() - dateA.getTime();
    });
  }, [matches, activeFilter, activeSportFilter]);

  // Get unique sports that have matches (for sport filter)
  const sportsWithMatches = useMemo(() => {
    if (!matches) return [];
    
    const now = new Date();
    const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
    
    const sportSet = new Set<string>();
    
    matches.forEach((match) => {
      // Skip completed matches older than 2 days
      if (match.status === 'completed') {
        try {
          const dateMatch = match.match_date.match(/(\d+)(?:st|nd|rd|th)?\s+(\w+)\s+(\d{4})/i);
          if (dateMatch) {
            const [, day, month, year] = dateMatch;
            const monthMap: Record<string, number> = {
              january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
              july: 6, august: 7, september: 8, october: 9, november: 10, december: 11
            };
            const matchDate = new Date(parseInt(year), monthMap[month.toLowerCase()], parseInt(day));
            if (matchDate < twoDaysAgo) return;
          }
        } catch {
          // Continue if date parsing fails
        }
      }
      
      const sportName = match.sport?.name || match.tournament?.sport;
      if (sportName) {
        sportSet.add(sportName);
      }
    });
    
    return Array.from(sportSet).sort();
  }, [matches]);

  // Calculate counts for filter badges
  const counts = useMemo(() => {
    if (!matches) return { all: 0, upcoming: 0, live: 0, completed: 0 };
    
    const now = new Date();
    const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
    
    let all = 0, upcoming = 0, live = 0, completed = 0;
    
    matches.forEach((match) => {
      // Skip completed matches older than 2 days
      if (match.status === 'completed') {
        try {
          const dateMatch = match.match_date.match(/(\d+)(?:st|nd|rd|th)?\s+(\w+)\s+(\d{4})/i);
          if (dateMatch) {
            const [, day, month, year] = dateMatch;
            const monthMap: Record<string, number> = {
              january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
              july: 6, august: 7, september: 8, october: 9, november: 10, december: 11
            };
            const matchDate = new Date(parseInt(year), monthMap[month.toLowerCase()], parseInt(day));
            if (matchDate < twoDaysAgo) return;
          }
        } catch {
          // Continue counting if date parsing fails
        }
      }
      
      all++;
      if (match.status === 'upcoming') upcoming++;
      else if (match.status === 'live') live++;
      else if (match.status === 'completed') completed++;
    });
    
    return { all, upcoming, live, completed };
  }, [matches]);

  if (isLoading) {
    return (
      <section className="py-12 md:py-20">
        <div className="container mx-auto px-4 text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
          <p className="text-muted-foreground mt-4">Loading matches...</p>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="py-12 md:py-20">
        <div className="container mx-auto px-4 text-center">
          <p className="text-destructive">Error loading matches. Please try again later.</p>
        </div>
      </section>
    );
  }

  return (
    <section id="matches" className="py-12 md:py-20">
      <div className="container mx-auto px-4">
        {/* Banner Slider */}
        <div className="mb-10">
          <BannerSlider />
        </div>

        {/* Sport Filters - Only show when multiple sports have matches */}
        {sportsWithMatches.length > 1 && (
          <div className="mb-4 flex flex-wrap justify-center gap-2">
            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
              <Button
                variant={activeSportFilter === 'all' ? "gradient" : "outline"}
                size="sm"
                onClick={() => setActiveSportFilter('all')}
                className="gap-1.5"
              >
                All Sports
              </Button>
            </motion.div>
            {sportsWithMatches.map((sport) => (
              <motion.div key={sport} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                <Button
                  variant={activeSportFilter === sport ? "gradient" : "outline"}
                  size="sm"
                  onClick={() => setActiveSportFilter(sport)}
                  className="gap-1.5"
                >
                  {sport}
                </Button>
              </motion.div>
            ))}
          </div>
        )}

        {/* Status Filters */}
        <div className="mb-8">
          <MatchFilters 
            activeFilter={activeFilter} 
            onFilterChange={setActiveFilter}
            counts={counts}
          />
        </div>

        {filteredMatches.length > 0 ? (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {filteredMatches.map((match, index) => (
              <MatchCard key={match.id} match={match} index={index} />
            ))}
          </div>
        ) : (
          <div className="text-center py-20">
            <p className="text-muted-foreground text-lg">
              {activeFilter === 'all' 
                ? 'No matches scheduled yet.' 
                : `No ${activeFilter} matches at the moment.`}
            </p>
            <p className="text-muted-foreground text-sm mt-2">Check back soon for upcoming fixtures!</p>
          </div>
        )}
      </div>
    </section>
  );
};

export default MatchList;
