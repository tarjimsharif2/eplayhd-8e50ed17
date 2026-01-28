import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Wrench, Clock, Mail, Twitter, Facebook, MessageCircle } from 'lucide-react';
import { usePublicSiteSettings, PublicSiteSettings } from '@/hooks/usePublicSiteSettings';

interface MaintenancePageProps {
  settings?: Partial<PublicSiteSettings> & {
    logo_url?: string;
    site_name?: string;
  };
}

export default function MaintenancePage({ settings }: MaintenancePageProps) {
  const { data: siteSettings } = usePublicSiteSettings();
  const config = settings || siteSettings;
  
  const [timeLeft, setTimeLeft] = useState({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
  });

  // Countdown timer
  useEffect(() => {
    if (!config?.maintenance_show_countdown || !config?.maintenance_end_time) return;

    const calculateTimeLeft = () => {
      const endTime = new Date(config.maintenance_end_time!).getTime();
      const now = new Date().getTime();
      const difference = endTime - now;

      if (difference > 0) {
        setTimeLeft({
          days: Math.floor(difference / (1000 * 60 * 60 * 24)),
          hours: Math.floor((difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
          minutes: Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60)),
          seconds: Math.floor((difference % (1000 * 60)) / 1000),
        });
      }
    };

    calculateTimeLeft();
    const timer = setInterval(calculateTimeLeft, 1000);
    return () => clearInterval(timer);
  }, [config?.maintenance_show_countdown, config?.maintenance_end_time]);

  const title = config?.maintenance_title || "We'll Be Right Back";
  const subtitle = config?.maintenance_subtitle || "Our site is currently undergoing scheduled maintenance.";
  const description = config?.maintenance_description || "We're working hard to improve your experience. Thank you for your patience.";
  const estimatedTime = config?.maintenance_estimated_time;
  const contactEmail = config?.maintenance_contact_email;
  const socialMessage = config?.maintenance_social_message || "Follow us for updates";
  const logoUrl = config?.logo_url;
  const siteName = config?.site_name || "Live Sports";

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 flex items-center justify-center p-4 overflow-hidden relative">
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden">
        <motion.div
          className="absolute -top-40 -right-40 w-96 h-96 bg-primary/10 rounded-full blur-3xl"
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.3, 0.5, 0.3],
          }}
          transition={{
            duration: 8,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
        <motion.div
          className="absolute -bottom-40 -left-40 w-96 h-96 bg-accent/10 rounded-full blur-3xl"
          animate={{
            scale: [1.2, 1, 1.2],
            opacity: [0.3, 0.5, 0.3],
          }}
          transition={{
            duration: 10,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        className="relative z-10 max-w-2xl w-full text-center"
      >
        {/* Logo */}
        {logoUrl && (
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.5 }}
            className="mb-8"
          >
            <img
              src={logoUrl}
              alt={siteName}
              className="h-16 w-auto mx-auto object-contain"
            />
          </motion.div>
        )}

        {/* Animated Icon */}
        <motion.div
          initial={{ rotate: 0 }}
          animate={{ rotate: 360 }}
          transition={{
            duration: 20,
            repeat: Infinity,
            ease: "linear",
          }}
          className="inline-block mb-8"
        >
          <div className="relative">
            <motion.div
              animate={{
                scale: [1, 1.1, 1],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: "easeInOut",
              }}
              className="w-24 h-24 bg-gradient-to-br from-primary to-primary/60 rounded-full flex items-center justify-center shadow-2xl shadow-primary/30"
            >
              <Wrench className="w-12 h-12 text-primary-foreground" />
            </motion.div>
            
            {/* Orbiting dots */}
            <motion.div
              className="absolute top-0 left-1/2 w-3 h-3 bg-accent rounded-full -translate-x-1/2 -translate-y-1"
              animate={{ rotate: 360 }}
              transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
              style={{ transformOrigin: "50% 50px" }}
            />
          </div>
        </motion.div>

        {/* Title */}
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.6 }}
          className="text-4xl md:text-5xl font-display font-bold bg-gradient-to-r from-foreground via-primary to-foreground bg-clip-text text-transparent mb-4"
        >
          {title}
        </motion.h1>

        {/* Subtitle */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.6 }}
          className="text-xl text-muted-foreground mb-2"
        >
          {subtitle}
        </motion.p>

        {/* Description */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.6 }}
          className="text-muted-foreground/80 mb-8 max-w-lg mx-auto"
        >
          {description}
        </motion.p>

        {/* Countdown Timer */}
        {config?.maintenance_show_countdown && config?.maintenance_end_time && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.6, duration: 0.5 }}
            className="grid grid-cols-4 gap-3 md:gap-4 max-w-md mx-auto mb-8"
          >
            {[
              { value: timeLeft.days, label: 'Days' },
              { value: timeLeft.hours, label: 'Hours' },
              { value: timeLeft.minutes, label: 'Minutes' },
              { value: timeLeft.seconds, label: 'Seconds' },
            ].map((item, index) => (
              <motion.div
                key={item.label}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.7 + index * 0.1 }}
                className="bg-card/50 backdrop-blur-sm border border-border/50 rounded-xl p-3 md:p-4"
              >
                <div className="text-2xl md:text-4xl font-bold text-primary tabular-nums">
                  {String(item.value).padStart(2, '0')}
                </div>
                <div className="text-xs md:text-sm text-muted-foreground uppercase tracking-wider">
                  {item.label}
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}

        {/* Estimated Time */}
        {estimatedTime && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8, duration: 0.5 }}
            className="flex items-center justify-center gap-2 text-muted-foreground mb-6"
          >
            <Clock className="w-4 h-4" />
            <span>Estimated time: {estimatedTime}</span>
          </motion.div>
        )}

        {/* Contact & Social */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.9, duration: 0.5 }}
          className="space-y-4"
        >
          {contactEmail && (
            <a
              href={`mailto:${contactEmail}`}
              className="inline-flex items-center gap-2 text-primary hover:text-primary/80 transition-colors"
            >
              <Mail className="w-4 h-4" />
              <span>{contactEmail}</span>
            </a>
          )}

          {/* Social Links */}
          <div className="flex flex-col items-center gap-3">
            <p className="text-sm text-muted-foreground">{socialMessage}</p>
            <div className="flex items-center gap-4">
              {config?.twitter_handle && (
                <a
                  href={`https://twitter.com/${config.twitter_handle}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-10 h-10 bg-card/50 backdrop-blur-sm border border-border/50 rounded-full flex items-center justify-center text-muted-foreground hover:text-primary hover:border-primary/50 transition-all"
                >
                  <Twitter className="w-4 h-4" />
                </a>
              )}
              {config?.facebook_app_id && (
                <a
                  href={`https://facebook.com/${config.facebook_app_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-10 h-10 bg-card/50 backdrop-blur-sm border border-border/50 rounded-full flex items-center justify-center text-muted-foreground hover:text-primary hover:border-primary/50 transition-all"
                >
                  <Facebook className="w-4 h-4" />
                </a>
              )}
              {config?.telegram_link && (
                <a
                  href={config.telegram_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-10 h-10 bg-card/50 backdrop-blur-sm border border-border/50 rounded-full flex items-center justify-center text-muted-foreground hover:text-primary hover:border-primary/50 transition-all"
                >
                  <MessageCircle className="w-4 h-4" />
                </a>
              )}
            </div>
          </div>
        </motion.div>

        {/* Progress bar animation */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1, duration: 0.5 }}
          className="mt-12 max-w-xs mx-auto"
        >
          <div className="h-1 bg-border/50 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-gradient-to-r from-primary to-accent"
              initial={{ x: "-100%" }}
              animate={{ x: "100%" }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: "easeInOut",
              }}
              style={{ width: "50%" }}
            />
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}
