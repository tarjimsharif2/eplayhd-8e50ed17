import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const AdsTxt = () => {
  const [content, setContent] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAdsTxt = async () => {
      console.log("[AdsTxt] Fetching ads.txt content...");
      try {
        const { data, error } = await supabase
          .from("site_settings_public")
          .select("*")
          .limit(1)
          .maybeSingle();

        console.log("[AdsTxt] Response:", { data, error });

        if (error) {
          console.error("[AdsTxt] Error:", error);
          setError(error.message);
          setLoading(false);
          return;
        }

        const settings = data as { ads_txt_content?: string } | null;
        console.log("[AdsTxt] ads_txt_content:", settings?.ads_txt_content);
        
        if (settings?.ads_txt_content) {
          setContent(settings.ads_txt_content);
        }
      } catch (err) {
        console.error("[AdsTxt] Exception:", err);
        setError(String(err));
      }
      setLoading(false);
    };

    fetchAdsTxt();
  }, []);

  useEffect(() => {
    document.title = "ads.txt";
    document.body.style.background = "white";
    document.body.style.margin = "0";
    document.body.style.padding = "0";
    
    return () => {
      document.body.style.background = "";
      document.body.style.margin = "";
      document.body.style.padding = "";
    };
  }, []);

  console.log("[AdsTxt] Render state:", { loading, content, error });

  if (loading) {
    return <div style={{ background: "white", color: "black", padding: 8 }}>Loading...</div>;
  }

  if (error) {
    return <div style={{ background: "white", color: "red", padding: 8 }}>Error: {error}</div>;
  }

  if (!content) {
    return <div style={{ background: "white", color: "black", padding: 8 }}>No ads.txt content configured</div>;
  }

  return (
    <pre style={{ 
      margin: 0, 
      padding: "8px", 
      fontFamily: "monospace",
      fontSize: "14px",
      whiteSpace: "pre-wrap",
      background: "#ffffff",
      color: "#000000",
      minHeight: "100vh",
      position: "fixed",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 9999,
    }}>
      {content}
    </pre>
  );
};

export default AdsTxt;
