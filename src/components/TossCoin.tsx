import { cn } from "@/lib/utils";

interface TossCoinProps {
  className?: string;
  size?: number;
}

const TossCoin = ({ className, size = 20 }: TossCoinProps) => {
  return (
    <div 
      className={cn("relative", className)}
      style={{ width: size, height: size + 6 }}
    >
      {/* Coin */}
      <div 
        className="animate-coin-flip absolute top-0 left-0"
        style={{ width: size, height: size }}
      >
        <svg
          viewBox="0 0 100 100"
          width={size}
          height={size}
        >
          {/* Coin outer ring - golden gradient */}
          <defs>
            <linearGradient id="coinGold" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#FFD700" />
              <stop offset="25%" stopColor="#FFF8DC" />
              <stop offset="50%" stopColor="#FFD700" />
              <stop offset="75%" stopColor="#DAA520" />
              <stop offset="100%" stopColor="#B8860B" />
            </linearGradient>
            <linearGradient id="coinInner" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#FFF8DC" />
              <stop offset="30%" stopColor="#FFD700" />
              <stop offset="70%" stopColor="#DAA520" />
              <stop offset="100%" stopColor="#CD853F" />
            </linearGradient>
            <linearGradient id="coinShine" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="rgba(255,255,255,0.8)" />
              <stop offset="50%" stopColor="rgba(255,255,255,0.1)" />
              <stop offset="100%" stopColor="rgba(0,0,0,0.2)" />
            </linearGradient>
          </defs>
          
          {/* Main coin body */}
          <circle 
            cx="50" 
            cy="50" 
            r="45" 
            fill="url(#coinGold)"
          />
          
          {/* Inner circle */}
          <circle 
            cx="50" 
            cy="50" 
            r="38" 
            fill="url(#coinInner)"
          />
          
          {/* Cricket stumps/bat design in center */}
          <g fill="#8B4513" opacity="0.7">
            {/* Left stump */}
            <rect x="40" y="32" width="3" height="28" rx="1" />
            {/* Middle stump */}
            <rect x="48.5" y="32" width="3" height="28" rx="1" />
            {/* Right stump */}
            <rect x="57" y="32" width="3" height="28" rx="1" />
            {/* Bails */}
            <rect x="39" y="30" width="10" height="3" rx="1" />
            <rect x="51" y="30" width="10" height="3" rx="1" />
          </g>
          
          {/* Decorative border ring */}
          <circle 
            cx="50" 
            cy="50" 
            r="42" 
            fill="none"
            stroke="#DAA520"
            strokeWidth="1.5"
            opacity="0.6"
          />
          
          {/* Inner decorative ring */}
          <circle 
            cx="50" 
            cy="50" 
            r="35" 
            fill="none"
            stroke="#B8860B"
            strokeWidth="1"
            opacity="0.4"
          />
          
          {/* Shine overlay */}
          <ellipse 
            cx="38" 
            cy="35" 
            rx="18" 
            ry="12" 
            fill="url(#coinShine)"
            opacity="0.4"
          />
          
          {/* Small decorative dots around edge */}
          {[0, 45, 90, 135, 180, 225, 270, 315].map((angle, i) => {
            const rad = (angle * Math.PI) / 180;
            const x = 50 + 40 * Math.cos(rad);
            const y = 50 + 40 * Math.sin(rad);
            return (
              <circle 
                key={i}
                cx={x} 
                cy={y} 
                r="2" 
                fill="#DAA520"
                opacity="0.5"
              />
            );
          })}
        </svg>
      </div>
      
      {/* Shadow below the coin */}
      <div 
        className="animate-coin-shadow absolute left-1/2 -translate-x-1/2 rounded-full bg-black/30 blur-[1px]"
        style={{ 
          width: size * 0.7, 
          height: size * 0.15,
          bottom: 0,
        }}
      />
    </div>
  );
};

export default TossCoin;
