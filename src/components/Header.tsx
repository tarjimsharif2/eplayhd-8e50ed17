import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Menu, X, Tv, Trophy } from "lucide-react";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ThemeToggle from "@/components/ThemeToggle";
import { usePublicSiteSettings } from "@/hooks/usePublicSiteSettings";
import { useHeaderPages } from "@/hooks/useDynamicPages";
import { useTournaments } from "@/hooks/useSportsData";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const Header = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const location = useLocation();
  const { data: settings } = usePublicSiteSettings();
  const { data: headerPages } = useHeaderPages();
  const { data: tournaments } = useTournaments();

  // Only show Home and Matches - no Admin link
  const navItems = [
    { name: "Home", path: "/" },
    { name: "Matches", path: "/#matches" },
  ];

  const activeTournaments = tournaments?.filter(t => t.is_active) || [];
  const siteName = settings?.site_name || "LIVE SPORTS";

  return (
    <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 group">
            {settings?.logo_url ? (
              <img 
                src={settings.logo_url} 
                alt={siteName}
                className="w-10 h-10 rounded-xl object-contain"
              />
            ) : (
              <div className="w-10 h-10 rounded-xl bg-gradient-primary flex items-center justify-center premium-shadow group-hover:glow-primary transition-shadow">
                <Tv className="w-5 h-5 text-primary-foreground" />
              </div>
            )}
            <div className="flex flex-col">
              <span className="font-display text-lg tracking-wide text-gradient">{siteName}</span>
              <span className="text-[9px] text-muted-foreground -mt-1 tracking-wider">ANYTIME, ANYWHERE</span>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((item) => (
              <Link key={item.name} to={item.path}>
                <Button
                  variant={location.pathname === item.path ? "secondary" : "ghost"}
                  size="sm"
                >
                  {item.name}
                </Button>
              </Link>
            ))}
            
            {/* Tournaments Dropdown */}
            {activeTournaments.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="gap-1">
                    <Trophy className="w-4 h-4" />
                    Tournaments
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {activeTournaments.map((tournament) => (
                    <DropdownMenuItem key={tournament.id} asChild>
                      <Link to={`/tournament/${tournament.slug}`}>
                        {tournament.name}
                      </Link>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
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
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="p-2 text-foreground"
            >
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
                <Link
                  key={item.name}
                  to={item.path}
                  onClick={() => setIsMenuOpen(false)}
                >
                  <Button
                    variant={location.pathname === item.path ? "secondary" : "ghost"}
                    className="w-full justify-start"
                  >
                    {item.name}
                  </Button>
                </Link>
              ))}
              
              {/* Mobile Tournaments */}
              {activeTournaments.length > 0 && (
                <>
                  <div className="text-sm font-medium text-muted-foreground px-4 pt-2">Tournaments</div>
                  {activeTournaments.map((tournament) => (
                    <Link
                      key={tournament.id}
                      to={`/tournament/${tournament.slug}`}
                      onClick={() => setIsMenuOpen(false)}
                    >
                      <Button variant="ghost" className="w-full justify-start pl-8">
                        {tournament.name}
                      </Button>
                    </Link>
                  ))}
                </>
              )}
              
              {/* Mobile Dynamic Pages */}
              {headerPages && headerPages.length > 0 && (
                <>
                  {headerPages.map((page) => (
                    <Link
                      key={page.id}
                      to={`/page/${page.slug}`}
                      onClick={() => setIsMenuOpen(false)}
                    >
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
