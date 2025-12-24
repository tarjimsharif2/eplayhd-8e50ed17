import { Badge } from "@/components/ui/badge";
import { Innings } from "@/hooks/useSportsData";

interface InningsDisplayProps {
  innings: Innings[];
  teamAId: string;
  teamBId: string;
  compact?: boolean;
}

const InningsDisplay = ({ innings, teamAId, teamBId, compact = true }: InningsDisplayProps) => {
  if (!innings || innings.length === 0) return null;

  const getOrdinal = (n: number) => {
    const suffixes = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0]);
  };

  const formatScore = (inningsData: Innings) => {
    const wicketDisplay = inningsData.wickets === 10 ? '' : `/${inningsData.wickets}`;
    const declaredTag = inningsData.declared ? 'd' : '';
    return `${inningsData.runs}${wicketDisplay}${declaredTag}`;
  };

  // Group innings by team
  const teamAInnings = innings.filter(i => i.batting_team_id === teamAId);
  const teamBInnings = innings.filter(i => i.batting_team_id === teamBId);

  // Get current innings
  const currentInnings = innings.find(i => i.is_current);

  if (compact) {
    return (
      <div className="w-full space-y-1.5">
        {/* Compact scorecard display */}
        <div className="flex items-center justify-center gap-4 text-xs">
          {innings.map((inningsData) => (
            <div
              key={inningsData.id}
              className={`flex items-center gap-1.5 px-2 py-1 rounded-md ${
                inningsData.is_current
                  ? 'bg-primary/20 border border-primary/30'
                  : 'bg-muted/50'
              }`}
            >
              <span className="text-muted-foreground text-[10px]">
                {getOrdinal(inningsData.innings_number)}
              </span>
              {inningsData.batting_team?.logo_url && (
                <img
                  src={inningsData.batting_team.logo_url}
                  alt=""
                  className="w-3 h-3 object-contain"
                />
              )}
              <span className={`font-semibold ${inningsData.is_current ? 'text-primary' : ''}`}>
                {formatScore(inningsData)}
              </span>
              <span className="text-muted-foreground text-[10px]">
                ({inningsData.overs})
              </span>
              {inningsData.is_current && (
                <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
              )}
            </div>
          ))}
        </div>

        {/* Current innings indicator */}
        {currentInnings && (
          <div className="flex items-center justify-center">
            <Badge className="bg-green-500/20 text-green-600 border-green-500/30 text-[9px] px-2 py-0.5">
              {currentInnings.batting_team?.short_name || 'Team'} batting
            </Badge>
          </div>
        )}
      </div>
    );
  }

  // Full display (for match page)
  return (
    <div className="w-full space-y-3">
      <h4 className="text-sm font-medium text-center text-muted-foreground uppercase tracking-wider">
        Scorecard
      </h4>
      <div className="grid grid-cols-2 gap-4">
        {/* Team A Innings */}
        <div className="space-y-2">
          {teamAInnings.map((inningsData) => (
            <div
              key={inningsData.id}
              className={`p-3 rounded-lg ${
                inningsData.is_current
                  ? 'bg-primary/10 border border-primary/30'
                  : 'bg-muted/30'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  {getOrdinal(inningsData.innings_number)} Innings
                </span>
                {inningsData.is_current && (
                  <Badge className="bg-green-500 text-white text-[9px]">BATTING</Badge>
                )}
                {inningsData.declared && (
                  <Badge variant="secondary" className="text-[9px]">DEC</Badge>
                )}
              </div>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-2xl font-bold text-primary">
                  {formatScore(inningsData)}
                </span>
                <span className="text-sm text-muted-foreground">
                  ({inningsData.overs} ov)
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Team B Innings */}
        <div className="space-y-2">
          {teamBInnings.map((inningsData) => (
            <div
              key={inningsData.id}
              className={`p-3 rounded-lg ${
                inningsData.is_current
                  ? 'bg-accent/10 border border-accent/30'
                  : 'bg-muted/30'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  {getOrdinal(inningsData.innings_number)} Innings
                </span>
                {inningsData.is_current && (
                  <Badge className="bg-green-500 text-white text-[9px]">BATTING</Badge>
                )}
                {inningsData.declared && (
                  <Badge variant="secondary" className="text-[9px]">DEC</Badge>
                )}
              </div>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-2xl font-bold text-accent">
                  {formatScore(inningsData)}
                </span>
                <span className="text-sm text-muted-foreground">
                  ({inningsData.overs} ov)
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default InningsDisplay;