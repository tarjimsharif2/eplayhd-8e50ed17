import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { AlertCircle, Play, Settings, Check, Loader2, PictureInPicture2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

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
  playerType?: 'hls' | 'clappr';
  adBlockEnabled?: boolean;
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

// Check if headers are specified or if HTTP URL on HTTPS site
const needsProxy = (url: string, headers?: StreamHeaders): boolean => {
  // Always proxy HTTP streams when on HTTPS site (mixed content issue)
  const isHttpStream = url.startsWith('http://');
  const isHttpsSite = typeof window !== 'undefined' && window.location.protocol === 'https:';
  
  if (isHttpStream && isHttpsSite) return true;
  
  // Also proxy if custom headers are needed
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
  const [currentQuality, setCurrentQuality] = useState<number>(-1);
  const [showControls, setShowControls] = useState(true);
  const [proxyPlaylistUrl, setProxyPlaylistUrl] = useState<string | null>(null);
  const [isPiPActive, setIsPiPActive] = useState(false);

  // Check if PiP is supported
  const isPiPSupported = 'pictureInPictureEnabled' in document;

  const togglePiP = async () => {
    if (!videoRef.current) return;
    
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
        setIsPiPActive(false);
      } else if (document.pictureInPictureEnabled) {
        await videoRef.current.requestPictureInPicture();
        setIsPiPActive(true);
      }
    } catch (err) {
      console.error('PiP error:', err);
      toast.error('Picture-in-Picture not available');
    }
  };

  // Listen for PiP events
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleEnterPiP = () => setIsPiPActive(true);
    const handleLeavePiP = () => setIsPiPActive(false);

    video.addEventListener('enterpictureinpicture', handleEnterPiP);
    video.addEventListener('leavepictureinpicture', handleLeavePiP);

    return () => {
      video.removeEventListener('enterpictureinpicture', handleEnterPiP);
      video.removeEventListener('leavepictureinpicture', handleLeavePiP);
    };
  }, []);

  useEffect(() => {
    const fetchPlaylistViaProxy = async () => {
      if (!needsProxy(url, headers)) {
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

    if (needsProxy(url, headers) && !proxyPlaylistUrl) return;

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    setError(null);
    setQualityLevels([]);
    setCurrentQuality(-1);

    const streamUrl = proxyPlaylistUrl || url;

    if (Hls.isSupported()) {
      const hlsConfig: Partial<Hls['config']> = {
        enableWorker: true,
        lowLatencyMode: true,
        startLevel: -1,
      };

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
        const levels: QualityLevel[] = data.levels.map((level, index) => ({
          index,
          height: level.height,
          bitrate: level.bitrate,
          label: level.height ? `${level.height}p` : `${Math.round(level.bitrate / 1000)}kbps`,
        }));
        
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
      
      {/* Controls overlay */}
      {showControls && (
        <div className="absolute bottom-14 right-4 z-10 transition-opacity duration-300 flex gap-2">
          {/* PiP Button */}
          {isPiPSupported && (
            <Button 
              variant="secondary" 
              size="sm" 
              className={`bg-black/70 hover:bg-black/90 text-white border-0 ${isPiPActive ? 'ring-2 ring-primary' : ''}`}
              onClick={togglePiP}
              title="Picture-in-Picture"
            >
              <PictureInPicture2 className="w-4 h-4" />
            </Button>
          )}
          
          {/* Quality Selector */}
          {qualityLevels.length > 1 && (
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
          )}
        </div>
      )}

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

const ClapprPlayer = ({ url, headers }: { url: string; headers?: StreamHeaders }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [qualityLevels, setQualityLevels] = useState<QualityLevel[]>([]);
  const [currentQuality, setCurrentQuality] = useState<number>(-1);
  const [showQualityMenu, setShowQualityMenu] = useState(false);
  const [isPiPActive, setIsPiPActive] = useState(false);
  const playerIdRef = useRef(`clappr-${Math.random().toString(36).substr(2, 9)}`);

  const isPiPSupported = 'pictureInPictureEnabled' in document;

  const togglePiP = async () => {
    try {
      // Get the video element from Clappr
      const videoElement = containerRef.current?.querySelector('video');
      if (!videoElement) {
        toast.error('Video element not found');
        return;
      }

      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
        setIsPiPActive(false);
      } else if (document.pictureInPictureEnabled) {
        await videoElement.requestPictureInPicture();
        setIsPiPActive(true);
      }
    } catch (err) {
      console.error('PiP error:', err);
      toast.error('Picture-in-Picture not available');
    }
  };

  useEffect(() => {
    let mounted = true;

    const loadClappr = async () => {
      if (!containerRef.current) return;

      try {
        const ClapprModule = await import('@clappr/player');
        const Clappr = ClapprModule.default || ClapprModule;

        if (!mounted) return;
        
        if (playerRef.current) {
          try {
            playerRef.current.destroy();
          } catch (e) {
            console.warn('Error destroying previous player:', e);
          }
          playerRef.current = null;
        }

        if (containerRef.current) {
          containerRef.current.innerHTML = '';
        }

        const player = new Clappr.Player({
          source: url,
          parent: containerRef.current,
          width: '100%',
          height: '100%',
          autoPlay: true,
          mute: false,
          hideMediaControl: false,
          mediacontrol: { seekbar: '#E91E63', buttons: '#E91E63' },
          playback: {
            playInline: true,
            controls: true,
          },
          hlsPlayback: {
            preload: true,
          },
        });

        player.on('ready', () => {
          if (mounted) {
            setIsLoading(false);
            
            // Extract quality levels from HLS playback
            try {
              const playback = player.core?.activePlayback;
              if (playback && playback._hls) {
                playback._hls.on('hlsManifestParsed', (_: any, data: any) => {
                  if (data.levels && mounted) {
                    const levels: QualityLevel[] = data.levels.map((level: any, index: number) => ({
                      index,
                      height: level.height,
                      bitrate: level.bitrate,
                      label: level.height ? `${level.height}p` : `${Math.round(level.bitrate / 1000)}kbps`,
                    }));
                    levels.sort((a, b) => b.height - a.height);
                    setQualityLevels(levels);
                  }
                });
              }
            } catch (e) {
              console.warn('Could not extract quality levels:', e);
            }
          }
        });

        player.on('error', (e: any) => {
          console.error('Clappr playback error:', e);
          if (mounted) {
            setError('Failed to load stream');
            setIsLoading(false);
          }
        });

        playerRef.current = player;
        
        setTimeout(() => {
          if (mounted && isLoading) {
            setIsLoading(false);
          }
        }, 2000);

      } catch (err) {
        console.error('Failed to load Clappr:', err);
        if (mounted) {
          setError('Failed to initialize player');
          setIsLoading(false);
        }
      }
    };

    loadClappr();

    return () => {
      mounted = false;
      if (playerRef.current) {
        try {
          playerRef.current.destroy();
        } catch (e) {
          console.warn('Error during cleanup:', e);
        }
        playerRef.current = null;
      }
    };
  }, [url]);

  const handleQualityChange = (levelIndex: number) => {
    try {
      const playback = playerRef.current?.core?.activePlayback;
      if (playback && playback._hls) {
        playback._hls.currentLevel = levelIndex;
        setCurrentQuality(levelIndex);
      }
    } catch (e) {
      console.warn('Could not change quality:', e);
    }
    setShowQualityMenu(false);
  };

  const getCurrentQualityLabel = () => {
    if (currentQuality === -1) return 'Auto';
    const level = qualityLevels.find(l => l.index === currentQuality);
    return level?.label || 'Auto';
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
    <div className="relative w-full aspect-video bg-black rounded-xl overflow-hidden group">
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center z-10 bg-black">
          <Loader2 className="w-10 h-10 text-primary animate-spin" />
        </div>
      )}
      <div 
        ref={containerRef} 
        id={playerIdRef.current}
        className="absolute inset-0 w-full h-full [&_.play-wrapper]:!hidden [&_.player-poster]:!hidden [&_.play-button]:!hidden [&_.poster-icon]:!hidden [&_.media-control-center-panel]:!opacity-0"
        style={{ zIndex: 1 }}
      />
      
      {/* Controls - PiP and Quality */}
      <div className="absolute bottom-16 right-4 z-20 flex gap-2">
        {/* PiP Button */}
        {isPiPSupported && (
          <Button 
            variant="secondary" 
            size="sm" 
            className={`bg-black/70 hover:bg-black/90 text-white border-0 ${isPiPActive ? 'ring-2 ring-primary' : ''}`}
            onClick={togglePiP}
            title="Picture-in-Picture"
          >
            <PictureInPicture2 className="w-4 h-4" />
          </Button>
        )}

        {/* Quality Selector */}
        {qualityLevels.length > 1 && (
          <DropdownMenu open={showQualityMenu} onOpenChange={setShowQualityMenu}>
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
        )}
      </div>
    </div>
  );
};

const VideoPlayer = ({ url, type, headers, drm, playerType = 'hls', adBlockEnabled = false }: VideoPlayerProps) => {
  // Validate URL before rendering to prevent XSS attacks
  if (!isValidUrl(url)) {
    return (
      <div className="relative w-full aspect-video bg-black rounded-xl overflow-hidden flex items-center justify-center">
        <p className="text-destructive">Invalid streaming URL</p>
      </div>
    );
  }

  // For M3U8 streams, select player based on playerType
  if (type === 'm3u8') {
    if (playerType === 'clappr') {
      return <ClapprPlayer url={url} headers={headers} />;
    }
    return <HlsPlayer url={url} headers={headers} drm={drm} />;
  }

  // For iframe and embed types - handle referrer if specified
  const referrerPolicy = headers?.referer ? 'origin' : 'no-referrer-when-downgrade';
  
  // Ad blocking styles to inject when ad blocker is enabled
  const adBlockStyles = adBlockEnabled ? `
    /* Hide common ad elements */
    .ad, .ads, .advertisement, .ad-container, .ad-wrapper, .ad-overlay,
    [class*="ad-"], [class*="ads-"], [id*="ad-"], [id*="ads-"],
    .popup, .popunder, .overlay-ad, .video-ad, .preroll,
    [class*="popup"], [class*="overlay"], [class*="banner"],
    .close-ad, .skip-ad, iframe[src*="doubleclick"],
    iframe[src*="googlesyndication"], iframe[src*="adservice"],
    div[class*="sticky"], div[class*="float"]:not([class*="player"]) {
      display: none !important;
      visibility: hidden !important;
      opacity: 0 !important;
      pointer-events: none !important;
      height: 0 !important;
      width: 0 !important;
      position: absolute !important;
      left: -9999px !important;
    }
    /* Prevent popups */
    body { pointer-events: auto !important; }
  ` : '';

  // Sandbox attributes for ad blocking
  const sandboxAttrs = adBlockEnabled 
    ? "allow-scripts allow-same-origin allow-forms allow-presentation allow-orientation-lock"
    : undefined;
  
  return (
    <div className="relative w-full aspect-video bg-black rounded-xl overflow-hidden">
      {adBlockEnabled && (
        <style dangerouslySetInnerHTML={{ __html: adBlockStyles }} />
      )}
      <iframe
        src={url}
        className="absolute inset-0 w-full h-full"
        allowFullScreen
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
        frameBorder="0"
        referrerPolicy={referrerPolicy}
        sandbox={sandboxAttrs}
      />
    </div>
  );
};

export default VideoPlayer;