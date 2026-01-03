import { useEffect, useRef, useMemo, forwardRef } from 'react';
import { useSiteSettings } from '@/hooks/useSiteSettings';
import { trackAdImpression } from '@/hooks/useGoogleAnalytics';

interface AdSlotProps {
  position: 'header' | 'sidebar' | 'footer' | 'in_article' | 'popup';
  className?: string;
}

const AdSlot = forwardRef<HTMLDivElement, AdSlotProps>(({ position, className = '' }, ref) => {
  const { data: settings } = useSiteSettings();
  const containerRef = useRef<HTMLDivElement>(null);
  const hasExecuted = useRef(false);
  const hasTrackedImpression = useRef(false);

  const adCode = useMemo(() => {
    if (!settings?.ads_enabled) return null;

    const adCodeMap: Record<string, string | null | undefined> = {
      header: settings.header_ad_code,
      sidebar: settings.sidebar_ad_code,
      footer: settings.footer_ad_code,
      in_article: settings.in_article_ad_code,
      popup: settings.popup_ad_code,
    };

    return adCodeMap[position] || null;
  }, [settings, position]);

  useEffect(() => {
    if (!adCode || !containerRef.current || hasExecuted.current) return;

    const container = containerRef.current;
    
    // Clear existing content
    container.innerHTML = '';
    
    // Create a temporary container to parse the HTML
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = adCode;

    // Extract scripts and non-script content separately
    const scripts: HTMLScriptElement[] = [];
    const nonScriptNodes: Node[] = [];

    tempDiv.childNodes.forEach((node) => {
      if (node.nodeName === 'SCRIPT') {
        scripts.push(node as HTMLScriptElement);
      } else {
        nonScriptNodes.push(node.cloneNode(true));
      }
    });

    // Add non-script content first
    nonScriptNodes.forEach((node) => {
      container.appendChild(node);
    });

    // Execute scripts properly
    scripts.forEach((oldScript) => {
      const newScript = document.createElement('script');
      
      // Copy all attributes
      Array.from(oldScript.attributes).forEach((attr) => {
        newScript.setAttribute(attr.name, attr.value);
      });

      // If it's an external script, just set src
      if (oldScript.src) {
        newScript.src = oldScript.src;
      } else {
        // For inline scripts, copy the content
        newScript.textContent = oldScript.textContent;
      }

      // Append to container (this will execute the script)
      container.appendChild(newScript);
    });

    hasExecuted.current = true;

    // Track ad impression
    if (!hasTrackedImpression.current) {
      trackAdImpression(position);
      hasTrackedImpression.current = true;
    }

    // Cleanup on unmount
    return () => {
      hasExecuted.current = false;
    };
  }, [adCode, position]);

  // Reset execution flag when position changes
  useEffect(() => {
    hasExecuted.current = false;
    hasTrackedImpression.current = false;
  }, [position]);

  if (!adCode) return null;

  return (
    <div 
      ref={(node) => {
        containerRef.current = node;
        if (typeof ref === 'function') ref(node);
        else if (ref) ref.current = node;
      }}
      className={`ad-slot ad-slot-${position} ${className}`}
    />
  );
});

AdSlot.displayName = 'AdSlot';

export default AdSlot;