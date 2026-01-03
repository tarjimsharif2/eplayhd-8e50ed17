import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { usePublicSiteSettings } from './usePublicSiteSettings';

declare global {
  interface Window {
    gtag: (...args: any[]) => void;
    dataLayer: any[];
  }
}

export const useGoogleAnalytics = () => {
  const { data: settings } = usePublicSiteSettings();
  const location = useLocation();

  // Initialize GA script
  useEffect(() => {
    const gaId = settings?.google_analytics_id;
    if (!gaId) return;

    // Check if script already exists
    if (document.querySelector(`script[src*="googletagmanager.com/gtag/js?id=${gaId}"]`)) {
      return;
    }

    // Load GA script
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${gaId}`;
    document.head.appendChild(script);

    // Initialize dataLayer and gtag
    window.dataLayer = window.dataLayer || [];
    window.gtag = function gtag() {
      window.dataLayer.push(arguments);
    };
    window.gtag('js', new Date());
    window.gtag('config', gaId, {
      send_page_view: false, // We'll send manually for SPA
    });

    console.log('Google Analytics initialized:', gaId);
  }, [settings?.google_analytics_id]);

  // Track page views on route change
  useEffect(() => {
    const gaId = settings?.google_analytics_id;
    if (!gaId || !window.gtag) return;

    window.gtag('config', gaId, {
      page_path: location.pathname + location.search,
      page_title: document.title,
    });

    console.log('GA Page view tracked:', location.pathname);
  }, [location, settings?.google_analytics_id]);
};

// Helper function to track custom events
export const trackEvent = (
  eventName: string,
  eventParams?: Record<string, any>
) => {
  if (window.gtag) {
    window.gtag('event', eventName, eventParams);
    console.log('GA Event tracked:', eventName, eventParams);
  }
};

// Track ad impressions
export const trackAdImpression = (position: string) => {
  trackEvent('ad_impression', {
    ad_position: position,
    page_location: window.location.href,
  });
};
