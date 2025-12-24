import { Match } from "@/hooks/useSportsData";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";
import { useState, useEffect } from "react";
import { Circle, Trophy } from "lucide-react";

interface MatchCardProps {
  match: Match;
  index?: number;
}

// Sport icons mapping
const SportIcon = ({ sport }: { sport: string }) => {
  // Cricket ball icon
  if (sport.toLowerCase() === 'cricket') {
    return (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
        <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2"/>
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/>
        <path d="M7 7l10 10M17 7L7 17" stroke="currentColor" strokeWidth="1.5" fill="none"/>
      </svg>
    );
  }
  // Football icon
  if (sport.toLowerCase() === 'football') {
    return (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
        <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2"/>
        <path d="M12 2l3 7h-6l3-7zM12 22l-3-7h6l-3 7zM2 12l7-3v6l-7-3zM22 12l-7 3v-6l7 3z" fill="currentColor"/>
      </svg>
    );
  }
  return <Circle className="w-4 h-4" />;
};

const MatchCard = ({ match, index = 0 }: MatchCardProps) => {
  const [countdown, setCountdown] = useState<string | null>(null);
  const [localTime, setLocalTime] = useState<string>("");
  const [timezone, setTimezone] = useState<string>("");

  // Get user's timezone
  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const tzAbbr = new Date().toLocaleTimeString('en-US', { timeZoneName: 'short' }).split(' ').pop() || '';
    setTimezone(tzAbbr);
  }, []);

  // Use match_start_time for countdown and local time display
  useEffect(() => {
    // If we have match_start_time (ISO timestamp), use it directly
    if (match.match_start_time) {
      const matchDate = new Date(match.match_start_time);
      
      // Set local time display
      setLocalTime(matchDate.toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit',
        hour12: true 
      }));

      // Countdown logic (48 hours before)
      const updateCountdown = () => {
        const now = new Date();
        const diff = matchDate.getTime() - now.getTime();
        
        // Only show countdown within 48 hours and for upcoming matches
        if (diff > 0 && diff <= 48 * 60 * 60 * 1000 && match.status === 'upcoming') {
          const hours = Math.floor(diff / (1000 * 60 * 60));
          const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
          const seconds = Math.floor((diff % (1000 * 60)) / 1000);
          setCountdown(`${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
        } else {
          setCountdown(null);
        }
      };

      updateCountdown();
      const interval = setInterval(updateCountdown, 1000);
      return () => clearInterval(interval);
    } else {
      // Fallback to match_time string for display only
      setLocalTime(match.match_time);
      setCountdown(null);
    }
  }, [match.match_start_time, match.match_time, match.status]);

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

  const getInitials = (name: string) => {
    return name.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
  };

  const teamA = match.team_a;
  const teamB = match.team_b;
  const tournament = match.tournament;

  if (!teamA || !teamB || !tournament) {
    return null;
  }

  const handleClick = () => {
    if (match.match_link) {
      window.open(match.match_link, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.1 }}
      onClick={handleClick}
      className={`gradient-border overflow-hidden premium-shadow hover:premium-shadow-lg transition-all duration-300 ${match.match_link ? 'cursor-pointer hover:scale-[1.02]' : ''}`}
    >
      <div className="bg-gradient-card p-4 md:p-6 relative">
        {/* Tournament Logo - Top Right */}
        {tournament.logo_url && (
          <div className="absolute top-3 right-3">
            <img 
              src={tournament.logo_url} 
              alt={tournament.name}
              className="w-12 h-12 md:w-14 md:h-14 object-contain rounded-lg bg-background/50 p-1"
            />
          </div>
        )}

        {/* Tournament Header */}
        <div className="text-center mb-4 pr-16">
          <h3 className="font-display text-xl md:text-2xl text-gradient tracking-wide">
            {tournament.name}
          </h3>
          <p className="text-muted-foreground text-xs mt-1">
            {tournament.season}
          </p>
        </div>

        {/* Sport & Match Number */}
        <div className="flex items-center justify-between mb-5">
          <Badge variant="sport" className="gap-1.5">
            <SportIcon sport={tournament.sport} />
            {tournament.sport}
          </Badge>
          <span className="text-muted-foreground text-xs font-medium bg-muted/50 px-2 py-1 rounded-full">
            Match #{match.match_number}
          </span>
        </div>

        {/* Teams */}
        <div className="flex items-center justify-between gap-3">
          {/* Team A */}
          <div className="flex-1 flex flex-col items-center text-center gap-2">
            <div className="w-14 h-14 md:w-16 md:h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-accent/10 flex items-center justify-center border border-primary/20 premium-shadow">
              {teamA.logo_url ? (
                <img src={teamA.logo_url} alt={teamA.name} className="w-10 h-10 object-contain" />
              ) : (
                <span className="font-display text-lg md:text-xl text-primary">
                  {getInitials(teamA.name)}
                </span>
              )}
            </div>
            <span className="font-medium text-foreground text-xs md:text-sm leading-tight max-w-[80px] truncate">
              {teamA.short_name || teamA.name}
            </span>
            {match.score_a && (
              <span className="text-base font-bold text-primary">{match.score_a}</span>
            )}
          </div>

          {/* VS & Countdown */}
          <div className="flex flex-col items-center gap-2">
            {countdown ? (
              <div className="flex flex-col items-center">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Starts in</span>
                <div className="bg-gradient-primary text-primary-foreground px-3 py-1.5 rounded-lg font-mono text-sm font-bold animate-countdown">
                  {countdown}
                </div>
              </div>
            ) : (
              <div className="w-10 h-10 rounded-full bg-gradient-primary flex items-center justify-center premium-shadow">
                <span className="font-display text-sm text-primary-foreground">VS</span>
              </div>
            )}
          </div>

          {/* Team B */}
          <div className="flex-1 flex flex-col items-center text-center gap-2">
            <div className="w-14 h-14 md:w-16 md:h-16 rounded-2xl bg-gradient-to-br from-accent/20 to-primary/10 flex items-center justify-center border border-accent/20 premium-shadow">
              {teamB.logo_url ? (
                <img src={teamB.logo_url} alt={teamB.name} className="w-10 h-10 object-contain" />
              ) : (
                <span className="font-display text-lg md:text-xl text-accent">
                  {getInitials(teamB.name)}
                </span>
              )}
            </div>
            <span className="font-medium text-foreground text-xs md:text-sm leading-tight max-w-[80px] truncate">
              {teamB.short_name || teamB.name}
            </span>
            {match.score_b && (
              <span className="text-base font-bold text-accent">{match.score_b}</span>
            )}
          </div>
        </div>

        {/* Venue, Time & Status */}
        <div className="mt-5 flex flex-col items-center gap-2">
          {match.venue && (
            <p className="text-muted-foreground text-[11px] font-medium uppercase tracking-wide">
              📍 {match.venue}
            </p>
          )}
          <p className="text-muted-foreground text-xs">
            {match.match_date} • {localTime || match.match_time} <span className="text-primary">({timezone})</span>
          </p>
          <Badge variant={getStatusVariant(match.status)} className="px-4 py-1">
            {match.status === 'live' && (
              <span className="w-2 h-2 bg-current rounded-full mr-1.5 animate-pulse" />
            )}
            {getStatusText(match.status)}
          </Badge>
        </div>
      </div>
    </motion.div>
  );
};

export default MatchCard;