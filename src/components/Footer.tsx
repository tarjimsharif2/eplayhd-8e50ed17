import { Tv, MessageCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { usePublicSiteSettings } from "@/hooks/usePublicSiteSettings";

const Footer = () => {
  const { data: settings } = usePublicSiteSettings();

  const siteName = settings?.site_name || "LIVE SPORTS";
  const footerText = settings?.footer_text || `© ${new Date().getFullYear()} ${siteName}. All rights reserved.`;
  const telegramLink = settings?.telegram_link || "#";

  return (
    <footer className="bg-card border-t border-border py-8">
      <div className="container mx-auto px-4">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2">
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

          {/* Links */}
          <nav className="flex items-center gap-6 text-sm text-muted-foreground">
            <Link to="/" className="hover:text-foreground transition-colors">Home</Link>
          </nav>

          {/* Social / CTA */}
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

        <div className="mt-8 pt-6 border-t border-border text-center text-sm text-muted-foreground">
          <p>{footerText}</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;