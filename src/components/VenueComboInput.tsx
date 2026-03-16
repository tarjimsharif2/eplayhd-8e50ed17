import { useState, useEffect, useRef, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { MapPin, Check } from "lucide-react";

interface VenueComboInputProps {
  tournamentId?: string;
  value: string;
  onChange: (value: string) => void;
}

interface TournamentVenue {
  id: string;
  venue_name: string;
  city: string | null;
  country: string | null;
}

const VenueComboInput = ({ tournamentId, value, onChange }: VenueComboInputProps) => {
  const [venues, setVenues] = useState<TournamentVenue[]>([]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  useEffect(() => {
    if (!tournamentId) {
      setVenues([]);
      return;
    }
    const fetchVenues = async () => {
      const { data } = await supabase
        .from("tournament_venues")
        .select("id, venue_name, city, country")
        .eq("tournament_id", tournamentId)
        .order("display_order");
      if (data) setVenues(data as TournamentVenue[]);
    };
    fetchVenues();
  }, [tournamentId]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filtered = useMemo(() => {
    if (!query) return venues;
    const q = query.toLowerCase();
    return venues.filter(
      (v) =>
        v.venue_name.toLowerCase().includes(q) ||
        v.city?.toLowerCase().includes(q) ||
        v.country?.toLowerCase().includes(q)
    );
  }, [venues, query]);

  const handleSelect = (venueName: string) => {
    onChange(venueName);
    setQuery(venueName);
    setOpen(false);
  };

  const handleInputChange = (val: string) => {
    setQuery(val);
    onChange(val);
    if (!open) setOpen(true);
  };

  return (
    <div ref={wrapperRef} className="relative">
      <Input
        placeholder="Search or type venue name..."
        value={query}
        onChange={(e) => handleInputChange(e.target.value)}
        onFocus={() => venues.length > 0 && setOpen(true)}
      />
      {open && venues.length > 0 && (
        <div className="absolute z-50 w-full mt-1 max-h-48 overflow-y-auto rounded-md border border-border bg-popover shadow-md">
          {filtered.length === 0 ? (
            <div className="py-3 text-center text-sm text-muted-foreground">
              No matching venues. Custom value will be used.
            </div>
          ) : (
            filtered.map((venue) => (
              <div
                key={venue.id}
                onClick={() => handleSelect(venue.venue_name)}
                className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-accent hover:text-accent-foreground"
              >
                {value === venue.venue_name ? (
                  <Check className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                ) : (
                  <MapPin className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                )}
                <div className="min-w-0">
                  <span className="block truncate">{venue.venue_name}</span>
                  {(venue.city || venue.country) && (
                    <span className="block text-xs text-muted-foreground truncate">
                      {[venue.city, venue.country].filter(Boolean).join(", ")}
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default VenueComboInput;
