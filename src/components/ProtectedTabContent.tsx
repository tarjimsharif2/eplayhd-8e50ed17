import { ReactNode } from 'react';
import { TabsContent } from '@/components/ui/tabs';
import { ShieldAlert } from 'lucide-react';

interface ProtectedTabContentProps {
  value: string;
  hasPermission: boolean;
  children: ReactNode;
  className?: string;
}

const ProtectedTabContent = ({ value, hasPermission, children, className }: ProtectedTabContentProps) => {
  return (
    <TabsContent value={value} className={className}>
      {!hasPermission ? (
        <div className="text-center py-12">
          <ShieldAlert className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground">You don't have permission to access this section.</p>
        </div>
      ) : (
        children
      )}
    </TabsContent>
  );
};

export default ProtectedTabContent;
