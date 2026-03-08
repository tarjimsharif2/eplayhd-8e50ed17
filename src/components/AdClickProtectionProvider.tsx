import React, { createContext, useContext } from 'react';
import { useAdClickProtection } from '@/hooks/useAdClickProtection';

interface AdClickProtectionContextType {
  isBlocked: boolean;
  isLoading: boolean;
  trackAdClick: () => Promise<void>;
}

const AdClickProtectionContext = createContext<AdClickProtectionContextType>({
  isBlocked: false,
  isLoading: false,
  trackAdClick: async () => {},
});

export const useAdClickProtectionContext = () => useContext(AdClickProtectionContext);

export const AdClickProtectionProvider = ({ children }: { children: React.ReactNode }) => {
  const protection = useAdClickProtection();

  return (
    <AdClickProtectionContext.Provider value={protection}>
      {children}
    </AdClickProtectionContext.Provider>
  );
};
