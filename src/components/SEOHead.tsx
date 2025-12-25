import { useEffect } from 'react';
import { usePublicSiteSettings } from '@/hooks/usePublicSiteSettings';

interface SEOHeadProps {
  title?: string;
  description?: string;
  keywords?: string;
  ogImage?: string;
  canonicalUrl?: string;
  type?: 'website' | 'article';
}

const SEOHead = ({ 
  title, 
  description, 
  keywords, 
  ogImage,
  canonicalUrl,
  type = 'website'
}: SEOHeadProps) => {
  const { data: settings } = usePublicSiteSettings();

  useEffect(() => {
    if (!settings) return;

    const finalTitle = title || settings.site_title;
    const finalDescription = description || settings.site_description || '';
    const finalKeywords = keywords || settings.site_keywords || '';
    const finalOgImage = ogImage || settings.og_image_url || '';
    const finalCanonical = canonicalUrl || settings.canonical_url || window.location.href;

    // Update document title
    document.title = finalTitle;

    // Helper to update or create meta tag
    const updateMeta = (name: string, content: string, property?: boolean) => {
      const attr = property ? 'property' : 'name';
      let element = document.querySelector(`meta[${attr}="${name}"]`) as HTMLMetaElement;
      if (!element) {
        element = document.createElement('meta');
        element.setAttribute(attr, name);
        document.head.appendChild(element);
      }
      element.content = content;
    };

    // Update meta tags
    updateMeta('description', finalDescription);
    updateMeta('keywords', finalKeywords);
    updateMeta('author', settings.site_name);
    updateMeta('robots', 'index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1');
    updateMeta('googlebot', 'index, follow');
    
    // Open Graph
    updateMeta('og:title', finalTitle, true);
    updateMeta('og:description', finalDescription, true);
    updateMeta('og:type', type, true);
    updateMeta('og:url', finalCanonical, true);
    if (finalOgImage) {
      updateMeta('og:image', finalOgImage, true);
    }

    // Twitter Card
    updateMeta('twitter:card', 'summary_large_image');
    updateMeta('twitter:title', finalTitle);
    updateMeta('twitter:description', finalDescription);
    if (finalOgImage) {
      updateMeta('twitter:image', finalOgImage);
    }
    if (settings.twitter_handle) {
      updateMeta('twitter:site', settings.twitter_handle);
    }

    // Facebook App ID
    if (settings.facebook_app_id) {
      updateMeta('fb:app_id', settings.facebook_app_id, true);
    }

    // Canonical URL
    let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement;
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.rel = 'canonical';
      document.head.appendChild(canonical);
    }
    canonical.href = finalCanonical;

    // Favicon
    if (settings.favicon_url) {
      let favicon = document.querySelector('link[rel="icon"]') as HTMLLinkElement;
      if (!favicon) {
        favicon = document.createElement('link');
        favicon.rel = 'icon';
        document.head.appendChild(favicon);
      }
      favicon.href = settings.favicon_url;
    }

    // Google Analytics - with XSS protection via strict ID validation
    if (settings.google_analytics_id && !document.querySelector('script[data-ga-initialized="true"]')) {
      // Validate GA ID format: G-XXXXXXXXXX (GA4) or UA-XXXXXXXXX-X (Universal Analytics)
      const gaIdRegex = /^(G-[A-Z0-9]{6,12}|UA-\d{6,10}-\d{1,2})$/i;
      const sanitizedGaId = settings.google_analytics_id.trim();
      
      if (gaIdRegex.test(sanitizedGaId)) {
        const gaScript = document.createElement('script');
        gaScript.async = true;
        gaScript.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(sanitizedGaId)}`;
        gaScript.setAttribute('data-ga-initialized', 'true');
        document.head.appendChild(gaScript);

        const gaConfig = document.createElement('script');
        // Use only alphanumeric and hyphen characters for extra safety
        const safeGaId = sanitizedGaId.replace(/[^A-Z0-9-]/gi, '');
        gaConfig.innerHTML = `
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${safeGaId}');
        `;
        document.head.appendChild(gaConfig);
      } else {
        console.error('Invalid Google Analytics ID format:', sanitizedGaId);
      }
    }

    // Google AdSense - with XSS protection via strict ID validation
    if (settings.google_adsense_id && settings.ads_enabled && !document.querySelector('script[data-adsense-initialized="true"]')) {
      // Validate AdSense ID format: ca-pub-XXXXXXXXXX
      const adsenseIdRegex = /^ca-pub-\d{10,20}$/i;
      const sanitizedAdsenseId = settings.google_adsense_id.trim();
      
      if (adsenseIdRegex.test(sanitizedAdsenseId)) {
        const adsenseScript = document.createElement('script');
        adsenseScript.async = true;
        adsenseScript.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(sanitizedAdsenseId)}`;
        adsenseScript.crossOrigin = 'anonymous';
        adsenseScript.setAttribute('data-adsense-initialized', 'true');
        document.head.appendChild(adsenseScript);
      } else {
        console.error('Invalid Google AdSense ID format:', sanitizedAdsenseId);
      }
    }

    // Schema.org JSON-LD
    if (settings.schema_org_enabled) {
      let schemaScript = document.querySelector('script[type="application/ld+json"]');
      if (!schemaScript) {
        schemaScript = document.createElement('script');
        schemaScript.setAttribute('type', 'application/ld+json');
        document.head.appendChild(schemaScript);
      }
      
      const schemaData = {
        "@context": "https://schema.org",
        "@type": "WebSite",
        "name": settings.site_name,
        "url": finalCanonical,
        "description": finalDescription,
        "publisher": {
          "@type": "Organization",
          "name": settings.site_name,
          "logo": settings.logo_url ? {
            "@type": "ImageObject",
            "url": settings.logo_url
          } : undefined
        }
      };
      schemaScript.innerHTML = JSON.stringify(schemaData);
    }

  }, [settings, title, description, keywords, ogImage, canonicalUrl, type]);

  return null;
};

export default SEOHead;
