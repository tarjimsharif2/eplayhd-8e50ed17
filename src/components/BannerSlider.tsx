import { useActiveBanners, Banner } from "@/hooks/useSportsData";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight, Play, Clock, Radio } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

const BannerSlider = () => {
  const { data: banners, isLoading } = useActiveBanners();
  const [currentIndex, setCurrentIndex] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    if (!banners || banners.length <= 1) return;
    
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % banners.length);
    }, 6000);

    return () => clearInterval(interval);
  }, [banners]);

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
    if (banner.banner_type === 'match' && banner.match_id && banner.match) {
      // Navigate to match page
      const matchSlug = banner.match.id;
      navigate(`/match/${matchSlug}`);
    } else if (banner.banner_type === 'tournament' && banner.tournament_id && banner.tournament) {
      // Navigate to tournament page
      const tournamentSlug = banner.tournament.slug || banner.tournament.id;
      navigate(`/tournament/${tournamentSlug}`);
    } else if (banner.link_url) {
      window.open(banner.link_url, '_blank', 'noopener,noreferrer');
    }
  };

  const getBadgeContent = (badge: Banner['badge_type']) => {
    switch (badge) {
      case 'live':
        return (
          <span className="inline-flex items-center gap-1.5 bg-destructive text-destructive-foreground px-3 py-1.5 rounded-full text-sm font-semibold shadow-lg">
            <Radio className="w-3.5 h-3.5 animate-pulse" />
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
              
              {/* Badge Button */}
              {currentBanner.badge_type && currentBanner.badge_type !== 'none' && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.3, delay: 0.4 }}
                >
                  {getBadgeContent(currentBanner.badge_type)}
                </motion.div>
              )}
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

      {/* Navigation Arrows */}
      {banners.length > 1 && (
        <>
          <button
            onClick={(e) => { e.stopPropagation(); goToPrev(); }}
            className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-background/80 backdrop-blur flex items-center justify-center text-foreground hover:bg-background transition-all hover:scale-110 shadow-lg"
          >
            <ChevronLeft className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); goToNext(); }}
            className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-background/80 backdrop-blur flex items-center justify-center text-foreground hover:bg-background transition-all hover:scale-110 shadow-lg"
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