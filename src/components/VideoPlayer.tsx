import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { AlertCircle, Play, Settings, Check } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';

interface VideoPlayerProps {
  url: string;
  type: 'iframe' | 'm3u8' | 'embed';
}

// Validate that URL uses safe protocols (http:// or https://)
const isValidUrl = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

interface QualityLevel {
  index: number;
  height: number;
  bitrate: number;
  label: string;
}

const HlsPlayer = ({ url }: { url: string }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [qualityLevels, setQualityLevels] = useState<QualityLevel[]>([]);
  const [currentQuality, setCurrentQuality] = useState<number>(-1); // -1 = auto
  const [showControls, setShowControls] = useState(true);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Cleanup previous instance
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    setError(null);
    setQualityLevels([]);
    setCurrentQuality(-1);

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        startLevel: -1, // Auto quality
      });

      hls.loadSource(url);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
        // Extract available quality levels
        const levels: QualityLevel[] = data.levels.map((level, index) => ({
          index,
          height: level.height,
          bitrate: level.bitrate,
          label: level.height ? `${level.height}p` : `${Math.round(level.bitrate / 1000)}kbps`,
        }));
        
        // Sort by height descending
        levels.sort((a, b) => b.height - a.height);
        setQualityLevels(levels);
      });

      hls.on(Hls.Events.LEVEL_SWITCHED, (_, data) => {
        if (hls.autoLevelEnabled) {
          setCurrentQuality(-1);
        }
      });

      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              setError('Network error - stream may be unavailable');
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              hls.recoverMediaError();
              break;
            default:
              setError('Stream playback error');
              hls.destroy();
              break;
          }
        }
      });

      hlsRef.current = hls;
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Native HLS support (Safari)
      video.src = url;
    } else {
      setError('HLS playback not supported in this browser');
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [url]);

  const handlePlay = async () => {
    try {
      await videoRef.current?.play();
      setIsPlaying(true);
    } catch (err) {
      console.error('Playback failed:', err);
    }
  };

  const handleQualityChange = (levelIndex: number) => {
    if (hlsRef.current) {
      if (levelIndex === -1) {
        hlsRef.current.currentLevel = -1;
        hlsRef.current.nextLevel = -1;
      } else {
        hlsRef.current.currentLevel = levelIndex;
      }
      setCurrentQuality(levelIndex);
    }
  };

  const getCurrentQualityLabel = () => {
    if (currentQuality === -1) {
      return 'Auto';
    }
    const level = qualityLevels.find(l => l.index === currentQuality);
    return level?.label || 'Unknown';
  };

  if (error) {
    return (
      <div className="relative w-full aspect-video bg-black rounded-xl overflow-hidden flex flex-col items-center justify-center gap-3">
        <AlertCircle className="w-10 h-10 text-destructive" />
        <p className="text-destructive text-center px-4">{error}</p>
      </div>
    );
  }

  return (
    <div 
      className="relative w-full aspect-video bg-black rounded-xl overflow-hidden group"
      onMouseEnter={() => setShowControls(true)}
      onMouseLeave={() => isPlaying && setShowControls(false)}
    >
      <video
        ref={videoRef}
        className="absolute inset-0 w-full h-full"
        controls
        playsInline
        poster=""
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
      />
      
      {/* Quality Selector */}
      {qualityLevels.length > 1 && showControls && (
        <div className="absolute bottom-14 right-4 z-10 transition-opacity duration-300">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                variant="secondary" 
                size="sm" 
                className="bg-black/70 hover:bg-black/90 text-white border-0 gap-1.5"
              >
                <Settings className="w-4 h-4" />
                <span className="text-xs">{getCurrentQualityLabel()}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-black/90 border-white/10">
              <DropdownMenuItem 
                onClick={() => handleQualityChange(-1)}
                className="text-white hover:bg-white/20 gap-2"
              >
                {currentQuality === -1 && <Check className="w-4 h-4" />}
                <span className={currentQuality !== -1 ? 'ml-6' : ''}>Auto</span>
              </DropdownMenuItem>
              {qualityLevels.map((level) => (
                <DropdownMenuItem
                  key={level.index}
                  onClick={() => handleQualityChange(level.index)}
                  className="text-white hover:bg-white/20 gap-2"
                >
                  {currentQuality === level.index && <Check className="w-4 h-4" />}
                  <span className={currentQuality !== level.index ? 'ml-6' : ''}>
                    {level.label}
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      {/* Play Button Overlay */}
      {!isPlaying && (
        <button
          onClick={handlePlay}
          className="absolute inset-0 flex items-center justify-center bg-black/50 hover:bg-black/40 transition-colors cursor-pointer group/play"
        >
          <div className="w-20 h-20 rounded-full bg-primary/90 flex items-center justify-center group-hover/play:scale-110 transition-transform">
            <Play className="w-8 h-8 text-primary-foreground ml-1" />
          </div>
        </button>
      )}
    </div>
  );
};

const VideoPlayer = ({ url, type }: VideoPlayerProps) => {
  // Validate URL before rendering to prevent XSS attacks
  if (!isValidUrl(url)) {
    return (
      <div className="relative w-full aspect-video bg-black rounded-xl overflow-hidden flex items-center justify-center">
        <p className="text-destructive">Invalid streaming URL</p>
      </div>
    );
  }

  // For M3U8 streams, use HLS.js player
  if (type === 'm3u8') {
    return <HlsPlayer url={url} />;
  }

  // For iframe and embed types
  return (
    <div className="relative w-full aspect-video bg-black rounded-xl overflow-hidden">
      <iframe
        src={url}
        className="absolute inset-0 w-full h-full"
        allowFullScreen
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
        frameBorder="0"
      />
    </div>
  );
};

export default VideoPlayer;
