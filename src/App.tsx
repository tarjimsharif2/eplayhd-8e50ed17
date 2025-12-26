import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { ThemeProvider } from "@/hooks/useTheme";
import CustomCodeInjector from "@/components/CustomCodeInjector";
import Index from "./pages/Index";
import Admin from "./pages/Admin";
import Auth from "./pages/Auth";
import MatchPage from "./pages/MatchPage";
import TournamentPage from "./pages/TournamentPage";
import DynamicPage from "./pages/DynamicPage";
import AdsTxt from "./pages/AdsTxt";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <CustomCodeInjector />
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/admin" element={<Admin />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/match/:slug" element={<MatchPage />} />
              <Route path="/tournament/:slug" element={<TournamentPage />} />
              <Route path="/page/:slug" element={<DynamicPage />} />
              {/* Handle both /ads.txt and /ads.txt/ */}
              <Route path="/ads.txt/*" element={<AdsTxt />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
