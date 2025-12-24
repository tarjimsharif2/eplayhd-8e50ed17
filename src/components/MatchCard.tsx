import { Match } from "@/hooks/useSportsData";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { MapPin, Clock, Star } from "lucide-react";

interface MatchCardProps {
  match: Match;
  index?: number;
}

// Sport icon component that uses custom icon_url or fallback SVG
const SportIcon = ({ sport, iconUrl }: { sport: string; iconUrl?: string | null }) => {
  if (iconUrl) {
    return <img src={iconUrl} alt={sport} className="w-4 h-4 object-contain" />;
  }
  
  // Fallback SVG icons
  const sportLower = sport.toLowerCase();
  
  if (sportLower === 'cricket') {
    return (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
        <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2"/>
        <path d="M7 7l10 10M17 7L7 17" stroke="currentColor" strokeWidth="1.5" fill="none"/>
      </svg>
    );
  }
  
  if (sportLower === 'football') {
    return (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
        <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2"/>
        <path d="M12 2l3 7h-6l3-7zM12 22l-3-7h6l-3 7zM2 12l7-3v6l-7-3zM22 12l-7 3v-6l7 3z" fill="currentColor"/>
      </svg>
    );
  }
  
  if (sportLower === 'tennis') {
    return (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
        <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2"/>
        <path d="M12 3c-2 4-2 10 0 18M12 3c2 4 2 10 0 18M3 12h18" stroke="currentColor" strokeWidth="1.5" fill="none"/>
      </svg>
    );
  }
  
  if (sportLower === 'basketball') {
    return (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
        <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2"/>
        <path d="M12 2v20M2 12h20M4 6c4 1 8 1 16 0M4 18c4-1 8-1 16 0" stroke="currentColor" strokeWidth="1.5" fill="none"/>
      </svg>
    );
  }
  
  // Default circle
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2"/>
    </svg>
  );
};

const MatchCard = ({ match, index = 0 }: MatchCardProps) => {
  const navigate = useNavigate();
  const [countdown, setCountdown] = useState<string | null>(null);
  const [localTime, setLocalTime] = useState<string>("");
  const [timezone, setTimezone] = useState<string>("");

  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const tzAbbr = new Date().toLocaleTimeString('en-US', { timeZoneName: 'short' }).split(' ').pop() || '';
    setTimezone(tzAbbr);
  }, []);

  useEffect(() => {
    if (match.match_start_time) {
      const matchDate = new Date(match.match_start_time);
      
      setLocalTime(matchDate.toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit',
        hour12: true 
      }));

      const updateCountdown = () => {
        const now = new Date();
        const diff = matchDate.getTime() - now.getTime();
        
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
      setLocalTime(match.match_time);
      setCountdown(null);
    }
  }, [match.match_start_time, match.match_time, match.status]);

  const getStatusVariant = (status: string) => {
    switch (status) {
      case 'live': return 'live';
      case 'completed': return 'completed';
      default: return 'upcoming';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'live': return 'Live';
      case 'completed': return 'Completed';
      default: return 'Upcoming';
    }
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
  };

  const teamA = match.team_a;
  const teamB = match.team_b;
  const tournament = match.tournament;
  const sport = match.sport;

  if (!teamA || !teamB) {
    return null;
  }

  const handleClick = () => {
    if (match.page_type === 'page' && match.slug) {
      navigate(`/match/${match.slug}`);
    } else if (match.match_link) {
      window.open(match.match_link, '_blank', 'noopener,noreferrer');
    }
  };

  const isClickable = (match.page_type === 'page' && match.slug) || match.match_link;

  // Get sport name from sport object or tournament
  const sportName = sport?.name || tournament?.sport || 'Sport';
  const sportIconUrl = sport?.icon_url;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.08 }}
      onClick={handleClick}
      className={`relative overflow-hidden rounded-2xl transition-all duration-300 ${isClickable ? 'cursor-pointer' : ''} group`}
    >
      {/* Glassmorphism card */}
      <div className="relative bg-gradient-to-br from-card/90 via-card/70 to-card/50 backdrop-blur-xl border border-border/50 rounded-2xl overflow-hidden hover:border-primary/40 hover:shadow-2xl hover:shadow-primary/10 transition-all duration-500">
        
        {/* Priority indicator */}
        {match.is_priority && (
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-yellow-500 via-orange-500 to-red-500" />
        )}
        
        {/* Tournament Logo - Top Right */}
        {tournament?.logo_url && (
          <div className="absolute top-3 right-3 z-10">
            <div className="w-12 h-12 rounded-xl bg-background/60 backdrop-blur-sm p-1.5 border border-border/30 shadow-lg">
              <img 
                src={tournament.logo_url} 
                alt={tournament.name}
                className="w-full h-full object-contain"
              />
            </div>
          </div>
        )}

        <div className="p-5 md:p-6">
          {/* Match Label Badge - Above Tournament Name */}
          {match.match_label && (
            <div className="flex justify-start mb-3">
              <Badge className="bg-gradient-to-r from-yellow-500/90 to-orange-500/90 text-white border-0 font-semibold text-[10px] uppercase tracking-wider px-2.5 py-1 shadow-lg">
                {match.match_label}
              </Badge>
            </div>
          )}

          {/* Tournament Header - Optional */}
          {tournament && (
            <div className={`text-center mb-4 ${tournament.logo_url ? 'pr-14' : ''}`}>
              <h3 className="font-display text-lg md:text-xl text-gradient tracking-wide line-clamp-2">
                {tournament.name}
              </h3>
              <p className="text-muted-foreground text-[11px] mt-1">
                {tournament.season}
              </p>
            </div>
          )}

          {/* Sport Badge & Match Number */}
          <div className="flex items-center justify-between mb-5">
            <Badge variant="sport" className="gap-1.5 text-xs">
              <SportIcon sport={sportName} iconUrl={sportIconUrl} />
              {sportName}
            </Badge>
            <div className="flex items-center gap-2">
              {match.is_priority && (
                <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
              )}
              <span className="text-muted-foreground text-[11px] font-medium bg-muted/40 px-2.5 py-1 rounded-full">
                Match #{match.match_number}
              </span>
            </div>
          </div>

          {/* Teams Section */}
          <div className="flex items-center justify-between gap-2">
            {/* Team A */}
            <div className="flex-1 flex flex-col items-center text-center gap-2.5">
              <div className="w-16 h-16 md:w-20 md:h-20 rounded-2xl bg-gradient-to-br from-primary/15 via-primary/10 to-transparent flex items-center justify-center border border-primary/20 shadow-lg group-hover:shadow-primary/20 transition-all duration-300">
                {teamA.logo_url ? (
                  <img src={teamA.logo_url} alt={teamA.name} className="w-12 h-12 md:w-14 md:h-14 object-contain" />
                ) : (
                  <span className="font-display text-xl md:text-2xl text-primary">
                    {getInitials(teamA.name)}
                  </span>
                )}
              </div>
              <div className="w-full px-1">
                <span className="font-semibold text-foreground text-xs md:text-sm leading-tight block text-center break-words hyphens-auto">
                  {teamA.name}
                </span>
              </div>
              {match.score_a && (
                <span className="text-lg md:text-xl font-bold text-primary">{match.score_a}</span>
              )}
            </div>

            {/* VS / Countdown / Match Minute */}
            <div className="flex flex-col items-center gap-2 px-2">
              {countdown ? (
                <div className="flex flex-col items-center">
                  <span className="text-[9px] text-muted-foreground uppercase tracking-widest mb-1">Starts in</span>
                  <div className="bg-gradient-to-br from-primary to-accent text-primary-foreground px-3 py-2 rounded-xl font-mono text-sm font-bold shadow-lg shadow-primary/30 animate-pulse">
                    {countdown}
                  </div>
                </div>
              ) : match.status === 'live' && match.match_minute != null ? (
                <div className="flex flex-col items-center">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-red-500/20 to-red-600/20 flex items-center justify-center border border-red-500/30 shadow-inner relative">
                    <span className="font-display text-lg text-red-500 font-bold">{match.match_minute}'</span>
                    <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                  </div>
                  <span className="text-[9px] text-red-500 uppercase tracking-widest mt-1 font-semibold">LIVE</span>
                </div>
              ) : (
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center border border-primary/30 shadow-inner">
                  <span className="font-display text-sm text-foreground/80">VS</span>
                </div>
              )}
            </div>

            {/* Team B */}
            <div className="flex-1 flex flex-col items-center text-center gap-2.5">
              <div className="w-16 h-16 md:w-20 md:h-20 rounded-2xl bg-gradient-to-br from-accent/15 via-accent/10 to-transparent flex items-center justify-center border border-accent/20 shadow-lg group-hover:shadow-accent/20 transition-all duration-300">
                {teamB.logo_url ? (
                  <img src={teamB.logo_url} alt={teamB.name} className="w-12 h-12 md:w-14 md:h-14 object-contain" />
                ) : (
                  <span className="font-display text-xl md:text-2xl text-accent">
                    {getInitials(teamB.name)}
                  </span>
                )}
              </div>
              <div className="w-full px-1">
                <span className="font-semibold text-foreground text-xs md:text-sm leading-tight block text-center break-words hyphens-auto">
                  {teamB.name}
                </span>
              </div>
              {match.score_b && (
                <span className="text-lg md:text-xl font-bold text-accent">{match.score_b}</span>
              )}
            </div>
          </div>

          {/* Footer: Venue, Time & Status */}
          <div className="mt-6 pt-4 border-t border-border/30 flex flex-col items-center gap-2">
            {match.venue && (
              <p className="text-muted-foreground text-xs font-medium flex items-center gap-1.5">
                <MapPin className="w-3 h-3" />
                {match.venue}
              </p>
            )}
            <div className="flex items-center gap-2 text-muted-foreground text-xs">
              <Clock className="w-3 h-3" />
              <span>{match.match_date} • {localTime || match.match_time}</span>
              <span className="text-primary font-medium">({timezone})</span>
            </div>
            <Badge variant={getStatusVariant(match.status)} className="px-4 py-1.5 text-xs">
              {match.status === 'live' && (
                <span className="w-2 h-2 bg-current rounded-full mr-1.5 animate-pulse" />
              )}
              {getStatusText(match.status)}
            </Badge>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default MatchCard;
