import { useActiveBanners, Banner } from "@/hooks/useSportsData";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight, Play, Clock, Radio } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { usePublicSiteSettings } from "@/hooks/usePublicSiteSettings";

const BannerSlider = () => {
  const { data: banners, isLoading } = useActiveBanners();
  const { data: siteSettings } = usePublicSiteSettings();
  const [currentIndex, setCurrentIndex] = useState(0);
  const navigate = useNavigate();

  // Get slider duration from settings (default 6 seconds)
  const sliderDuration = ((siteSettings as any)?.slider_duration_seconds || 6) * 1000;

  useEffect(() => {
    if (!banners || banners.length <= 1) return;
    
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % banners.length);
    }, sliderDuration);

    return () => clearInterval(interval);
  }, [banners, sliderDuration]);

  if (isLoading || !banners || banners.length === 0) {
    return null;
  }

  const goToPrev = () => {
    setCurrentIndex((prev) => (prev - 1 + banners.length) % banners.length);
  };

  const goToNext = () => {
    setCurrentIndex((prev) => (prev + 1) % banners.length);
  };

  const handleClick = (banner: Banner) => {
    // Priority 1: Use match/tournament slug if available
    if (banner.banner_type === 'match' && banner.match?.slug) {
      navigate(`/match/${banner.match.slug}`);
      return;
    }
    
    if (banner.banner_type === 'tournament' && banner.tournament?.slug) {
      navigate(`/tournament/${banner.tournament.slug}`);
      return;
    }
    
    // Priority 2: Use link_url for internal or external navigation
    if (banner.link_url) {
      // Check if it's an internal link (starts with /)
      if (banner.link_url.startsWith('/')) {
        navigate(banner.link_url);
      } else {
        window.open(banner.link_url, '_blank', 'noopener,noreferrer');
      }
    }
  };

  // Check if match is live
  const isMatchLive = (banner: Banner): boolean => {
    return banner.banner_type === 'match' && banner.match?.status === 'live';
  };

  // Auto-determine badge based on match status (overrides manual badge for match banners)
  const getAutoBadge = (banner: Banner): Banner['badge_type'] => {
    // For match banners, use match status to determine badge
    if (banner.banner_type === 'match' && banner.match) {
      const matchStatus = banner.match.status;
      // For live matches, show "Watch Now" as the action badge (LIVE indicator shown separately at top)
      if (matchStatus === 'live') return 'watch_now';
      if (matchStatus === 'upcoming') return 'upcoming';
      if (matchStatus === 'completed') return 'watch_now'; // Show "Watch Now" for completed matches (highlights)
      return 'watch_now';
    }
    
    // For tournament/custom banners, use manual badge
    return banner.badge_type || 'none';
  };

  const getBadgeContent = (badge: Banner['badge_type']) => {
    switch (badge) {
      case 'live':
        return (
          <span className="inline-flex items-center gap-1.5 bg-destructive text-destructive-foreground px-3 py-1.5 rounded-full text-sm font-semibold shadow-lg animate-pulse">
            <Radio className="w-3.5 h-3.5" />
            LIVE
          </span>
        );
      case 'upcoming':
        return (
          <span className="inline-flex items-center gap-1.5 bg-background text-foreground px-3 py-1.5 rounded-full text-sm font-semibold shadow-lg border border-border">
            <Clock className="w-3.5 h-3.5" />
            Upcoming
          </span>
        );
      case 'watch_now':
        return (
          <span className="inline-flex items-center gap-1.5 bg-primary text-primary-foreground px-3 py-1.5 rounded-full text-sm font-semibold shadow-lg">
            <Play className="w-3.5 h-3.5 fill-current" />
            Watch Now
          </span>
        );
      default:
        return null;
    }
  };

  const getSubtitle = (banner: Banner) => {
    if (banner.subtitle) return banner.subtitle;
    
    if (banner.banner_type === 'match' && banner.match) {
      const match = banner.match;
      const sport = match.tournament?.sport || 'Cricket';
      const format = match.match_format || '';
      return [sport, format].filter(Boolean).join(' • ');
    }
    
    if (banner.banner_type === 'tournament' && banner.tournament) {
      return `${banner.tournament.sport} • Series`;
    }
    
    return null;
  };

  const currentBanner = banners[currentIndex];

  return (
    <div className="relative w-full overflow-hidden rounded-2xl premium-shadow-lg">
      <AnimatePresence mode="wait">
        <motion.div
          key={currentIndex}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
          onClick={() => handleClick(currentBanner)}
          className="relative aspect-[16/9] sm:aspect-[21/9] md:aspect-[3/1] cursor-pointer group"
        >
          {/* Background Image */}
          <img
            src={currentBanner.image_url}
            alt={currentBanner.title}
            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
          />
          
          {/* Gradient Overlays */}
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/50 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-r from-background/80 via-background/30 to-transparent" />
          
          {/* LIVE Indicator - Top left for live matches */}
          {isMatchLive(currentBanner) && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3 }}
              className="absolute top-4 left-4 sm:top-6 sm:left-6 z-20"
            >
              <div className="flex items-center gap-2 bg-destructive/95 backdrop-blur-sm text-destructive-foreground px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg shadow-lg">
                {/* Animated pulse dot */}
                <span className="relative flex h-2.5 w-2.5 sm:h-3 sm:w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 sm:h-3 sm:w-3 bg-white"></span>
                </span>
                <span className="text-xs sm:text-sm font-bold tracking-wide">সরাসরি</span>
                <Radio className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-pulse" />
              </div>
            </motion.div>
          )}

          {/* Content */}
          <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-6 md:p-8">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.2 }}
              className="max-w-xl"
            >
              {/* Title */}
              <h3 className="font-display text-xl sm:text-2xl md:text-4xl lg:text-5xl text-foreground tracking-wide mb-1 sm:mb-2 line-clamp-2">
                {currentBanner.title}
              </h3>
              
              {/* Subtitle */}
              {getSubtitle(currentBanner) && (
                <p className="text-sm sm:text-base text-muted-foreground mb-3 sm:mb-4">
                  {getSubtitle(currentBanner)}
                </p>
              )}
              
              {/* Badge Button - Auto badge for match banners */}
              {(() => {
                const autoBadge = getAutoBadge(currentBanner);
                return autoBadge && autoBadge !== 'none' ? (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.3, delay: 0.4 }}
                  >
                    {getBadgeContent(autoBadge)}
                  </motion.div>
                ) : null;
              })()}
            </motion.div>
          </div>

          {/* Team Logos - only for match banners */}
          {currentBanner.banner_type === 'match' && currentBanner.match && (
            <div className="absolute top-4 right-4 sm:top-6 sm:right-6 md:top-8 md:right-8 hidden sm:flex items-center gap-3">
              {currentBanner.match.team_a?.logo_url && (
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.4, delay: 0.3 }}
                  className="w-12 h-12 md:w-16 md:h-16 rounded-full bg-background/80 backdrop-blur p-2 shadow-lg"
                >
                  <img 
                    src={currentBanner.match.team_a.logo_url} 
                    alt={currentBanner.match.team_a.name}
                    className="w-full h-full object-contain"
                  />
                </motion.div>
              )}
              <span className="text-foreground/60 text-sm font-medium">vs</span>
              {currentBanner.match.team_b?.logo_url && (
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.4, delay: 0.4 }}
                  className="w-12 h-12 md:w-16 md:h-16 rounded-full bg-background/80 backdrop-blur p-2 shadow-lg"
                >
                  <img 
                    src={currentBanner.match.team_b.logo_url} 
                    alt={currentBanner.match.team_b.name}
                    className="w-full h-full object-contain"
                  />
                </motion.div>
              )}
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Navigation Arrows - positioned at top to avoid text overlap */}
      {banners.length > 1 && (
        <>
          <button
            onClick={(e) => { e.stopPropagation(); goToPrev(); }}
            className="absolute left-2 sm:left-4 top-4 sm:top-1/3 w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-background/80 backdrop-blur flex items-center justify-center text-foreground hover:bg-background transition-all hover:scale-110 shadow-lg z-10"
          >
            <ChevronLeft className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); goToNext(); }}
            className="absolute right-2 sm:right-4 top-4 sm:top-1/3 w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-background/80 backdrop-blur flex items-center justify-center text-foreground hover:bg-background transition-all hover:scale-110 shadow-lg z-10"
          >
            <ChevronRight className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>

          {/* Pagination Dots */}
          <div className="absolute bottom-2 sm:bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5 sm:gap-2">
            {banners.map((_, idx) => (
              <button
                key={idx}
                onClick={(e) => { e.stopPropagation(); setCurrentIndex(idx); }}
                className={`h-2 rounded-full transition-all duration-300 ${
                  idx === currentIndex 
                    ? 'bg-primary w-6 sm:w-8' 
                    : 'bg-foreground/30 hover:bg-foreground/50 w-2'
                }`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default BannerSlider;