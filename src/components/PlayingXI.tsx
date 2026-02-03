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

const getRoleBadgeColor = (role: string | null): string => {
  const roleLower = (role || '').toLowerCase();
  
  if (roleLower.includes('all') || roleLower.includes('rounder')) {
    return 'bg-purple-500/20 text-purple-300 border-purple-500/30';
  }
  if (roleLower.includes('bowl') || roleLower.includes('fast') || roleLower.includes('spin') || roleLower.includes('medium')) {
    return 'bg-red-500/20 text-red-300 border-red-500/30';
  }
  if (roleLower.includes('bat') || roleLower.includes('open')) {
    return 'bg-green-500/20 text-green-300 border-green-500/30';
  }
  if (roleLower.includes('keep') || roleLower.includes('wk')) {
    return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30';
  }
  
  return 'bg-muted/50 text-muted-foreground border-border/50';
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
      transition={{ delay: index * 0.03 }}
      className={`flex items-center justify-between py-2.5 px-3 rounded-lg transition-all duration-200 border ${
        isBench 
          ? 'bg-gradient-to-r from-muted/20 to-muted/10 border-border/20 opacity-70' 
          : 'bg-gradient-to-r from-muted/40 to-muted/20 hover:from-muted/60 hover:to-muted/40 border-border/30 hover:border-border/50'
      }`}
    >
      <div className="flex items-center gap-3">
        {/* Order number */}
        <span className={`w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center ${
          isBench ? 'bg-muted/30 text-muted-foreground' : 'bg-primary/20 text-primary'
        }`}>
          {isBench ? 'B' : index + 1}
        </span>
        
        {/* Role icon */}
        <div className="w-6 flex items-center justify-center">
          {getRoleIcon(player.player_role, player.is_wicket_keeper)}
        </div>
        
        {/* Player name */}
        <span className={`text-sm font-medium ${isBench ? 'text-muted-foreground' : ''}`}>{player.player_name}</span>
        
        {/* Captain/VC/WK badges */}
        <div className="flex items-center gap-1">
          {player.is_captain && (
            <Badge className="text-[9px] px-1.5 py-0 bg-amber-500/20 text-amber-400 border-amber-500/30 flex items-center gap-0.5">
              <Star className="w-2.5 h-2.5" />
              C
            </Badge>
          )}
          {player.is_vice_captain && (
            <Badge className="text-[9px] px-1.5 py-0 bg-blue-500/20 text-blue-400 border-blue-500/30 flex items-center gap-0.5">
              <Zap className="w-2.5 h-2.5" />
              VC
            </Badge>
          )}
          {player.is_wicket_keeper && (
            <Badge className="text-[9px] px-1.5 py-0 bg-emerald-500/20 text-emerald-400 border-emerald-500/30 flex items-center gap-0.5">
              <Shield className="w-2.5 h-2.5" />
              WK
            </Badge>
          )}
        </div>
      </div>
      
      {/* Player role badge */}
      {player.player_role && (
        <Badge 
          variant="outline" 
          className={`text-[10px] px-2 py-0.5 font-medium ${getRoleBadgeColor(player.player_role)}`}
        >
          {player.player_role}
        </Badge>
      )}
    </motion.div>
  );

  const renderTeamPlayers = (playingXI: Player[], bench: Player[]) => (
    <div className="space-y-2">
      {/* Playing XI */}
      {playingXI.map((player, index) => renderPlayer(player, index, false))}
      
      {/* Bench section */}
      {bench.length > 0 && (
        <div className="mt-4">
          <div className="flex items-center gap-2 mb-2 pt-2 border-t border-border/30">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Bench</span>
            <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-muted/30">
              {bench.length}
            </Badge>
          </div>
          {bench.map((player, index) => renderPlayer(player, index, true))}
        </div>
      )}
    </div>
  );

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

          {/* Role Legend */}
          <div className="mt-4 pt-3 border-t border-border/30">
            <div className="flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground">
              <div className="flex items-center gap-1"><BatIcon /> Batsman</div>
              <div className="flex items-center gap-1"><BallIcon /> Bowler</div>
              <div className="flex items-center gap-1"><AllRounderIcon /> All-Rounder</div>
              <div className="flex items-center gap-1"><WicketKeeperIcon /> Wicket Keeper</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
};

export default PlayingXI;
