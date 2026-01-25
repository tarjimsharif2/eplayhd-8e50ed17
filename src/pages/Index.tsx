import Header from "@/components/Header";
import MatchList from "@/components/MatchList";
import Footer from "@/components/Footer";
import SEOHead from "@/components/SEOHead";
import AdSlot from "@/components/AdSlot";
import LiveTournaments from "@/components/LiveTournaments";
import FootballScoresWidget from "@/components/FootballScoresWidget";
import { useMatches } from "@/hooks/useSportsData";
import { useMatchStatusUpdater } from "@/hooks/useMatchStatusUpdater";
import { useRealtimeLiveMatches } from "@/hooks/useRealtimeMatch";
import { useFootballScoreSync } from "@/hooks/useFootballScoreSync";

const Index = () => {
  const { data: matches } = useMatches();
  
  // Auto-update match status based on time
  useMatchStatusUpdater(matches);
  
  // Subscribe to real-time match updates
  useRealtimeLiveMatches();
  
  // Auto-sync football scores every 60 seconds
  useFootballScoreSync(60);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <SEOHead />
      <Header />
      <AdSlot position="header" className="container mx-auto px-4 py-2" />
      <main className="flex-1">
        <MatchList />
        <FootballScoresWidget />
        <LiveTournaments />
      </main>
      <AdSlot position="footer" className="container mx-auto px-4 py-2" />
      <Footer />
    </div>
  );
};

export default Index;
