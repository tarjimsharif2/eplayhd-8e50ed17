import { Match, useMatchInnings } from "@/hooks/useSportsData";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";
import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { MapPin, Clock, Star } from "lucide-react";
import InningsDisplay from "@/components/InningsDisplay";

interface MatchCardProps {
  match: Match;
  index?: number;
}

// Cricket format badges with colors
const CRICKET_FORMATS: Record<string, { label: string; color: string }> = {
  'test': { label: 'TEST', color: 'bg-red-600' },
  'odi': { label: 'ODI', color: 'bg-blue-600' },
  't20': { label: 'T20', color: 'bg-green-600' },
  't10': { label: 'T10', color: 'bg-purple-600' },
  'the_hundred': { label: 'THE HUNDRED', color: 'bg-orange-600' },
};

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

// Helper to check if date is today or tomorrow
const getDateLabel = (matchStartTime: string | null, matchDate: string): { label: string; isTodayOrTomorrow: boolean } => {
  if (!matchStartTime) {
    return { label: matchDate, isTodayOrTomorrow: false };
  }

  const matchDateTime = new Date(matchStartTime);
  const now = new Date();
  
  // Get start of today and tomorrow in local timezone
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dayAfterTomorrow = new Date(today);
  dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2);

  // Get match date in local timezone
  const matchDay = new Date(matchDateTime.getFullYear(), matchDateTime.getMonth(), matchDateTime.getDate());

  if (matchDay.getTime() === today.getTime()) {
    return { label: 'Today', isTodayOrTomorrow: true };
  } else if (matchDay.getTime() === tomorrow.getTime()) {
    return { label: `${matchDate} (Tomorrow)`, isTodayOrTomorrow: true };
  }
  
  return { label: matchDate, isTodayOrTomorrow: false };
};

const MatchCard = ({ match, index = 0 }: MatchCardProps) => {
  const navigate = useNavigate();
  const [countdown, setCountdown] = useState<string | null>(null);
  const [localTime, setLocalTime] = useState<string>("");
  const [timezone, setTimezone] = useState<string>("");

  // Get date label (Today/Tomorrow/Date)
  const dateLabel = useMemo(() => getDateLabel(match.match_start_time, match.match_date), [match.match_start_time, match.match_date]);

  // Get cricket format info
  const cricketFormat = useMemo(() => {
    if (!match.match_format) return null;
    return CRICKET_FORMATS[match.match_format.toLowerCase()] || null;
  }, [match.match_format]);

  // Check if it's a cricket match
  const sportName = match.sport?.name || match.tournament?.sport || 'Sport';
  const isCricket = sportName.toLowerCase() === 'cricket';

  // Fetch innings for cricket matches
  const { data: innings } = useMatchInnings(isCricket ? match.id : undefined);

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

  // Get sport icon URL
  const sportIconUrl = sport?.icon_url;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.02, y: -4 }}
      whileTap={{ scale: 0.98 }}
      transition={{ 
        duration: 0.3, 
        delay: index * 0.05,
        type: "spring",
        stiffness: 400,
        damping: 25
      }}
      onClick={handleClick}
      className={`relative overflow-hidden rounded-2xl ${isClickable ? 'cursor-pointer' : ''} group`}
    >
      {/* Glassmorphism card */}
      <div className="relative bg-gradient-to-br from-card/95 via-card/85 to-card/75 backdrop-blur-xl border border-border/40 rounded-2xl overflow-hidden transition-all duration-300 group-hover:border-primary/50 group-hover:shadow-xl group-hover:shadow-primary/15">
        
        {/* Hover glow effect */}
        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-gradient-to-br from-primary/5 via-transparent to-accent/5 pointer-events-none" />
        
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

        <div className="p-4">
          {/* Cricket Format & Test Day Badges */}
          {isCricket && (cricketFormat || match.test_day) && (
            <div className="flex items-center justify-center gap-2 mb-2">
              {cricketFormat && (
                <Badge className={`${cricketFormat.color} text-white border-0 font-bold text-[10px] uppercase tracking-wider px-2.5 py-1 shadow-lg`}>
                  {cricketFormat.label}
                </Badge>
              )}
              {match.test_day && match.match_format?.toLowerCase() === 'test' && (
                <Badge className="bg-gradient-to-r from-amber-600 to-amber-700 text-white border-0 font-bold text-[10px] uppercase tracking-wider px-2.5 py-1 shadow-lg">
                  Day-{match.test_day}
                </Badge>
              )}
              {match.is_stumps && match.match_format?.toLowerCase() === 'test' && (
                <Badge className="bg-gradient-to-r from-slate-600 to-slate-700 text-white border-0 font-bold text-[10px] uppercase tracking-wider px-2.5 py-1 shadow-lg animate-pulse">
                  STUMPS
                </Badge>
              )}
            </div>
          )}

          {/* Match Label Badge - Above Tournament Name */}
          {match.match_label && (
            <div className="flex justify-start mb-2">
              <Badge className="bg-gradient-to-r from-yellow-500/90 to-orange-500/90 text-white border-0 font-semibold text-[10px] uppercase tracking-wider px-2.5 py-1 shadow-lg">
                {match.match_label}
              </Badge>
            </div>
          )}

          {/* Tournament Header with Logo */}
          <div className="flex items-start justify-between gap-2 mb-3">
            {tournament && (
              <div className="flex-1 min-w-0">
                <h3 className="tournament-title text-base md:text-lg tracking-wide line-clamp-2">
                  {tournament.name}
                </h3>
                <p className="text-muted-foreground text-[10px] uppercase tracking-widest font-medium mt-0.5">
                  {tournament.season}
                </p>
              </div>
            )}
            {tournament?.logo_url && (
              <div className="w-10 h-10 rounded-xl bg-background/60 backdrop-blur-sm p-1 border border-border/30 shadow-lg flex-shrink-0">
                <img src={tournament.logo_url} alt={tournament.name} className="w-full h-full object-contain" />
              </div>
            )}
          </div>

          {/* Sport Badge & Match Number */}
          <div className="flex items-center justify-between mb-3">
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

          {/* Teams Section - More Compact */}
          <div className="flex items-center justify-between gap-1">
            {/* Team A */}
            <div className="flex-1 flex flex-col items-center text-center gap-1.5">
              <div className="w-12 h-12 md:w-14 md:h-14 rounded-xl bg-gradient-to-br from-primary/15 to-transparent flex items-center justify-center border border-primary/20">
                {teamA.logo_url ? (
                  <img src={teamA.logo_url} alt={teamA.name} className="w-9 h-9 md:w-10 md:h-10 object-contain" />
                ) : (
                  <span className="font-display text-lg text-primary">{getInitials(teamA.name)}</span>
                )}
              </div>
              <span className="font-medium text-foreground text-[11px] md:text-xs leading-tight line-clamp-2">{teamA.name}</span>
              {match.score_a && <span className="text-base md:text-lg font-bold text-primary">{match.score_a}</span>}
            </div>

            {/* VS / Countdown / Match Minute */}
            <div className="flex flex-col items-center gap-1 px-1">
              {countdown ? (
                <div className="flex flex-col items-center">
                  <span className="text-[8px] text-muted-foreground uppercase tracking-wider">Starts in</span>
                  <div className="bg-gradient-to-br from-primary to-accent text-primary-foreground px-2 py-1 rounded-lg font-mono text-xs font-bold shadow-lg animate-pulse">
                    {countdown}
                  </div>
                </div>
              ) : match.status === 'live' && match.match_minute != null && (sportName.toLowerCase() === 'football' || sportName.toLowerCase() === 'soccer') ? (
                <div className="flex flex-col items-center">
                  <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center border border-red-500/30 relative">
                    <span className="font-display text-sm text-red-500 font-bold">{match.match_minute}'</span>
                    <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
                  </div>
                </div>
              ) : (
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center border border-primary/30">
                  <span className="font-display text-xs text-foreground/80">VS</span>
                </div>
              )}
            </div>

            {/* Team B */}
            <div className="flex-1 flex flex-col items-center text-center gap-1.5">
              <div className="w-12 h-12 md:w-14 md:h-14 rounded-xl bg-gradient-to-br from-accent/15 to-transparent flex items-center justify-center border border-accent/20">
                {teamB.logo_url ? (
                  <img src={teamB.logo_url} alt={teamB.name} className="w-9 h-9 md:w-10 md:h-10 object-contain" />
                ) : (
                  <span className="font-display text-lg text-accent">{getInitials(teamB.name)}</span>
                )}
              </div>
              <span className="font-medium text-foreground text-[11px] md:text-xs leading-tight line-clamp-2">{teamB.name}</span>
              {match.score_b && <span className="text-base md:text-lg font-bold text-accent">{match.score_b}</span>}
            </div>
          </div>

          {/* Innings Display for Cricket */}
          {isCricket && innings && innings.length > 0 && (
            <div className="mt-2 pt-2 border-t border-border/20">
              <InningsDisplay innings={innings} teamAId={teamA.id} teamBId={teamB.id} compact={true} />
            </div>
          )}

          {/* Footer: Venue, Time & Status */}
          <div className="mt-3 pt-2 border-t border-border/30 flex flex-col items-center gap-1.5">
            {match.venue && (
              <p className="text-muted-foreground text-xs font-medium flex items-center gap-1.5">
                <MapPin className="w-3 h-3" />
                {match.venue}
              </p>
            )}
            <div className="flex items-center gap-2 text-muted-foreground text-xs">
              <Clock className="w-3 h-3" />
              <span className={dateLabel.isTodayOrTomorrow ? 'text-primary font-semibold' : ''}>
                {dateLabel.label}
              </span>
              <span>• {localTime || match.match_time}</span>
              <span className="text-primary font-medium">({timezone})</span>
            </div>
            <Badge variant={getStatusVariant(match.status)} className="px-4 py-1.5 text-xs">
              {match.status === 'live' && (
                <span className="w-2 h-2 bg-current rounded-full mr-1.5 animate-pulse" />
              )}
              {getStatusText(match.status)}
            </Badge>
          </div>
          
          {/* Click indicator for clickable cards */}
          {isClickable && (
            <div className="absolute bottom-4 right-4 opacity-0 group-hover:opacity-100 transition-all duration-300 transform translate-x-2 group-hover:translate-x-0">
              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center backdrop-blur-sm border border-primary/30">
                <svg className="w-4 h-4 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </div>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
};

export default MatchCard;
