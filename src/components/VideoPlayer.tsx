interface VideoPlayerProps {
  url: string;
  type: 'iframe' | 'm3u8' | 'embed';
}

const VideoPlayer = ({ url, type }: VideoPlayerProps) => {
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
