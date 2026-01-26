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
  const hasExecuted = useRef(false);
  const hasTrackedImpression = useRef(false);
  const [adStatus, setAdStatus] = useState<'loading' | 'filled' | 'unfilled'>('loading');

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

  // Use MutationObserver to detect when ad content is loaded
  useEffect(() => {
    if (!containerRef.current || !adCode) return;

    const checkForAds = () => {
      if (!containerRef.current) return;
      
      // Check for AdSense data-ad-status attribute
      const adSlot = containerRef.current.querySelector('ins.adsbygoogle');
      const adStatusAttr = adSlot?.getAttribute('data-ad-status');
      
      if (adStatusAttr === 'filled') {
        setAdStatus('filled');
        return;
      }
      
      if (adStatusAttr === 'unfilled') {
        setAdStatus('unfilled');
        return;
      }
      
      // Fallback: check for iframe or img which means ad loaded
      const hasIframe = containerRef.current.querySelector('iframe') !== null;
      const hasImg = containerRef.current.querySelector('img[src]') !== null;
      
      if (hasIframe || hasImg) {
        setAdStatus('filled');
        return;
      }
      
      // Check container height as last resort
      const insElement = containerRef.current.querySelector('ins');
      if (insElement && insElement.offsetHeight > 10) {
        setAdStatus('filled');
      }
    };

    // Check periodically for ad status changes
    const intervals = [500, 1000, 1500, 2000, 3000, 5000, 8000];
    const timers = intervals.map(delay => setTimeout(checkForAds, delay));

    const observer = new MutationObserver(checkForAds);
    observer.observe(containerRef.current, { 
      childList: true, 
      subtree: true,
      attributes: true,
      attributeFilter: ['data-ad-status', 'src', 'style', 'height']
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
    setAdStatus('loading');
  }, [position]);

  // Don't render anything if no ad code
  if (!adCode) return null;

  // Hide completely if ad failed to load
  const isHidden = adStatus === 'unfilled';

  return (
    <div 
      ref={(node) => {
        containerRef.current = node;
        if (typeof ref === 'function') ref(node);
        else if (ref) ref.current = node;
      }}
      className={`ad-slot ad-slot-${position} ${isHidden ? '' : className}`}
      style={{
        height: isHidden ? 0 : undefined,
        minHeight: isHidden ? 0 : undefined,
        padding: isHidden ? 0 : undefined,
        margin: isHidden ? 0 : undefined,
        overflow: 'hidden',
        visibility: adStatus === 'loading' ? 'hidden' : 'visible',
        position: adStatus === 'loading' ? 'absolute' : 'relative',
        left: adStatus === 'loading' ? '-9999px' : undefined
      }}
    />
  );
});

AdSlot.displayName = 'AdSlot';

export default AdSlot;