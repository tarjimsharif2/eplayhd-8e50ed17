import { useEffect } from 'react';

const Sitemap = () => {
  useEffect(() => {
    // Redirect to the edge function sitemap
    const projectId = 'doqteforumjdugifxryl';
    window.location.href = `https://${projectId}.supabase.co/functions/v1/sitemap`;
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-muted-foreground">Redirecting to sitemap...</p>
    </div>
  );
};

export default Sitemap;
