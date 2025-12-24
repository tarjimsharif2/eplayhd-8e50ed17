import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Play, Pause, Volume2, VolumeX, Maximize, Loader2 } from 'lucide-react';

interface VideoPlayerProps {
  url: string;
  type: 'iframe' | 'm3u8' | 'embed';
}

const VideoPlayer = ({ url, type }: VideoPlayerProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (type === 'm3u8' && videoRef.current) {
      const loadHls = async () => {
        try {
          const Hls = (await import('hls.js')).default;
          
          if (Hls.isSupported()) {
            const hls = new Hls({
              enableWorker: true,
              lowLatencyMode: true,
            });
            
            hls.loadSource(url);
            hls.attachMedia(videoRef.current!);
            
            hls.on(Hls.Events.MANIFEST_PARSED, () => {
              setIsLoading(false);
              videoRef.current?.play().catch(() => {});
              setIsPlaying(true);
            });
            
            hls.on(Hls.Events.ERROR, (_, data) => {
              if (data.fatal) {
                setError('Failed to load stream. Please try another server.');
                setIsLoading(false);
              }
            });

            return () => hls.destroy();
          } else if (videoRef.current?.canPlayType('application/vnd.apple.mpegurl')) {
            // Native HLS support (Safari)
            videoRef.current.src = url;
            videoRef.current.addEventListener('loadedmetadata', () => {
              setIsLoading(false);
              videoRef.current?.play().catch(() => {});
              setIsPlaying(true);
            });
          } else {
            setError('HLS is not supported in this browser.');
            setIsLoading(false);
          }
        } catch (err) {
          setError('Failed to initialize video player.');
          setIsLoading(false);
        }
      };

      loadHls();
    } else {
      setIsLoading(false);
    }
  }, [url, type]);

  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const toggleFullscreen = () => {
    if (videoRef.current) {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        videoRef.current.requestFullscreen();
      }
    }
  };

  // For iframe and embed types
  if (type === 'iframe' || type === 'embed') {
    return (
      <div className="relative w-full aspect-video bg-black rounded-xl overflow-hidden">
        <iframe
          src={url}
          className="absolute inset-0 w-full h-full"
          allowFullScreen
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          frameBorder="0"
        />
      </div>
    );
  }

  // For M3U8 (HLS) streams
  return (
    <div className="relative w-full aspect-video bg-black rounded-xl overflow-hidden group">
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-10">
          <Loader2 className="w-12 h-12 text-primary animate-spin" />
        </div>
      )}

      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-10">
          <p className="text-destructive text-center px-4">{error}</p>
        </div>
      )}

      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        playsInline
        onClick={togglePlay}
      />

      {/* Video Controls */}
      <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={togglePlay}
              className="text-white hover:bg-white/20"
            >
              {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleMute}
              className="text-white hover:bg-white/20"
            >
              {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
            </Button>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleFullscreen}
            className="text-white hover:bg-white/20"
          >
            <Maximize className="w-5 h-5" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default VideoPlayer;
