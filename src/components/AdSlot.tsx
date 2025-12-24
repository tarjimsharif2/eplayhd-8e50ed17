import { useSiteSettings } from '@/hooks/useSiteSettings';

interface AdSlotProps {
  position: 'header' | 'sidebar' | 'footer' | 'in_article' | 'popup';
  className?: string;
}

const AdSlot = ({ position, className = '' }: AdSlotProps) => {
  const { data: settings } = useSiteSettings();

  if (!settings?.ads_enabled) return null;

  const adCodeMap: Record<string, string | null> = {
    header: settings.header_ad_code,
    sidebar: settings.sidebar_ad_code,
    footer: settings.footer_ad_code,
    in_article: settings.in_article_ad_code,
    popup: settings.popup_ad_code,
  };

  const adCode = adCodeMap[position];

  if (!adCode) return null;

  return (
    <div 
      className={`ad-slot ad-slot-${position} ${className}`}
      dangerouslySetInnerHTML={{ __html: adCode }}
    />
  );
};

export default AdSlot;
