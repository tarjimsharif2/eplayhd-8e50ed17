import { Link } from 'react-router-dom';
import { useChannels } from '@/hooks/useChannels';
import { Tv, Radio, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';

const SportsChannels = () => {
  const { data: channels, isLoading } = useChannels();

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!channels || channels.length === 0) {
    return null;
  }

  return (
    <section className="py-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 rounded-lg bg-gradient-to-br from-primary/20 to-accent/20 border border-primary/20">
          <Radio className="w-4 h-4 text-primary" />
        </div>
        <h2 className="font-display text-xl text-gradient">Sports Channels</h2>
      </div>

      <div className="flex flex-wrap gap-3">
        {channels.map((channel, index) => (
          <motion.div
            key={channel.id}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: index * 0.02 }}
          >
            <Link to={`/channel/${channel.slug || channel.id}`}>
              <div className="group flex items-center gap-3 px-4 py-2.5 rounded-full bg-card border border-border/50 hover:border-primary/50 hover:bg-primary/5 transition-all duration-200">
                {/* Channel Logo */}
                <div 
                  className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 border border-border/30"
                  style={{ backgroundColor: channel.logo_background_color || '#1a1a2e' }}
                >
                  {channel.logo_url ? (
                    <img 
                      src={channel.logo_url} 
                      alt={channel.name} 
                      className="w-6 h-6 object-contain"
                    />
                  ) : (
                    <Tv className="w-5 h-5 text-muted-foreground" />
                  )}
                </div>

                {/* Channel Name */}
                <span className="font-semibold text-base group-hover:text-primary transition-colors whitespace-nowrap">
                  {channel.name}
                </span>

                {/* Watch Badge */}
                <span className="flex items-center gap-1.5 text-xs font-medium text-green-500 bg-green-500/10 px-2 py-1 rounded-full">
                  <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                  Watch
                </span>
              </div>
            </Link>
          </motion.div>
        ))}
      </div>
    </section>
  );
};

export default SportsChannels;
