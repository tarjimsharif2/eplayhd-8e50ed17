import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Radio, Play, CheckCircle } from "lucide-react";

export type MatchFilter = 'all' | 'upcoming' | 'live' | 'completed';

interface MatchFiltersProps {
  activeFilter: MatchFilter;
  onFilterChange: (filter: MatchFilter) => void;
  counts: {
    all: number;
    upcoming: number;
    live: number;
    completed: number;
  };
}

const MatchFilters = ({ activeFilter, onFilterChange, counts }: MatchFiltersProps) => {
  const filters: { key: MatchFilter; label: string; icon: React.ReactNode }[] = [
    { key: 'all', label: 'All', icon: null },
    { key: 'upcoming', label: 'Upcoming', icon: <Radio className="w-3.5 h-3.5" /> },
    { key: 'live', label: 'Live', icon: <Play className="w-3.5 h-3.5" /> },
    { key: 'completed', label: 'Completed', icon: <CheckCircle className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="flex flex-wrap justify-center gap-2">
      {filters.map((filter) => (
        <motion.div key={filter.key} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
          <Button
            variant={activeFilter === filter.key ? "gradient" : "outline"}
            size="sm"
            onClick={() => onFilterChange(filter.key)}
            className="gap-1.5 min-w-[100px]"
          >
            {filter.icon}
            {filter.label}
            <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
              activeFilter === filter.key 
                ? 'bg-primary-foreground/20 text-primary-foreground' 
                : 'bg-muted text-muted-foreground'
            }`}>
              {counts[filter.key]}
            </span>
          </Button>
        </motion.div>
      ))}
    </div>
  );
};

export default MatchFilters;