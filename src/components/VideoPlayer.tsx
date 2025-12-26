import { useEffect, useRef, useState } from 'react';
import { AlertCircle, Play, Settings, Check, Loader2, PictureInPicture2, Volume2, VolumeX } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface StreamHeaders {
  referer?: string | null;
  origin?: string | null;
  cookie?: string | null;
  userAgent?: string | null;
}

interface ClearKeyConfig {
  keyId?: string | null;
  key?: string | null;
}

interface VideoPlayerProps {
  url: string;
  type: 'iframe' | 'm3u8' | 'embed' | 'mpd';
  headers?: StreamHeaders;
  clearKey?: ClearKeyConfig;
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

interface QualityLevel {
  index: number;
  height: number;
  bitrate: number;
  label: string;
}

const ClapprPlayer = ({ url, headers }: { url: string; headers?: StreamHeaders }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [qualityLevels, setQualityLevels] = useState<QualityLevel[]>([]);
  const [currentQuality, setCurrentQuality] = useState<number>(-1);
  const [showQualityMenu, setShowQualityMenu] = useState(false);
  const [isPiPActive, setIsPiPActive] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const playerIdRef = useRef(`clappr-${Math.random().toString(36).substr(2, 9)}`);

  const isPiPSupported = 'pictureInPictureEnabled' in document;

  const togglePiP = async () => {
    try {
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
        // Destroy previous player first
        if (playerRef.current) {
          try {
            playerRef.current.destroy();
          } catch (e) {
            console.warn('Error destroying previous player:', e);
          }
          playerRef.current = null;
        }

        // Clear the container
        if (containerRef.current) {
          containerRef.current.innerHTML = '';
        }

        const ClapprModule = await import('@clappr/player');
        const Clappr = ClapprModule.default || ClapprModule;

        if (!mounted) return;

        const player = new Clappr.Player({
          source: url,
          parent: containerRef.current,
          width: '100%',
          height: '100%',
          autoPlay: true,
          mute: true, // Start muted for mobile autoplay to work
          hideMediaControl: false,
          mediacontrol: { seekbar: '#E91E63', buttons: '#E91E63' },
          playback: {
            playInline: true,
            controls: false,
            hlsjsConfig: {
              enableWorker: true,
              lowLatencyMode: false,
            },
          },
          disableVideoTagContextMenu: true,
        });

        player.on('ready', () => {
          if (mounted) {
            setIsLoading(false);
            
            // Force video element to stretch
            const videoEl = containerRef.current?.querySelector('video') as HTMLVideoElement;
            if (videoEl) {
              videoEl.style.objectFit = 'fill';
              videoEl.style.width = '100%';
              videoEl.style.height = '100%';
            }
            
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

        player.on('play', () => {
          if (mounted) setIsPlaying(true);
        });

        player.on('pause', () => {
          if (mounted) setIsPlaying(false);
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
        }, 3000);

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
      <div className="relative w-full h-full min-h-[200px] bg-black rounded-xl overflow-hidden flex flex-col items-center justify-center gap-3">
        <AlertCircle className="w-10 h-10 text-destructive" />
        <p className="text-destructive text-center px-4">{error}</p>
      </div>
    );
  }

  const handleUnmute = () => {
    const videoEl = containerRef.current?.querySelector('video') as HTMLVideoElement;
    if (videoEl) {
      videoEl.muted = false;
      setIsMuted(false);
    }
  };

  const handlePlayPause = () => {
    const videoEl = containerRef.current?.querySelector('video') as HTMLVideoElement;
    if (videoEl) {
      if (videoEl.paused) {
        videoEl.play();
      } else {
        videoEl.pause();
      }
    }
  };

  return (
    <div className="relative w-full h-full min-h-[200px] bg-black rounded-xl overflow-hidden group">
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center z-10 bg-black">
          <Loader2 className="w-10 h-10 text-primary animate-spin" />
        </div>
      )}
      <div 
        ref={containerRef} 
        id={playerIdRef.current}
        className="absolute inset-0 w-full h-full [&_video]:w-full [&_video]:h-full [&_video]:object-fill [&_.play-wrapper]:hidden [&_.poster-icon]:hidden"
        style={{ zIndex: 1 }}
      />
      
      {/* Center Play/Pause Button */}
      {!isLoading && (
        <button
          onClick={handlePlayPause}
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-20 w-16 h-16 rounded-full bg-primary/90 flex items-center justify-center hover:scale-110 transition-transform opacity-0 group-hover:opacity-100"
        >
          {isPlaying ? (
            <div className="flex gap-1">
              <div className="w-2 h-6 bg-white rounded-sm"></div>
              <div className="w-2 h-6 bg-white rounded-sm"></div>
            </div>
          ) : (
            <Play className="w-7 h-7 text-white ml-1" fill="white" />
          )}
        </button>
      )}

      {/* Unmute Button */}
      {isMuted && !isLoading && (
        <button
          onClick={handleUnmute}
          className="absolute top-4 left-4 z-20 flex items-center gap-2 bg-black/70 hover:bg-black/90 text-white px-3 py-2 rounded-lg transition-colors"
        >
          <VolumeX className="w-5 h-5" />
          <span className="text-sm font-medium">Tap to Unmute</span>
        </button>
      )}
      
      
      {/* Controls - PiP and Quality */}
      <div className="absolute bottom-16 right-4 z-20 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
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

const ShakaPlayer = ({ url, clearKey }: { url: string; clearKey?: ClearKeyConfig }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPiPActive, setIsPiPActive] = useState(false);
  const [qualityLevels, setQualityLevels] = useState<QualityLevel[]>([]);
  const [currentQuality, setCurrentQuality] = useState<number>(-1);
  const [showQualityMenu, setShowQualityMenu] = useState(false);

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
    let mounted = true;

    const initPlayer = async () => {
      if (!videoRef.current) return;

      try {
        setIsLoading(true);
        console.log('Initializing Shaka Player for URL:', url);
        
        // Import shaka-player using the compiled distribution
        const shaka = await import('shaka-player/dist/shaka-player.compiled.js') as any;
        
        console.log('Shaka module loaded:', Object.keys(shaka));
        
        // Install polyfills
        shaka.polyfill.installAll();

        if (!shaka.Player.isBrowserSupported()) {
          console.error('Browser not supported for DASH');
          setError('Browser not supported for DASH playback');
          setIsLoading(false);
          return;
        }

        if (!mounted) return;

        // Destroy previous player if exists
        if (playerRef.current) {
          try {
            await playerRef.current.destroy();
          } catch (e) {
            console.warn('Error destroying previous player:', e);
          }
          playerRef.current = null;
        }

        // Create new player instance
        const player = new shaka.Player();
        await player.attach(videoRef.current);

        // Configure ClearKey DRM if provided
        if (clearKey?.keyId && clearKey?.key) {
          console.log('Configuring ClearKey DRM');
          player.configure({
            drm: {
              clearKeys: {
                [clearKey.keyId]: clearKey.key
              }
            }
          });
        }

        // Add error listener
        player.addEventListener('error', (event: any) => {
          console.error('Shaka Player error:', event);
          if (mounted) {
            const errorDetail = event.detail || event;
            setError(`Playback error: ${errorDetail?.message || errorDetail?.code || 'Unknown error'}`);
            setIsLoading(false);
          }
        });

        // Load the manifest
        await player.load(url);
        console.log('MPD manifest loaded successfully');
        
        if (mounted) {
          playerRef.current = player;
          setIsLoading(false);
          
          // Extract quality levels
          const tracks = player.getVariantTracks();
          console.log('Available variant tracks:', tracks?.length);
          
          if (tracks && tracks.length > 0) {
            const uniqueHeights = new Map<number, any>();
            tracks.forEach((track: any) => {
              if (track.height && !uniqueHeights.has(track.height)) {
                uniqueHeights.set(track.height, track);
              }
            });
            
            const levels: QualityLevel[] = Array.from(uniqueHeights.values()).map((track: any, index: number) => ({
              index,
              height: track.height,
              bitrate: track.videoBandwidth || track.bandwidth || 0,
              label: `${track.height}p`,
            }));
            levels.sort((a, b) => b.height - a.height);
            setQualityLevels(levels);
          }
          
          // Attempt to auto-play unmuted
          try {
            if (videoRef.current) {
              await videoRef.current.play();
              setIsPlaying(true);
            }
          } catch (playErr) {
            console.log('Auto-play blocked, user interaction required');
          }
        }
      } catch (err: any) {
        console.error('Failed to initialize Shaka Player:', err);
        if (mounted) {
          setError(`Failed to load stream: ${err?.message || 'Check console for details'}`);
          setIsLoading(false);
        }
      }
    };

    initPlayer();

    return () => {
      mounted = false;
      if (playerRef.current) {
        playerRef.current.destroy().catch(console.warn);
        playerRef.current = null;
      }
    };
  }, [url, clearKey?.keyId, clearKey?.key]);

  const handlePlay = async () => {
    try {
      await videoRef.current?.play();
      setIsPlaying(true);
    } catch (err) {
      console.error('Playback failed:', err);
    }
  };

  const handleQualityChange = (levelIndex: number) => {
    if (!playerRef.current) return;
    
    try {
      if (levelIndex === -1) {
        // Auto quality
        playerRef.current.configure({ abr: { enabled: true } });
      } else {
        // Manual quality selection
        const level = qualityLevels[levelIndex];
        if (level) {
          playerRef.current.configure({ abr: { enabled: false } });
          const tracks = playerRef.current.getVariantTracks();
          const targetTrack = tracks.find((t: any) => t.height === level.height);
          if (targetTrack) {
            playerRef.current.selectVariantTrack(targetTrack, true);
          }
        }
      }
      setCurrentQuality(levelIndex);
    } catch (e) {
      console.warn('Could not change quality:', e);
    }
    setShowQualityMenu(false);
  };

  const getCurrentQualityLabel = () => {
    if (currentQuality === -1) return 'Auto';
    const level = qualityLevels[currentQuality];
    return level?.label || 'Auto';
  };

  if (error) {
    return (
      <div className="relative w-full h-full min-h-[200px] bg-black rounded-xl overflow-hidden flex flex-col items-center justify-center gap-3">
        <AlertCircle className="w-10 h-10 text-destructive" />
        <p className="text-destructive text-center px-4">{error}</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="relative w-full h-full min-h-[200px] bg-black rounded-xl overflow-hidden flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-10 h-10 text-primary animate-spin" />
        <p className="text-muted-foreground text-center px-4">Loading stream...</p>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full min-h-[200px] bg-black rounded-xl overflow-hidden group">
      <video
        ref={videoRef}
        className="absolute inset-0 w-full h-full object-fill"
        controls
        playsInline
        autoPlay
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
      />
      
      {/* Controls - PiP and Quality */}
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
              {qualityLevels.map((level, idx) => (
                <DropdownMenuItem
                  key={level.height}
                  onClick={() => handleQualityChange(idx)}
                  className="text-white hover:bg-white/20 gap-2"
                >
                  {currentQuality === idx && <Check className="w-4 h-4" />}
                  <span className={currentQuality !== idx ? 'ml-6' : ''}>
                    {level.label}
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

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

const VideoPlayer = ({ url, type, headers, clearKey, adBlockEnabled = false }: VideoPlayerProps) => {
  // Validate URL before rendering to prevent XSS attacks
  if (!isValidUrl(url)) {
    return (
      <div className="relative w-full h-full min-h-[200px] bg-black rounded-xl overflow-hidden flex items-center justify-center">
        <p className="text-destructive">Invalid streaming URL</p>
      </div>
    );
  }

  // For M3U8 streams, use Clappr player only
  if (type === 'm3u8') {
    return <ClapprPlayer url={url} headers={headers} />;
  }

  // For MPD/DASH streams, use Shaka Player
  if (type === 'mpd') {
    return <ShakaPlayer url={url} clearKey={clearKey} />;
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
    <div className="relative w-full h-full min-h-[200px] bg-black rounded-xl overflow-hidden">
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
