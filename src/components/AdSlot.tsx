import { useEffect, useRef, useMemo, forwardRef, useState } from 'react';
import { useSiteSettings } from '@/hooks/useSiteSettings';
import { trackAdImpression } from '@/hooks/useGoogleAnalytics';

interface AdSlotProps {
  position: 'header' | 'sidebar' | 'footer' | 'in_article' | 'popup';
  className?: string;
}

const AdSlot = forwardRef<HTMLDivElement, AdSlotProps>(({ position, className = '' }, ref) => {
  const { data: settings } = useSiteSettings();
  const containerRef = useRef<HTMLDivElement>(null);
  const hiddenContainerRef = useRef<HTMLDivElement>(null);
  const hasExecuted = useRef(false);
  const hasTrackedImpression = useRef(false);
  const [hasContent, setHasContent] = useState(false);

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
    if (!adCode || !hiddenContainerRef.current || hasExecuted.current) return;

    const container = hiddenContainerRef.current;
    
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

  // Use MutationObserver to detect when ad content is added
  useEffect(() => {
    if (!hiddenContainerRef.current || !adCode) return;

    const checkForAds = () => {
      if (hiddenContainerRef.current) {
        // Check for common ad elements
        const hasAdElements = hiddenContainerRef.current.querySelector('ins.adsbygoogle, iframe, img[src*="ad"], div[data-ad-slot]') !== null;
        // Also check if the container has reasonable height (ad loaded)
        const hasHeight = hiddenContainerRef.current.offsetHeight > 20;
        
        if (hasAdElements || hasHeight) {
          setHasContent(true);
          // Move content to visible container
          if (containerRef.current && hiddenContainerRef.current) {
            containerRef.current.innerHTML = hiddenContainerRef.current.innerHTML;
            // Clone and execute scripts
            hiddenContainerRef.current.querySelectorAll('script').forEach(script => {
              const newScript = document.createElement('script');
              Array.from(script.attributes).forEach(attr => {
                newScript.setAttribute(attr.name, attr.value);
              });
              if (script.src) {
                newScript.src = script.src;
              } else {
                newScript.textContent = script.textContent;
              }
              containerRef.current?.appendChild(newScript);
            });
          }
        }
      }
    };

    // Check periodically for 5 seconds
    const intervals = [500, 1000, 2000, 3000, 5000];
    const timers = intervals.map(delay => setTimeout(checkForAds, delay));

    const observer = new MutationObserver(checkForAds);
    observer.observe(hiddenContainerRef.current, { 
      childList: true, 
      subtree: true,
      attributes: true,
      characterData: true
    });

    return () => {
      timers.forEach(clearTimeout);
      observer.disconnect();
    };
  }, [adCode]);

  // Reset execution flag when position changes
  useEffect(() => {
    hasExecuted.current = false;
    hasTrackedImpression.current = false;
    setHasContent(false);
  }, [position]);

  if (!adCode) return null;

  return (
    <>
      {/* Hidden container where ads load initially */}
      <div 
        ref={hiddenContainerRef}
        style={{ 
          position: 'absolute',
          left: '-9999px',
          top: '-9999px',
          visibility: 'hidden',
          pointerEvents: 'none'
        }}
        aria-hidden="true"
      />
      {/* Visible container - only shows when ad has content */}
      {hasContent && (
        <div 
          ref={(node) => {
            containerRef.current = node;
            if (typeof ref === 'function') ref(node);
            else if (ref) ref.current = node;
          }}
          className={`ad-slot ad-slot-${position} ${className}`}
        />
      )}
    </>
  );
});

AdSlot.displayName = 'AdSlot';

export default AdSlot;