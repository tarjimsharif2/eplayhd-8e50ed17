import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface FlipDigitProps {
  digit: string;
  prevDigit: string;
}

const FlipDigit = ({ digit, prevDigit }: FlipDigitProps) => {
  const hasChanged = digit !== prevDigit;

  return (
    <div className="relative w-5 h-7 perspective-500">
      {/* Static background */}
      <div className="absolute inset-0 bg-gradient-to-b from-gray-800 to-gray-900 rounded-sm border border-gray-700/50 overflow-hidden">
        {/* Top half background */}
        <div className="absolute top-0 left-0 right-0 h-1/2 bg-gradient-to-b from-gray-700 to-gray-800" />
        {/* Center line */}
        <div className="absolute top-1/2 left-0 right-0 h-px bg-gray-950/80 z-10" />
      </div>

      {/* Current digit (stays in place) */}
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-sm font-bold font-mono bg-gradient-to-b from-emerald-300 to-cyan-400 bg-clip-text text-transparent">
          {digit}
        </span>
      </div>

      {/* Flip animation */}
      <AnimatePresence mode="popLayout">
        {hasChanged && (
          <>
            {/* Top flipping part */}
            <motion.div
              key={`top-${digit}`}
              initial={{ rotateX: 0 }}
              animate={{ rotateX: -90 }}
              exit={{ rotateX: -90 }}
              transition={{ duration: 0.3, ease: "easeIn" }}
              className="absolute top-0 left-0 right-0 h-1/2 bg-gradient-to-b from-gray-700 to-gray-800 rounded-t-sm border-x border-t border-gray-700/50 overflow-hidden origin-bottom backface-hidden"
              style={{ transformStyle: 'preserve-3d' }}
            >
              <div className="absolute inset-0 flex items-end justify-center pb-0">
                <span className="text-sm font-bold font-mono bg-gradient-to-b from-emerald-300 to-cyan-400 bg-clip-text text-transparent translate-y-1/2">
                  {prevDigit}
                </span>
              </div>
            </motion.div>

            {/* Bottom flipping part */}
            <motion.div
              key={`bottom-${digit}`}
              initial={{ rotateX: 90 }}
              animate={{ rotateX: 0 }}
              transition={{ duration: 0.3, ease: "easeOut", delay: 0.15 }}
              className="absolute bottom-0 left-0 right-0 h-1/2 bg-gradient-to-b from-gray-800 to-gray-900 rounded-b-sm border-x border-b border-gray-700/50 overflow-hidden origin-top"
              style={{ transformStyle: 'preserve-3d' }}
            >
              <div className="absolute inset-0 flex items-start justify-center pt-0">
                <span className="text-sm font-bold font-mono bg-gradient-to-b from-emerald-300 to-cyan-400 bg-clip-text text-transparent -translate-y-1/2">
                  {digit}
                </span>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Shine effect */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-transparent rounded-sm pointer-events-none" />
    </div>
  );
};

interface FlipClockProps {
  time: string; // Format: "HH:MM:SS"
}

const FlipClock = ({ time }: FlipClockProps) => {
  const [currentTime, setCurrentTime] = useState(time);
  const [prevTime, setPrevTime] = useState(time);
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    setPrevTime(currentTime);
    setCurrentTime(time);
  }, [time, currentTime]);

  const segments = currentTime.split(':');
  const prevSegments = prevTime.split(':');

  return (
    <div className="relative">
      {/* Animated glow ring */}
      <div className="absolute -inset-1 bg-gradient-to-r from-emerald-500 via-cyan-400 to-emerald-500 rounded-xl blur-md opacity-60 animate-pulse" />
      
      {/* Main container */}
      <div className="relative bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 px-2 py-2 rounded-xl border border-emerald-500/30 shadow-[0_0_20px_rgba(16,185,129,0.4)]">
        <div className="flex items-center gap-1">
          {segments.map((segment, segmentIndex) => (
            <div key={segmentIndex} className="flex items-center">
              {/* Digit pair */}
              <div className="flex gap-0.5">
                {segment.split('').map((digit, digitIndex) => {
                  const prevDigit = prevSegments[segmentIndex]?.[digitIndex] || digit;
                  return (
                    <FlipDigit
                      key={`${segmentIndex}-${digitIndex}`}
                      digit={digit}
                      prevDigit={prevDigit}
                    />
                  );
                })}
              </div>
              
              {/* Separator */}
              {segmentIndex < 2 && (
                <div className="flex flex-col gap-1 mx-0.5">
                  <motion.div
                    animate={{ opacity: [1, 0.3, 1] }}
                    transition={{ duration: 1, repeat: Infinity }}
                    className="w-1 h-1 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]"
                  />
                  <motion.div
                    animate={{ opacity: [1, 0.3, 1] }}
                    transition={{ duration: 1, repeat: Infinity }}
                    className="w-1 h-1 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]"
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default FlipClock;
