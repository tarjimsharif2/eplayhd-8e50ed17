import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { AlertCircle, Play, Settings, Check, Loader2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';

interface StreamHeaders {
  referer?: string | null;
  origin?: string | null;
  cookie?: string | null;
  userAgent?: string | null;
}

interface DrmConfig {
  licenseUrl?: string | null;
  scheme?: 'widevine' | 'playready' | 'clearkey' | null;
}

interface VideoPlayerProps {
  url: string;
  type: 'iframe' | 'm3u8' | 'embed';
  headers?: StreamHeaders;
  drm?: DrmConfig;
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

// Check if headers are specified and need proxy
const needsProxy = (headers?: StreamHeaders): boolean => {
  if (!headers) return false;
  return !!(headers.referer || headers.origin || headers.cookie || headers.userAgent);
};

interface QualityLevel {
  index: number;
  height: number;
  bitrate: number;
  label: string;
}

const HlsPlayer = ({ url, headers, drm }: { url: string; headers?: StreamHeaders; drm?: DrmConfig }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [qualityLevels, setQualityLevels] = useState<QualityLevel[]>([]);
  const [currentQuality, setCurrentQuality] = useState<number>(-1); // -1 = auto
  const [showControls, setShowControls] = useState(true);
  const [proxyPlaylistUrl, setProxyPlaylistUrl] = useState<string | null>(null);

  // Fetch playlist through proxy if headers are specified
  useEffect(() => {
    const fetchPlaylistViaProxy = async () => {
      if (!needsProxy(headers)) {
        setProxyPlaylistUrl(null);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const { data, error: fnError } = await supabase.functions.invoke('stream-proxy', {
          body: {
            url,
            headers: {
              referer: headers?.referer || null,
              origin: headers?.origin || null,
              cookie: headers?.cookie || null,
              userAgent: headers?.userAgent || null,
            },
          },
        });

        if (fnError) {
          console.error('Proxy error:', fnError);
          setError('Failed to load stream via proxy');
          setIsLoading(false);
          return;
        }

        // Create a blob URL from the playlist content
        const blob = new Blob([data], { type: 'application/vnd.apple.mpegurl' });
        const blobUrl = URL.createObjectURL(blob);
        setProxyPlaylistUrl(blobUrl);
        setIsLoading(false);
      } catch (err) {
        console.error('Proxy fetch error:', err);
        setError('Failed to connect to stream proxy');
        setIsLoading(false);
      }
    };

    fetchPlaylistViaProxy();

    return () => {
      if (proxyPlaylistUrl) {
        URL.revokeObjectURL(proxyPlaylistUrl);
      }
    };
  }, [url, headers]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Wait for proxy if needed
    if (needsProxy(headers) && !proxyPlaylistUrl) return;

    // Cleanup previous instance
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    setError(null);
    setQualityLevels([]);
    setCurrentQuality(-1);

    const streamUrl = proxyPlaylistUrl || url;

    if (Hls.isSupported()) {
      // Build HLS config with optional DRM
      const hlsConfig: Partial<Hls['config']> = {
        enableWorker: true,
        lowLatencyMode: true,
        startLevel: -1, // Auto quality
      };

      // Add DRM configuration if specified
      if (drm?.licenseUrl && drm?.scheme) {
        const drmSystemId = drm.scheme === 'widevine' 
          ? 'com.widevine.alpha' 
          : drm.scheme === 'playready' 
          ? 'com.microsoft.playready' 
          : 'org.w3.clearkey';

        (hlsConfig as any).drmSystems = {
          [drmSystemId]: {
            licenseUrl: drm.licenseUrl,
          },
        };

        (hlsConfig as any).emeEnabled = true;
        console.log('DRM enabled:', drm.scheme, 'License URL:', drm.licenseUrl);
      }

      const hls = new Hls(hlsConfig as any);

      hls.loadSource(streamUrl);
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
      video.src = streamUrl;
    } else {
      setError('HLS playback not supported in this browser');
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [url, headers, drm, proxyPlaylistUrl]);

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

  if (isLoading) {
    return (
      <div className="relative w-full aspect-video bg-black rounded-xl overflow-hidden flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-10 h-10 text-primary animate-spin" />
        <p className="text-muted-foreground text-center px-4">Loading stream...</p>
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

const VideoPlayer = ({ url, type, headers, drm }: VideoPlayerProps) => {
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
    return <HlsPlayer url={url} headers={headers} drm={drm} />;
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
