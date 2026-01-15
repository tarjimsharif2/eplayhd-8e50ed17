import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Trophy, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { motion } from 'framer-motion';
import { Team } from '@/hooks/useSportsData';

export interface PointsTableEntry {
  id: string;
  tournament_id: string;
  team_id: string;
  position: number;
  played: number;
  won: number;
  lost: number;
  tied: number;
  no_result: number;
  net_run_rate: number;
  points: number;
  team?: Team;
}

export const usePointsTable = (tournamentId: string | undefined) => {
  return useQuery({
    queryKey: ['points_table', tournamentId],
    queryFn: async () => {
      if (!tournamentId) return [];
      
      const { data, error } = await supabase
        .from('tournament_points_table')
        .select(`
          *,
          team:teams(*)
        `)
        .eq('tournament_id', tournamentId)
        .order('position', { ascending: true });
      
      if (error) throw error;
      return data as PointsTableEntry[];
    },
    enabled: !!tournamentId,
  });
};

interface PointsTableProps {
  tournamentId: string;
  tournamentName?: string;
  compact?: boolean;
  groupName?: string;
}

const PointsTable = ({ tournamentId, tournamentName, compact = false, groupName }: PointsTableProps) => {
  const { data: entries, isLoading } = usePointsTable(tournamentId);

  if (isLoading) {
    return null;
  }

  if (!entries || entries.length === 0) {
    return null;
  }

  // Determine qualification zone (top 4 typically qualify)
  const qualificationZone = 4;

  const getPositionBadge = (position: number) => {
    if (position === 1) {
      return (
        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-yellow-400 to-yellow-600 flex items-center justify-center text-xs font-bold text-black shadow-lg">
          {position}
        </div>
      );
    }
    if (position === 2) {
      return (
        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-gray-300 to-gray-500 flex items-center justify-center text-xs font-bold text-black shadow-md">
          {position}
        </div>
      );
    }
    if (position === 3) {
      return (
        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-amber-600 to-amber-800 flex items-center justify-center text-xs font-bold text-white shadow-md">
          {position}
        </div>
      );
    }
    if (position <= qualificationZone) {
      return (
        <div className="w-6 h-6 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center text-xs font-semibold text-primary">
          {position}
        </div>
      );
    }
    return (
      <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs font-medium text-muted-foreground">
        {position}
      </div>
    );
  };

  const getNrrIcon = (nrr: number) => {
    if (nrr > 0) return <TrendingUp className="w-3 h-3 text-green-500" />;
    if (nrr < 0) return <TrendingDown className="w-3 h-3 text-red-500" />;
    return <Minus className="w-3 h-3 text-muted-foreground" />;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
    >
      <Card className="overflow-hidden border-border/50 bg-gradient-to-b from-card to-card/80 backdrop-blur shadow-xl">
        <CardHeader className="pb-3 px-4 sm:px-6 bg-gradient-to-r from-primary/10 via-transparent to-accent/10 border-b border-border/30">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                <Trophy className="w-4 h-4 text-primary" />
              </div>
              <span className="truncate">
                {groupName ? groupName : (tournamentName ? `${tournamentName} - Points Table` : 'Points Table')}
              </span>
            </CardTitle>
            <Badge variant="outline" className="text-xs">
              {entries.length} Teams
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {/* Mobile Card View */}
          <div className="block sm:hidden divide-y divide-border/20">
            {entries.map((entry, index) => {
              const position = entry.position || index + 1;
              const isQualified = position <= qualificationZone;
              
              return (
                <motion.div 
                  key={entry.id} 
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className={`p-4 ${isQualified ? 'bg-gradient-to-r from-primary/5 to-transparent border-l-2 border-primary/50' : ''}`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      {getPositionBadge(position)}
                      <div className="flex items-center gap-2">
                        {entry.team?.logo_url ? (
                          <img 
                            src={entry.team.logo_url} 
                            alt={entry.team.name} 
                            className="w-8 h-8 object-contain"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
                            <span className="text-sm font-bold text-primary">{entry.team?.short_name?.charAt(0)}</span>
                          </div>
                        )}
                        <div>
                          <span className="font-semibold text-sm block">{entry.team?.short_name || entry.team?.name}</span>
                          {entry.team?.name !== entry.team?.short_name && (
                            <span className="text-xs text-muted-foreground">{entry.team?.name}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-primary">{entry.points}</div>
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Points</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-5 gap-2 bg-muted/30 rounded-lg p-2">
                    <div className="text-center">
                      <div className="font-semibold text-foreground">{entry.played}</div>
                      <div className="text-[10px] text-muted-foreground">Played</div>
                    </div>
                    <div className="text-center">
                      <div className="font-semibold text-green-500">{entry.won}</div>
                      <div className="text-[10px] text-muted-foreground">Won</div>
                    </div>
                    <div className="text-center">
                      <div className="font-semibold text-red-500">{entry.lost}</div>
                      <div className="text-[10px] text-muted-foreground">Lost</div>
                    </div>
                    <div className="text-center">
                      <div className="font-semibold text-foreground">{entry.tied + entry.no_result}</div>
                      <div className="text-[10px] text-muted-foreground">T/NR</div>
                    </div>
                    <div className="text-center">
                      <div className={`font-semibold flex items-center justify-center gap-1 ${entry.net_run_rate >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                        {getNrrIcon(entry.net_run_rate)}
                        {entry.net_run_rate >= 0 ? '+' : ''}{entry.net_run_rate.toFixed(3)}
                      </div>
                      <div className="text-[10px] text-muted-foreground">NRR</div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
          
          {/* Desktop Table View */}
          <div className="hidden sm:block">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="w-12 text-center px-2 font-semibold">Pos</TableHead>
                  <TableHead className="px-3 font-semibold">Team</TableHead>
                  <TableHead className="text-center w-12 px-2 font-semibold">P</TableHead>
                  <TableHead className="text-center w-12 px-2 font-semibold">W</TableHead>
                  <TableHead className="text-center w-12 px-2 font-semibold">L</TableHead>
                  {!compact && (
                    <>
                      <TableHead className="text-center w-12 px-2 font-semibold">T</TableHead>
                      <TableHead className="text-center w-12 px-2 font-semibold">NR</TableHead>
                    </>
                  )}
                  <TableHead className="text-center w-20 px-2 font-semibold">NRR</TableHead>
                  <TableHead className="text-center w-14 px-3 font-bold text-primary">Pts</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry, index) => {
                  const position = entry.position || index + 1;
                  const isQualified = position <= qualificationZone;
                  
                  return (
                    <TableRow 
                      key={entry.id} 
                      className={`transition-colors ${isQualified ? 'bg-gradient-to-r from-primary/5 to-transparent hover:from-primary/10' : 'hover:bg-muted/20'}`}
                    >
                      <TableCell className="text-center px-2 py-3">
                        {getPositionBadge(position)}
                      </TableCell>
                      <TableCell className="px-3 py-3">
                        <div className="flex items-center gap-3">
                          {entry.team?.logo_url ? (
                            <img 
                              src={entry.team.logo_url} 
                              alt={entry.team.name} 
                              className="w-7 h-7 object-contain flex-shrink-0"
                            />
                          ) : (
                            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center flex-shrink-0">
                              <span className="text-xs font-bold text-primary">{entry.team?.short_name?.charAt(0)}</span>
                            </div>
                          )}
                          <div>
                            <span className="font-semibold text-sm block">
                              {compact ? entry.team?.short_name : entry.team?.name}
                            </span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-center px-2 py-3 font-medium">{entry.played}</TableCell>
                      <TableCell className="text-center text-green-500 font-semibold px-2 py-3">{entry.won}</TableCell>
                      <TableCell className="text-center text-red-500 font-medium px-2 py-3">{entry.lost}</TableCell>
                      {!compact && (
                        <>
                          <TableCell className="text-center px-2 py-3">{entry.tied}</TableCell>
                          <TableCell className="text-center px-2 py-3">{entry.no_result}</TableCell>
                        </>
                      )}
                      <TableCell className="text-center px-2 py-3">
                        <div className={`flex items-center justify-center gap-1 font-medium ${entry.net_run_rate >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                          {getNrrIcon(entry.net_run_rate)}
                          {entry.net_run_rate >= 0 ? '+' : ''}{entry.net_run_rate.toFixed(3)}
                        </div>
                      </TableCell>
                      <TableCell className="text-center px-3 py-3">
                        <Badge 
                          variant={position <= 2 ? "default" : "secondary"} 
                          className={`font-bold text-sm px-3 ${position <= 2 ? 'bg-primary text-primary-foreground' : ''}`}
                        >
                          {entry.points}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          
          {/* Qualification Legend */}
          <div className="px-4 py-3 bg-muted/20 border-t border-border/30 flex items-center gap-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-primary/50" />
              <span>Top {qualificationZone} Qualify</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="font-medium">P</span>=Played
              <span className="font-medium ml-2">W</span>=Won
              <span className="font-medium ml-2">L</span>=Lost
              <span className="font-medium ml-2">NRR</span>=Net Run Rate
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
};

export default PointsTable;