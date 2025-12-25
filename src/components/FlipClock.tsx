import { motion } from 'framer-motion';

interface FlipClockProps {
  time: string; // Format: "HH:MM:SS"
}

const FlipClock = ({ time }: FlipClockProps) => {
  const segments = time.split(':');
  const labels = ['HRS', 'MIN', 'SEC'];

  return (
    <div className="flex items-center gap-1">
      {segments.map((segment, index) => (
        <div key={index} className="flex items-center">
          {/* Time segment */}
          <div className="flex flex-col items-center">
            <div className="bg-secondary rounded-md px-2 py-1.5 min-w-[32px] border border-border/30 shadow-lg">
              <motion.span
                key={segment}
                initial={{ y: -8, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
                className="block text-center text-base font-bold font-mono text-secondary-foreground tabular-nums"
              >
                {segment}
              </motion.span>
            </div>
            <span className="text-[7px] text-muted-foreground mt-0.5 font-medium tracking-wider">
              {labels[index]}
            </span>
          </div>
          
          {/* Separator */}
          {index < 2 && (
            <motion.span
              animate={{ opacity: [1, 0.3, 1] }}
              transition={{ duration: 1, repeat: Infinity }}
              className="text-muted-foreground font-bold mx-0.5 text-sm"
            >
              :
            </motion.span>
          )}
        </div>
      ))}
    </div>
  );
};

export default FlipClock;
