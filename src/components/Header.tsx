import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Menu, X, Trophy, ChevronDown } from "lucide-react";
import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ThemeToggle from "@/components/ThemeToggle";
import { usePublicSiteSettings } from "@/hooks/usePublicSiteSettings";
import { useHeaderPages } from "@/hooks/useDynamicPages";
import { useTournaments } from "@/hooks/useSportsData";

const Header = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isTournamentOpen, setIsTournamentOpen] = useState(false);
  const [isMobileTournamentOpen, setIsMobileTournamentOpen] = useState(false);
  const location = useLocation();
  const { data: settings } = usePublicSiteSettings();
  const { data: headerPages } = useHeaderPages();
  const { data: tournaments } = useTournaments();

  // Only show Home and Matches - no Admin link
  const navItems = [
    { name: "Home", path: "/" },
    { name: "Matches", path: "/#matches" },
  ];

  const menuTournaments = tournaments?.filter((t) => t.is_active && t.show_in_menu && !t.is_completed) || [];

  // Group tournaments by sport
  const tournamentsBySport = useMemo(() => {
    const groups: Record<string, typeof menuTournaments> = {};
    menuTournaments.forEach((tournament) => {
      const sport = tournament.sport || "Other";
      if (!groups[sport]) {
        groups[sport] = [];
      }
      groups[sport].push(tournament);
    });
    return groups;
  }, [menuTournaments]);

  const siteName = settings?.site_name || "ePlayHD.com";

  return (
    <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-3 group">
            {settings?.logo_url ? (
              <img 
                src={settings.logo_url} 
                alt={siteName} 
                className="h-14 sm:h-16 w-auto max-w-[200px] object-contain" 
              />
            ) : (
              <span className="font-display text-xl sm:text-2xl tracking-wide text-gradient">{siteName}</span>
            )}
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((item) => (
              <Link key={item.name} to={item.path}>
                <Button variant={location.pathname === item.path ? "secondary" : "ghost"} size="sm">
                  {item.name}
                </Button>
              </Link>
            ))}

            {/* Tournaments Dropdown - Click to toggle, grouped by sport */}
            {menuTournaments.length > 0 && (
              <div className="relative">
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1"
                  onClick={() => setIsTournamentOpen(!isTournamentOpen)}
                >
                  <Trophy className="w-4 h-4" />
                  Tournaments
                  <ChevronDown className={`w-3 h-3 transition-transform ${isTournamentOpen ? "rotate-180" : ""}`} />
                </Button>
                <AnimatePresence>
                  {isTournamentOpen && (
                    <>
                      {/* Backdrop to close dropdown */}
                      <div className="fixed inset-0 z-40" onClick={() => setIsTournamentOpen(false)} />
                      <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.15 }}
                        className="absolute top-full right-0 mt-1 min-w-[220px] max-h-[70vh] overflow-y-auto bg-popover border border-border rounded-md shadow-lg z-50 py-1"
                      >
                        {Object.entries(tournamentsBySport).map(([sport, sportTournaments], sportIndex) => (
                          <div key={sport}>
                            {sportIndex > 0 && <div className="border-t border-border/50 my-1" />}
                            <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider bg-muted/30">
                              {sport}
                            </div>
                            {sportTournaments.map((tournament) => (
                              <Link
                                key={tournament.id}
                                to={`/tournament/${tournament.slug}`}
                                onClick={() => setIsTournamentOpen(false)}
                                className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
                              >
                                {tournament.logo_url && (
                                  <div
                                    className={`w-5 h-5 rounded-md p-0.5 border flex items-center justify-center flex-shrink-0 ${
                                      (tournament as any).logo_background_color
                                        ? 'border-border/30'
                                        : 'bg-background/60 border-border/30'
                                    }`}
                                    style={(tournament as any).logo_background_color ? { backgroundColor: (tournament as any).logo_background_color } : undefined}
                                  >
                                    <img src={tournament.logo_url} alt="" className="w-full h-full object-contain" />
                                  </div>
                                )}
                                {tournament.name}
                              </Link>
                            ))}
                          </div>
                        ))}
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>
            )}

            {/* Dynamic Header Pages */}
            {headerPages?.map((page) => (
              <Link key={page.id} to={`/page/${page.slug}`}>
                <Button variant="ghost" size="sm">
                  {page.title}
                </Button>
              </Link>
            ))}

            <div className="ml-2 pl-2 border-l border-border">
              <ThemeToggle />
            </div>
          </nav>

          {/* Mobile Menu Toggle */}
          <div className="flex items-center gap-2 md:hidden">
            <ThemeToggle />
            <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="p-2 text-foreground">
              {isMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      <AnimatePresence>
        {isMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden bg-card border-b border-border"
          >
            <nav className="container mx-auto px-4 py-4 flex flex-col gap-2">
              {navItems.map((item) => (
                <Link key={item.name} to={item.path} onClick={() => setIsMenuOpen(false)}>
                  <Button
                    variant={location.pathname === item.path ? "secondary" : "ghost"}
                    className="w-full justify-start"
                  >
                    {item.name}
                  </Button>
                </Link>
              ))}

              {/* Mobile Tournaments - Click to toggle, grouped by sport */}
              {menuTournaments.length > 0 && (
                <div>
                  <Button
                    variant="ghost"
                    className="w-full justify-between"
                    onClick={() => setIsMobileTournamentOpen(!isMobileTournamentOpen)}
                  >
                    <span className="flex items-center gap-2">
                      <Trophy className="w-4 h-4" />
                      Tournaments
                    </span>
                    <ChevronDown
                      className={`w-4 h-4 transition-transform ${isMobileTournamentOpen ? "rotate-180" : ""}`}
                    />
                  </Button>
                  <AnimatePresence>
                    {isMobileTournamentOpen && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                      >
                        {Object.entries(tournamentsBySport).map(([sport, sportTournaments], sportIndex) => (
                          <div key={sport}>
                            {sportIndex > 0 && <div className="border-t border-border/30 my-1 ml-6" />}
                            <div className="pl-8 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                              {sport}
                            </div>
                            {sportTournaments.map((tournament) => (
                              <Link
                                key={tournament.id}
                                to={`/tournament/${tournament.slug}`}
                                onClick={() => setIsMenuOpen(false)}
                              >
                                <Button variant="ghost" className="w-full justify-start pl-10 gap-2">
                                  {tournament.logo_url && (
                                     <div
                                       className={`w-4 h-4 rounded p-0.5 border flex items-center justify-center flex-shrink-0 ${
                                         (tournament as any).logo_background_color
                                           ? 'border-border/30'
                                           : 'bg-background/60 border-border/30'
                                       }`}
                                       style={(tournament as any).logo_background_color ? { backgroundColor: (tournament as any).logo_background_color } : undefined}
                                     >
                                       <img src={tournament.logo_url} alt="" className="w-full h-full object-contain" />
                                     </div>
                                  )}
                                  {tournament.name}
                                </Button>
                              </Link>
                            ))}
                          </div>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}

              {/* Mobile Dynamic Pages */}
              {headerPages && headerPages.length > 0 && (
                <>
                  {headerPages.map((page) => (
                    <Link key={page.id} to={`/page/${page.slug}`} onClick={() => setIsMenuOpen(false)}>
                      <Button variant="ghost" className="w-full justify-start">
                        {page.title}
                      </Button>
                    </Link>
                  ))}
                </>
              )}
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
};

export default Header;
