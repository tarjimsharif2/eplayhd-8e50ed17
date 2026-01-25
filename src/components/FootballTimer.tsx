import { motion, AnimatePresence } from 'framer-motion';

interface FootballTimerProps {
  minute: number;
  seconds: number;
}

const FootballTimer = ({ minute, seconds }: FootballTimerProps) => {
  const minStr = minute.toString().padStart(2, '0');
  const secStr = seconds.toString().padStart(2, '0');

  return (
    <div className="flex items-center gap-0.5">
      {/* Minutes */}
      <div className="flex gap-px">
        {minStr.split('').map((digit, idx) => (
          <div
            key={`min-${idx}`}
            className="bg-red-500/20 rounded px-1 py-0.5 min-w-[14px] border border-red-500/30"
          >
            <AnimatePresence mode="popLayout">
              <motion.span
                key={`min-${idx}-${digit}`}
                initial={{ y: -6, opacity: 0, scale: 0.8 }}
                animate={{ y: 0, opacity: 1, scale: 1 }}
                exit={{ y: 6, opacity: 0, scale: 0.8 }}
                transition={{ type: "spring", stiffness: 400, damping: 25 }}
                className="block text-center text-xs font-bold font-mono text-red-500 tabular-nums"
              >
                {digit}
              </motion.span>
            </AnimatePresence>
          </div>
        ))}
      </div>

      {/* Separator */}
      <motion.span
        animate={{ opacity: [1, 0.3, 1] }}
        transition={{ duration: 1, repeat: Infinity }}
        className="text-red-500 font-bold text-xs"
      >
        :
      </motion.span>

      {/* Seconds */}
      <div className="flex gap-px">
        {secStr.split('').map((digit, idx) => (
          <div
            key={`sec-${idx}`}
            className="bg-red-500/20 rounded px-1 py-0.5 min-w-[14px] border border-red-500/30"
          >
            <AnimatePresence mode="popLayout">
              <motion.span
                key={`sec-${idx}-${digit}`}
                initial={{ y: -6, opacity: 0, scale: 0.8 }}
                animate={{ y: 0, opacity: 1, scale: 1 }}
                exit={{ y: 6, opacity: 0, scale: 0.8 }}
                transition={{ type: "spring", stiffness: 400, damping: 25 }}
                className="block text-center text-xs font-bold font-mono text-red-500 tabular-nums"
              >
                {digit}
              </motion.span>
            </AnimatePresence>
          </div>
        ))}
      </div>

      {/* Live pulse indicator */}
      <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse ml-1" />
    </div>
  );
};

export default FootballTimer;
