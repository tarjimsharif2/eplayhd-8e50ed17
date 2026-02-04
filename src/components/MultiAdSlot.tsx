import { useEffect, useRef, useMemo } from 'react';
import { usePublicSiteSettings } from '@/hooks/usePublicSiteSettings';
import { trackAdImpression } from '@/hooks/useGoogleAnalytics';

interface AdCodeSlot {
  id: string;
  name: string;
  code: string;
  enabled: boolean;
}

interface MultipleAdCodes {
  header: AdCodeSlot[];
  sidebar: AdCodeSlot[];
  footer: AdCodeSlot[];
  in_article: AdCodeSlot[];
  popup: AdCodeSlot[];
  match_before_player: AdCodeSlot[];
  match_after_player: AdCodeSlot[];
  match_sidebar: AdCodeSlot[];
  match_below_info: AdCodeSlot[];
  tournament_before_matches: AdCodeSlot[];
  tournament_after_matches: AdCodeSlot[];
  tournament_sidebar: AdCodeSlot[];
  tournament_before_points: AdCodeSlot[];
  tournament_after_points: AdCodeSlot[];
}

interface MultiAdSlotProps {
  position: keyof MultipleAdCodes;
  className?: string;
  fallbackPosition?: 'header' | 'sidebar' | 'footer' | 'in_article' | 'popup';
}

const MultiAdSlot = ({ position, className = '', fallbackPosition }: MultiAdSlotProps) => {
  const { data: settings } = usePublicSiteSettings();
  const containerRef = useRef<HTMLDivElement>(null);
  const hasExecuted = useRef(false);
  const hasTrackedImpression = useRef(false);

  // Get ad slots for this position
  const adSlots = useMemo(() => {
    if (!settings?.ads_enabled) return [];
    
    const multipleAdCodes = (settings as any).multiple_ad_codes as MultipleAdCodes | null;
    if (!multipleAdCodes) return [];
    
    const slots = multipleAdCodes[position] || [];
    return slots.filter((slot: AdCodeSlot) => slot.enabled && slot.code?.trim());
  }, [settings, position]);

  // Fallback to legacy single ad code if no slots configured
  const legacyAdCode = useMemo(() => {
    if (!settings?.ads_enabled || adSlots.length > 0) return null;
    if (!fallbackPosition) return null;
    
    const legacyCodeMap: Record<string, string | null | undefined> = {
      header: settings.header_ad_code,
      sidebar: settings.sidebar_ad_code,
      footer: settings.footer_ad_code,
      in_article: settings.in_article_ad_code,
      popup: settings.popup_ad_code,
    };
    
    return legacyCodeMap[fallbackPosition] || null;
  }, [settings, adSlots.length, fallbackPosition]);

  useEffect(() => {
    if (!containerRef.current || hasExecuted.current) return;
    if (adSlots.length === 0 && !legacyAdCode) return;

    const container = containerRef.current;
    
    // Clear existing content
    container.innerHTML = '';

    // Combine all ad codes to execute
    const allCodes: string[] = adSlots.length > 0 
      ? adSlots.map((slot: AdCodeSlot) => slot.code)
      : legacyAdCode 
        ? [legacyAdCode] 
        : [];

    allCodes.forEach((adCode: string) => {
      // Create a wrapper div for each ad slot
      const slotWrapper = document.createElement('div');
      slotWrapper.className = 'ad-slot-item mb-2';
      
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
        slotWrapper.appendChild(node);
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
          newScript.async = true;
        } else {
          // For inline scripts, copy the content
          newScript.textContent = oldScript.textContent;
        }

        // Append to slotWrapper (this will execute the script)
        slotWrapper.appendChild(newScript);
      });

      container.appendChild(slotWrapper);
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
  }, [adSlots, legacyAdCode, position]);

  // Reset execution flag when position changes
  useEffect(() => {
    hasExecuted.current = false;
    hasTrackedImpression.current = false;
  }, [position]);

  // Don't render anything if no ad codes
  if (adSlots.length === 0 && !legacyAdCode) return null;

  return (
    <div 
      ref={containerRef}
      className={`multi-ad-slot multi-ad-slot-${position} ${className}`}
      style={{
        minHeight: position.includes('sidebar') ? '250px' : '100px',
        width: '100%',
        overflow: 'visible',
        display: 'block',
      }}
      data-ad-position={position}
    />
  );
};

export default MultiAdSlot;
