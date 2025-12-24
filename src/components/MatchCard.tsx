import { Match } from "@/hooks/useSportsData";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";

interface MatchCardProps {
  match: Match;
  index?: number;
}

const MatchCard = ({ match, index = 0 }: MatchCardProps) => {
  const getStatusVariant = (status: string) => {
    switch (status) {
      case 'live':
        return 'live';
      case 'completed':
        return 'completed';
      default:
        return 'upcoming';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'live':
        return 'Live';
      case 'completed':
        return 'Completed';
      default:
        return 'Upcoming';
    }
  };

  // Generate team initials for logo placeholder
  const getInitials = (name: string) => {
    return name.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
  };

  const teamA = match.team_a;
  const teamB = match.team_b;
  const tournament = match.tournament;

  if (!teamA || !teamB || !tournament) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.1 }}
      className="gradient-border overflow-hidden"
    >
      <div className="bg-gradient-to-b from-muted/50 to-card p-4 md:p-6">
        {/* Tournament Header */}
        <div className="text-center mb-4">
          <h3 className="font-display text-2xl md:text-3xl text-gradient tracking-wider">
            {tournament.name}_{tournament.season}
          </h3>
          <p className="text-muted-foreground text-sm mt-1">
            {match.match_date}, {match.match_time}
          </p>
        </div>

        {/* Sport & Match Number */}
        <div className="flex items-center justify-between mb-6">
          <Badge variant="sport">{tournament.sport}</Badge>
          <span className="text-muted-foreground text-sm font-medium">
            {match.match_number}{getOrdinalSuffix(match.match_number)} Match
          </span>
        </div>

        {/* Teams */}
        <div className="flex items-center justify-between gap-4">
          {/* Team A */}
          <div className="flex-1 flex flex-col items-center text-center gap-3">
            <div className="w-16 h-16 md:w-20 md:h-20 rounded-xl bg-gradient-to-br from-primary/30 to-accent/20 flex items-center justify-center border border-primary/20 shadow-lg shadow-primary/10">
              {teamA.logo_url ? (
                <img src={teamA.logo_url} alt={teamA.name} className="w-12 h-12 object-contain" />
              ) : (
                <span className="font-display text-xl md:text-2xl text-primary">
                  {getInitials(teamA.name)}
                </span>
              )}
            </div>
            <span className="font-medium text-foreground text-sm md:text-base leading-tight">
              {teamA.name}
            </span>
            {match.score_a && (
              <span className="text-lg font-bold text-primary">{match.score_a}</span>
            )}
          </div>

          {/* VS */}
          <div className="flex flex-col items-center gap-2">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary to-pink-500 flex items-center justify-center shadow-lg shadow-primary/30">
              <span className="font-display text-lg text-primary-foreground">VS</span>
            </div>
          </div>

          {/* Team B */}
          <div className="flex-1 flex flex-col items-center text-center gap-3">
            <div className="w-16 h-16 md:w-20 md:h-20 rounded-xl bg-gradient-to-br from-accent/30 to-primary/20 flex items-center justify-center border border-accent/20 shadow-lg shadow-accent/10">
              {teamB.logo_url ? (
                <img src={teamB.logo_url} alt={teamB.name} className="w-12 h-12 object-contain" />
              ) : (
                <span className="font-display text-xl md:text-2xl text-accent">
                  {getInitials(teamB.name)}
                </span>
              )}
            </div>
            <span className="font-medium text-foreground text-sm md:text-base leading-tight">
              {teamB.name}
            </span>
            {match.score_b && (
              <span className="text-lg font-bold text-accent">{match.score_b}</span>
            )}
          </div>
        </div>

        {/* Status */}
        <div className="mt-6 flex justify-center">
          <Badge variant={getStatusVariant(match.status)} className="px-6 py-1.5">
            {getStatusText(match.status)}
          </Badge>
        </div>
      </div>
    </motion.div>
  );
};

function getOrdinalSuffix(num: number): string {
  const j = num % 10;
  const k = num % 100;
  if (j === 1 && k !== 11) return 'st';
  if (j === 2 && k !== 12) return 'nd';
  if (j === 3 && k !== 13) return 'rd';
  return 'th';
}

export default MatchCard;
