import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const AdsTxt = () => {
  const [content, setContent] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAdsTxt = async () => {
      const { data } = await supabase
        .from("site_settings_public")
        .select("*")
        .limit(1)
        .maybeSingle();

      const settings = data as { ads_txt_content?: string } | null;
      if (settings?.ads_txt_content) {
        setContent(settings.ads_txt_content);
      }
      setLoading(false);
    };

    fetchAdsTxt();
  }, []);

  useEffect(() => {
    // Set content type to plain text
    document.title = "ads.txt";
  }, []);

  if (loading) {
    return null;
  }

  return (
    <pre style={{ 
      margin: 0, 
      padding: 0, 
      fontFamily: "monospace",
      whiteSpace: "pre-wrap",
      background: "white",
      color: "black",
      minHeight: "100vh"
    }}>
      {content}
    </pre>
  );
};

export default AdsTxt;
