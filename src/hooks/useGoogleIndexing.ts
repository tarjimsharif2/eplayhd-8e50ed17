import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface IndexingResult {
  success: boolean;
  submitted: number;
  failed: number;
  results: Array<{
    url: string;
    success: boolean;
    result?: any;
    error?: string;
  }>;
}

export const useGoogleIndexing = () => {
  const { toast } = useToast();

  const submitMatchForIndexing = async (matchId: string): Promise<IndexingResult | null> => {
    try {
      console.log('Submitting match for Google Indexing:', matchId);
      
      const { data, error } = await supabase.functions.invoke('google-indexing', {
        body: { matchId, action: 'URL_UPDATED' }
      });

      if (error) {
        console.error('Google Indexing error:', error);
        // Don't show error toast - indexing is secondary to the main operation
        return null;
      }

      if (data?.success) {
        console.log('Match indexing result:', data);
        
        // Check if any URLs were actually submitted successfully
        if (data.submitted > 0) {
          toast({
            title: "Indexed",
            description: `Match submitted to Google (${data.submitted} URL${data.submitted > 1 ? 's' : ''})`,
          });
        } else if (data.failed > 0) {
          // All URLs failed
          const firstError = data.results?.find((r: any) => !r.success)?.error || 'Unknown error';
          console.error('All indexing attempts failed:', firstError);
          
          let errorMessage = `Failed: ${firstError.substring(0, 80)}`;
          if (firstError.includes('verify the URL owner') || firstError.includes('Failed to verify')) {
            errorMessage = "Add service account email as site owner in Google Search Console.";
          } else if (firstError.includes('SERVICE_DISABLED') || firstError.includes('has not been used')) {
            errorMessage = "Google Indexing API is not enabled. Enable it in Google Cloud Console.";
          }
          
          toast({
            title: "Indexing Failed",
            description: errorMessage,
            variant: "destructive",
          });
        }
      }

      return data;
    } catch (error) {
      console.error('Failed to submit for indexing:', error);
      return null;
    }
  };

  const submitTournamentForIndexing = async (tournamentSlug: string, canonicalUrl?: string): Promise<IndexingResult | null> => {
    try {
      // Get canonical URL from site settings if not provided
      let baseUrl = canonicalUrl;
      if (!baseUrl) {
        const { data: settings } = await supabase
          .from('site_settings_public')
          .select('canonical_url')
          .limit(1)
          .single();
        baseUrl = settings?.canonical_url || '';
      }

      if (!baseUrl) {
        console.log('No canonical URL configured, skipping indexing');
        return null;
      }

      const tournamentUrl = `${baseUrl}/tournament/${tournamentSlug}`;
      console.log('Submitting tournament for Google Indexing:', tournamentUrl);

      const { data, error } = await supabase.functions.invoke('google-indexing', {
        body: { urls: [tournamentUrl], action: 'URL_UPDATED' }
      });

      if (error) {
        console.error('Google Indexing error:', error);
        return null;
      }

      if (data?.success) {
        console.log('Tournament indexing result:', data);
        if (data.submitted > 0) {
          toast({
            title: "Indexed",
            description: `Tournament submitted to Google`,
          });
        } else if (data.failed > 0) {
          const firstError = data.results?.find((r: any) => !r.success)?.error || 'Unknown error';
          let errorMessage = `Failed: ${firstError.substring(0, 80)}`;
          if (firstError.includes('verify the URL owner')) {
            errorMessage = "Add service account as site owner in Search Console.";
          } else if (firstError.includes('SERVICE_DISABLED')) {
            errorMessage = "Google Indexing API is not enabled.";
          }
          toast({
            title: "Indexing Failed",
            description: errorMessage,
            variant: "destructive",
          });
        }
      }

      return data;
    } catch (error) {
      console.error('Failed to submit for indexing:', error);
      return null;
    }
  };

  const submitUrlForIndexing = async (url: string, action: 'URL_UPDATED' | 'URL_DELETED' = 'URL_UPDATED'): Promise<IndexingResult | null> => {
    try {
      console.log('Submitting URL for Google Indexing:', url, action);

      const { data, error } = await supabase.functions.invoke('google-indexing', {
        body: { urls: [url], action }
      });

      if (error) {
        console.error('Google Indexing error:', error);
        return null;
      }

      if (data?.success) {
        console.log('URL indexing result:', data);
        if (data.submitted > 0) {
          toast({
            title: action === 'URL_UPDATED' ? "Indexed" : "Removed from Index",
            description: `URL submitted to Google`,
          });
        } else if (data.failed > 0) {
          const firstError = data.results?.find((r: any) => !r.success)?.error || 'Unknown error';
          let errorMessage = `Failed: ${firstError.substring(0, 80)}`;
          if (firstError.includes('verify the URL owner')) {
            errorMessage = "Add service account as site owner in Search Console.";
          } else if (firstError.includes('SERVICE_DISABLED')) {
            errorMessage = "Google Indexing API is not enabled.";
          }
          toast({
            title: "Indexing Failed",
            description: errorMessage,
            variant: "destructive",
          });
        }
      }

      return data;
    } catch (error) {
      console.error('Failed to submit for indexing:', error);
      return null;
    }
  };

  return {
    submitMatchForIndexing,
    submitTournamentForIndexing,
    submitUrlForIndexing,
  };
};
