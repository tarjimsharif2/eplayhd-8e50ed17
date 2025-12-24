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

const VideoPlayer = ({ url, type }: VideoPlayerProps) => {
  // Validate URL before rendering to prevent XSS attacks
  if (!isValidUrl(url)) {
    return (
      <div className="relative w-full aspect-video bg-black rounded-xl overflow-hidden flex items-center justify-center">
        <p className="text-destructive">Invalid streaming URL</p>
      </div>
    );
  }

  // For M3U8 streams, use an iframe-based player service
  if (type === 'm3u8') {
    // Use a public HLS player embed or convert to iframe
    const playerUrl = `https://hlsplayer.net/embed?url=${encodeURIComponent(url)}`;
    return (
      <div className="relative w-full aspect-video bg-black rounded-xl overflow-hidden">
        <iframe
          src={playerUrl}
          className="absolute inset-0 w-full h-full"
          allowFullScreen
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          frameBorder="0"
        />
      </div>
    );
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
