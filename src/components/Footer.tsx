import { Tv, MessageCircle, Trophy } from "lucide-react";
import { Link } from "react-router-dom";
import { usePublicSiteSettings } from "@/hooks/usePublicSiteSettings";
import { useFooterPages } from "@/hooks/useDynamicPages";
import { useTournaments } from "@/hooks/useSportsData";

const Footer = () => {
  const { data: settings } = usePublicSiteSettings();
  const { data: footerPages } = useFooterPages();
  const { data: tournaments } = useTournaments();

  const siteName = settings?.site_name || "LIVE SPORTS";
  const footerText = settings?.footer_text || `© ${new Date().getFullYear()} ${siteName}. All rights reserved.`;
  const telegramLink = settings?.telegram_link || "#";
  // Only show tournaments that have show_in_menu enabled (same setting as header)
  const activeTournaments = tournaments?.filter(t => t.is_active && t.show_in_menu)?.slice(0, 5) || [];

  return (
    <footer className="bg-card border-t border-border py-8">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Logo & Description */}
          <div className="md:col-span-1">
            <Link to="/" className="flex items-center gap-2 mb-4">
              {settings?.logo_url ? (
                <img 
                  src={settings.logo_url} 
                  alt={siteName}
                  className="w-8 h-8 rounded-lg object-contain"
                />
              ) : (
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-pink-500 flex items-center justify-center">
                  <Tv className="w-4 h-4 text-primary-foreground" />
                </div>
              )}
              <span className="font-display text-lg tracking-wider text-gradient">{siteName}</span>
            </Link>
            <p className="text-sm text-muted-foreground mb-4">
              Watch live sports matches online. Get live scores, schedules and streaming links.
            </p>
            <a
              href={telegramLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2 rounded-full transition-colors text-sm font-medium shadow-md"
            >
              <MessageCircle className="w-4 h-4" />
              Join Telegram
            </a>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="font-semibold text-foreground mb-4">Quick Links</h4>
            <nav className="flex flex-col gap-2 text-sm text-muted-foreground">
              <Link to="/" className="hover:text-foreground transition-colors">Home</Link>
              <Link to="/#matches" className="hover:text-foreground transition-colors">Matches</Link>
              {footerPages?.map((page) => (
                <Link 
                  key={page.id} 
                  to={`/page/${page.slug}`} 
                  className="hover:text-foreground transition-colors"
                >
                  {page.title}
                </Link>
              ))}
            </nav>
          </div>

          {/* Tournaments */}
          {activeTournaments.length > 0 && (
            <div>
              <h4 className="font-semibold text-foreground mb-4 flex items-center gap-2">
                <Trophy className="w-4 h-4" />
                Tournaments
              </h4>
              <nav className="flex flex-col gap-2 text-sm text-muted-foreground">
                {activeTournaments.map((tournament) => (
                  <Link 
                    key={tournament.id} 
                    to={`/tournament/${tournament.slug}`} 
                    className="hover:text-foreground transition-colors flex items-center gap-2"
                  >
                    {tournament.logo_url && (
                      <img src={tournament.logo_url} alt="" className="w-4 h-4 object-contain" />
                    )}
                    {tournament.name}
                  </Link>
                ))}
              </nav>
            </div>
          )}

          {/* Legal */}
          <div>
            <h4 className="font-semibold text-foreground mb-4">Legal</h4>
            <nav className="flex flex-col gap-2 text-sm text-muted-foreground">
              {footerPages?.filter(p => ['dmca', 'privacy', 'terms', 'contact-us'].includes(p.slug)).map((page) => (
                <Link 
                  key={page.id} 
                  to={`/page/${page.slug}`} 
                  className="hover:text-foreground transition-colors"
                >
                  {page.title}
                </Link>
              ))}
            </nav>
          </div>
        </div>

        <div className="mt-8 pt-6 border-t border-border text-center text-sm text-muted-foreground">
          <p>{footerText}</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;