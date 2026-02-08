import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Users, Shield, Star, Zap } from 'lucide-react';
import { motion } from 'framer-motion';

// Cricket role icons - using emojis for cricket bat/ball
const BatIcon = () => (
  <span className="text-xs" title="Batsman">🏏</span>
);

const BallIcon = () => (
  <span className="text-xs" title="Bowler">⚾</span>
);

const AllRounderIcon = () => (
  <div className="flex items-center gap-0.5" title="All-Rounder">
    <span className="text-xs">🏏</span>
    <span className="text-xs">⚾</span>
  </div>
);

const WicketKeeperIcon = () => (
  <span className="text-xs" title="Wicket Keeper">🧤</span>
);

interface Player {
  id: string;
  match_id: string;
  team_id: string;
  player_name: string;
  player_role: string | null;
  is_captain: boolean;
  is_vice_captain: boolean;
  is_wicket_keeper: boolean;
  batting_order: number | null;
  is_bench?: boolean;
  change_status?: string | null;
  player_image?: string | null;
}

interface PlayingXIProps {
  matchId: string;
  teamAId: string;
  teamBId: string;
  teamAName: string;
  teamBName: string;
  teamALogo?: string | null;
  teamBLogo?: string | null;
}

export const usePlayingXI = (matchId: string | undefined) => {
  return useQuery({
    queryKey: ['playing_xi', matchId],
    queryFn: async () => {
      if (!matchId) return [];
      
      const { data, error } = await supabase
        .from('match_playing_xi')
        .select('*')
        .eq('match_id', matchId)
        .order('batting_order', { ascending: true, nullsFirst: false });
      
      if (error) throw error;
      return data as Player[];
    },
    enabled: !!matchId,
  });
};

const getRoleIcon = (role: string | null, isWicketKeeper: boolean) => {
  if (isWicketKeeper) return <WicketKeeperIcon />;
  
  const roleLower = (role || '').toLowerCase();
  
  if (roleLower.includes('all') || roleLower.includes('rounder')) {
    return <AllRounderIcon />;
  }
  if (roleLower.includes('bowl') || roleLower.includes('fast') || roleLower.includes('spin') || roleLower.includes('medium')) {
    return <BallIcon />;
  }
  if (roleLower.includes('bat') || roleLower.includes('open')) {
    return <BatIcon />;
  }
  if (roleLower.includes('keep') || roleLower.includes('wk')) {
    return <WicketKeeperIcon />;
  }
  
  // Default to batsman icon if no specific role
  return <BatIcon />;
};

// Get short role name for display
const getShortRoleName = (role: string | null): string => {
  const roleLower = (role || '').toLowerCase();
  
  if (roleLower.includes('batting') && roleLower.includes('all')) return 'Bat AR';
  if (roleLower.includes('bowling') && roleLower.includes('all')) return 'Bowl AR';
  if (roleLower.includes('all') || roleLower.includes('rounder')) return 'AR';
  if (roleLower.includes('fast') || roleLower.includes('pacer')) return 'Fast';
  if (roleLower.includes('spin')) return 'Spin';
  if (roleLower.includes('medium')) return 'Med';
  if (roleLower.includes('bowl')) return 'Bowl';
  if (roleLower.includes('open')) return 'Open';
  if (roleLower.includes('bat')) return 'Bat';
  if (roleLower.includes('wk') || roleLower.includes('keep')) return 'WK';
  
  // Return first word if short enough, otherwise abbreviate
  const firstWord = (role || '').split(' ')[0];
  return firstWord.length <= 6 ? firstWord : firstWord.slice(0, 5);
};

const getRoleBadgeColor = (role: string | null): string => {
  const roleLower = (role || '').toLowerCase();
  
  if (roleLower.includes('all') || roleLower.includes('rounder')) {
    return 'bg-purple-500/20 text-purple-300';
  }
  if (roleLower.includes('bowl') || roleLower.includes('fast') || roleLower.includes('spin') || roleLower.includes('medium')) {
    return 'bg-red-500/20 text-red-300';
  }
  if (roleLower.includes('bat') || roleLower.includes('open')) {
    return 'bg-green-500/20 text-green-300';
  }
  if (roleLower.includes('keep') || roleLower.includes('wk')) {
    return 'bg-yellow-500/20 text-yellow-300';
  }
  
  return 'bg-muted/50 text-muted-foreground';
};

const PlayingXI = ({ matchId, teamAId, teamBId, teamAName, teamBName, teamALogo, teamBLogo }: PlayingXIProps) => {
  const { data: players, isLoading } = usePlayingXI(matchId);

  if (isLoading) {
    return null;
  }

  // Separate playing XI and bench players
  const teamAPlayingXI = players?.filter(p => p.team_id === teamAId && !p.is_bench) || [];
  const teamABench = players?.filter(p => p.team_id === teamAId && p.is_bench) || [];
  const teamBPlayingXI = players?.filter(p => p.team_id === teamBId && !p.is_bench) || [];
  const teamBBench = players?.filter(p => p.team_id === teamBId && p.is_bench) || [];

  const teamAPlayers = [...teamAPlayingXI, ...teamABench];
  const teamBPlayers = [...teamBPlayingXI, ...teamBBench];

  // Show placeholder message if no players yet
  if (teamAPlayers.length === 0 && teamBPlayers.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <Card className="overflow-hidden border-border/50 bg-gradient-to-br from-card via-card to-card/80 backdrop-blur shadow-lg">
          <CardHeader className="pb-4 bg-gradient-to-r from-primary/10 via-transparent to-primary/5">
            <CardTitle className="flex items-center gap-3 text-lg">
              <div className="w-9 h-9 rounded-lg bg-primary/20 flex items-center justify-center">
                <Users className="w-5 h-5 text-primary" />
              </div>
              <div>
                <span>Playing XI</span>
                <p className="text-xs font-normal text-muted-foreground mt-0.5">
                  Starting lineup for both teams
                </p>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="py-8">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted/50 flex items-center justify-center">
                <Users className="w-8 h-8 text-muted-foreground/50" />
              </div>
              <p className="text-muted-foreground text-sm">
                Playing XI will be displayed as soon as it is published before the match starts.
              </p>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    );
  }

  const renderPlayer = (player: Player, index: number, isBench: boolean = false) => (
    <motion.div 
      key={player.id} 
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.02 }}
      className={`flex items-center justify-between py-1.5 px-2 rounded transition-all duration-200 ${
        isBench 
          ? 'bg-muted/10 opacity-60' 
          : 'bg-muted/20 hover:bg-muted/30'
      } ${player.change_status === 'in' ? 'border-l-2 border-green-500' : ''} ${player.change_status === 'out' ? 'border-l-2 border-red-500 opacity-50' : ''}`}
    >
      <div className="flex items-center gap-2 min-w-0 flex-1">
        {/* Player image or order number */}
        {player.player_image ? (
          <img 
            src={player.player_image} 
            alt={player.player_name}
            className="w-6 h-6 rounded-full object-cover flex-shrink-0 bg-muted/30"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
              const fallback = (e.target as HTMLImageElement).nextElementSibling;
              if (fallback) (fallback as HTMLElement).style.display = 'flex';
            }}
          />
        ) : null}
        <span className={`w-4 h-4 rounded-full text-[9px] font-bold flex items-center justify-center flex-shrink-0 ${
          isBench ? 'bg-muted/30 text-muted-foreground' : 'bg-primary/20 text-primary'
        } ${player.player_image ? 'hidden' : ''}`}>
          {isBench ? 'B' : index + 1}
        </span>
        
        {/* Role icon */}
        <div className="w-4 flex items-center justify-center flex-shrink-0">
          {getRoleIcon(player.player_role, player.is_wicket_keeper)}
        </div>
        
        {/* Player name */}
        <span className={`text-xs font-medium truncate ${isBench ? 'text-muted-foreground' : ''}`}>
          {player.player_name}
        </span>
        
        {/* Captain/VC/WK badges - compact inline */}
        {(player.is_captain || player.is_vice_captain || player.is_wicket_keeper) && (
          <div className="flex items-center gap-0.5 flex-shrink-0">
            {player.is_captain && (
              <span className="text-[8px] px-1 py-0 bg-amber-500/20 text-amber-400 rounded font-bold">C</span>
            )}
            {player.is_vice_captain && (
              <span className="text-[8px] px-1 py-0 bg-blue-500/20 text-blue-400 rounded font-bold">VC</span>
            )}
            {player.is_wicket_keeper && (
              <span className="text-[8px] px-1 py-0 bg-emerald-500/20 text-emerald-400 rounded font-bold">WK</span>
            )}
          </div>
        )}
        
        {/* IN/OUT Status Badge - after player name */}
        {player.change_status === 'in' && (
          <span className="text-[7px] px-1 py-0 bg-green-500/30 text-green-400 rounded font-bold flex-shrink-0">
            IN
          </span>
        )}
        {player.change_status === 'out' && (
          <span className="text-[7px] px-1 py-0 bg-red-500/30 text-red-400 rounded font-bold flex-shrink-0">
            OUT
          </span>
        )}
      </div>
      
      {/* Player role badge - full name */}
      {player.player_role && (
        <span className={`text-[8px] px-1 py-0.5 rounded font-medium flex-shrink-0 ml-1 whitespace-nowrap ${getRoleBadgeColor(player.player_role)}`}>
          {player.player_role}
        </span>
      )}
    </motion.div>
  );

  const renderTeamPlayers = (playingXI: Player[], bench: Player[]) => {
    // If no Playing XI selected, show all as "Full Squad"
    const hasPlayingXI = playingXI.length > 0;
    
    return (
      <div className="space-y-1">
        {/* Playing XI - only show if there are selected players */}
        {hasPlayingXI && (
          <>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-medium text-primary uppercase tracking-wide">Playing XI</span>
              <Badge variant="outline" className="text-[8px] px-1 py-0 bg-primary/20 text-primary border-primary/30">
                {playingXI.length}
              </Badge>
            </div>
            <div className="space-y-0.5">
              {playingXI.map((player, index) => renderPlayer(player, index, false))}
            </div>
          </>
        )}
        
        {/* Full Squad / Bench section */}
        {bench.length > 0 && (
          <div className={hasPlayingXI ? "mt-2" : ""}>
            <div className={`flex items-center gap-2 mb-1 ${hasPlayingXI ? "pt-2 border-t border-border/30" : ""}`}>
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                {hasPlayingXI ? "Bench" : "Full Squad"}
              </span>
              <Badge variant="outline" className="text-[8px] px-1 py-0 bg-muted/30">
                {bench.length}
              </Badge>
            </div>
            <div className="space-y-0.5">
              {bench.map((player, index) => renderPlayer(player, index, !hasPlayingXI ? false : true))}
            </div>
          </div>
        )}
      </div>
    );
  };

  // Check if any team has Playing XI selected (not just bench players)
  const hasAnyPlayingXI = teamAPlayingXI.length > 0 || teamBPlayingXI.length > 0;
  const sectionTitle = hasAnyPlayingXI ? "Playing XI" : "Full Squad";
  const sectionSubtitle = hasAnyPlayingXI 
    ? "Starting lineup for both teams" 
    : "Squad players for both teams";

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
    >
      <Card className="overflow-hidden border-border/50 bg-gradient-to-br from-card via-card to-card/80 backdrop-blur shadow-lg">
        <CardHeader className="pb-4 bg-gradient-to-r from-primary/10 via-transparent to-primary/5">
          <CardTitle className="flex items-center gap-3 text-lg">
            <div className="w-9 h-9 rounded-lg bg-primary/20 flex items-center justify-center">
              <Users className="w-5 h-5 text-primary" />
            </div>
            <div>
              <span>{sectionTitle}</span>
              <p className="text-xs font-normal text-muted-foreground mt-0.5">
                {sectionSubtitle}
              </p>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-2">
          <Tabs defaultValue="teamA" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-4">
              <TabsTrigger value="teamA" className="flex items-center gap-2 text-xs sm:text-sm">
                {teamALogo && (
                  <img src={teamALogo} alt={teamAName} className="w-5 h-5 object-contain rounded" />
                )}
                <span className="truncate">{teamAName.split(' ').slice(0, 2).join(' ')}</span>
                <Badge variant="secondary" className="text-[9px] px-1 py-0 hidden sm:inline-flex">
                  {teamAPlayers.length}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="teamB" className="flex items-center gap-2 text-xs sm:text-sm">
                {teamBLogo && (
                  <img src={teamBLogo} alt={teamBName} className="w-5 h-5 object-contain rounded" />
                )}
                <span className="truncate">{teamBName.split(' ').slice(0, 2).join(' ')}</span>
                <Badge variant="secondary" className="text-[9px] px-1 py-0 hidden sm:inline-flex">
                  {teamBPlayers.length}
                </Badge>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="teamA" className="mt-0">
              {teamAPlayers.length > 0 ? (
                <motion.div
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  {renderTeamPlayers(teamAPlayingXI, teamABench)}
                </motion.div>
              ) : (
                <p className="text-center text-muted-foreground text-sm py-4">No players added</p>
              )}
            </TabsContent>

            <TabsContent value="teamB" className="mt-0">
              {teamBPlayers.length > 0 ? (
                <motion.div
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  {renderTeamPlayers(teamBPlayingXI, teamBBench)}
                </motion.div>
              ) : (
                <p className="text-center text-muted-foreground text-sm py-4">No players added</p>
              )}
            </TabsContent>
          </Tabs>

          {/* Role Legend - more compact */}
          <div className="mt-3 pt-2 border-t border-border/30">
            <div className="flex flex-wrap items-center gap-2 text-[9px] text-muted-foreground">
              <div className="flex items-center gap-0.5"><BatIcon /> Bat</div>
              <div className="flex items-center gap-0.5"><BallIcon /> Bowl</div>
              <div className="flex items-center gap-0.5"><AllRounderIcon /> AR</div>
              <div className="flex items-center gap-0.5"><WicketKeeperIcon /> WK</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
};

export default PlayingXI;
