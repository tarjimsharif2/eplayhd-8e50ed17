import { useGoogleAnalytics } from '@/hooks/useGoogleAnalytics';

interface GoogleAnalyticsProviderProps {
  children: React.ReactNode;
}

const GoogleAnalyticsProvider = ({ children }: GoogleAnalyticsProviderProps) => {
  useGoogleAnalytics();
  return <>{children}</>;
};

export default GoogleAnalyticsProvider;
