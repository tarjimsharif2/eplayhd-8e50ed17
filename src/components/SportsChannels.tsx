import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
    <section className="py-8">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2.5 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 border border-primary/20">
          <Radio className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h2 className="font-display text-2xl text-gradient">Sports Channels</h2>
          <p className="text-sm text-muted-foreground">Watch live sports on popular channels</p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
        {channels.map((channel, index) => (
          <motion.div
            key={channel.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
          >
            <Link to={`/channel/${channel.slug || channel.id}`}>
              <Card className="group hover:border-primary/50 transition-all duration-300 hover:shadow-lg hover:shadow-primary/10 overflow-hidden h-full">
                <CardContent className="p-4 flex flex-col items-center text-center gap-3">
                  {/* Channel Logo */}
                  <div 
                    className="w-16 h-16 rounded-xl flex items-center justify-center p-2 border border-border/30 group-hover:border-primary/30 transition-colors"
                    style={{ backgroundColor: channel.logo_background_color || '#1a1a2e' }}
                  >
                    {channel.logo_url ? (
                      <img 
                        src={channel.logo_url} 
                        alt={channel.name} 
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <Tv className="w-8 h-8 text-muted-foreground" />
                    )}
                  </div>

                  {/* Channel Name */}
                  <h3 className="font-semibold text-sm line-clamp-2 group-hover:text-primary transition-colors">
                    {channel.name}
                  </h3>

                  {/* Live Badge */}
                  <Badge variant="live" className="text-xs">
                    <span className="w-1.5 h-1.5 bg-current rounded-full mr-1.5 animate-pulse" />
                    Watch Live
                  </Badge>
                </CardContent>
              </Card>
            </Link>
          </motion.div>
        ))}
      </div>
    </section>
  );
};

export default SportsChannels;
