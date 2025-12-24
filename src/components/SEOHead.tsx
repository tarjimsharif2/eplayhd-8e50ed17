import { useEffect } from 'react';
import { useSiteSettings } from '@/hooks/useSiteSettings';

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
  const { data: settings } = useSiteSettings();

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

    // Google Analytics
    if (settings.google_analytics_id && !document.querySelector(`script[src*="${settings.google_analytics_id}"]`)) {
      const gaScript = document.createElement('script');
      gaScript.async = true;
      gaScript.src = `https://www.googletagmanager.com/gtag/js?id=${settings.google_analytics_id}`;
      document.head.appendChild(gaScript);

      const gaConfig = document.createElement('script');
      gaConfig.innerHTML = `
        window.dataLayer = window.dataLayer || [];
        function gtag(){dataLayer.push(arguments);}
        gtag('js', new Date());
        gtag('config', '${settings.google_analytics_id}');
      `;
      document.head.appendChild(gaConfig);
    }

    // Google AdSense
    if (settings.google_adsense_id && settings.ads_enabled && !document.querySelector(`script[src*="adsbygoogle"]`)) {
      const adsenseScript = document.createElement('script');
      adsenseScript.async = true;
      adsenseScript.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${settings.google_adsense_id}`;
      adsenseScript.crossOrigin = 'anonymous';
      document.head.appendChild(adsenseScript);
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
