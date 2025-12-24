import { useMatches } from "@/hooks/useSportsData";
import MatchCard from "@/components/MatchCard";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";

const MatchList = () => {
  const { data: matches, isLoading, error } = useMatches();

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
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-10"
        >
          <h2 className="font-display text-4xl md:text-5xl tracking-wider text-gradient mb-2">
            UPCOMING MATCHES
          </h2>
          <p className="text-muted-foreground">
            Don't miss the action - check out the latest fixtures
          </p>
        </motion.div>

        {matches && matches.length > 0 ? (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {matches.map((match, index) => (
              <MatchCard key={match.id} match={match} index={index} />
            ))}
          </div>
        ) : (
          <div className="text-center py-20">
            <p className="text-muted-foreground text-lg">No matches scheduled yet.</p>
            <p className="text-muted-foreground text-sm mt-2">Check back soon for upcoming fixtures!</p>
          </div>
        )}
      </div>
    </section>
  );
};

export default MatchList;
