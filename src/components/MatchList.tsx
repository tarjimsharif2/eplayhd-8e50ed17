import { useMatches } from "@/hooks/useSportsData";
import MatchCard from "@/components/MatchCard";
import MatchFilters, { MatchFilter } from "@/components/MatchFilters";
import BannerSlider from "@/components/BannerSlider";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { useState, useMemo } from "react";

const MatchList = () => {
  const { data: matches, isLoading, error } = useMatches();
  const [activeFilter, setActiveFilter] = useState<MatchFilter>('all');

  // Filter matches and hide completed matches older than 2 days
  const filteredMatches = useMemo(() => {
    if (!matches) return [];

    const now = new Date();
    const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

    return matches.filter((match) => {
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

      // Apply status filter
      if (activeFilter === 'all') return true;
      return match.status === activeFilter;
    });
  }, [matches, activeFilter]);

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

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-8"
        >
          <h2 className="font-display text-3xl md:text-4xl tracking-wide text-gradient mb-2">
            Matches
          </h2>
          <p className="text-muted-foreground">
            Don't miss the action - check out the latest fixtures
          </p>
        </motion.div>

        {/* Filters */}
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
