import Header from "@/components/Header";
import MatchList from "@/components/MatchList";
import Footer from "@/components/Footer";
import SEOHead from "@/components/SEOHead";
import AdSlot from "@/components/AdSlot";
import { useMatches } from "@/hooks/useSportsData";
import { useMatchStatusUpdater } from "@/hooks/useMatchStatusUpdater";

const Index = () => {
  const { data: matches } = useMatches();
  
  // Auto-update match status based on time
  useMatchStatusUpdater(matches);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <SEOHead />
      <Header />
      <AdSlot position="header" className="container mx-auto px-4 py-2" />
      <main className="flex-1">
        <MatchList />
      </main>
      <AdSlot position="footer" className="container mx-auto px-4 py-2" />
      <Footer />
    </div>
  );
};

export default Index;
