import * as React from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export interface SearchableSelectOption {
  value: string;
  label: string;
  sublabel?: string;
  imageUrl?: string | null;
}

interface SearchableSelectProps {
  options: SearchableSelectOption[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  className?: string;
  disabled?: boolean;
}

const SearchableSelect = ({
  options,
  value,
  onValueChange,
  placeholder = "Select an option...",
  searchPlaceholder = "Search...",
  emptyText = "No results found.",
  className,
  disabled = false,
}: SearchableSelectProps) => {
  const [open, setOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState("");

  const selectedOption = options.find((option) => option.value === value);

  const filteredOptions = React.useMemo(() => {
    if (!searchQuery) return options;
    const query = searchQuery.toLowerCase();
    return options.filter(
      (option) =>
        option.label.toLowerCase().includes(query) ||
        option.sublabel?.toLowerCase().includes(query)
    );
  }, [options, searchQuery]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between font-normal", className)}
          disabled={disabled}
        >
          {selectedOption ? (
            <div className="flex items-center gap-2 truncate">
              {selectedOption.imageUrl && (
                <img
                  src={selectedOption.imageUrl}
                  alt=""
                  className="w-5 h-5 object-contain rounded"
                />
              )}
              <span className="truncate">{selectedOption.label}</span>
            </div>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command shouldFilter={false} className="flex flex-col">
          <div className="flex items-center border-b px-3">
            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
            <input
              placeholder={searchPlaceholder}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
          <div className="max-h-60 overflow-y-auto overscroll-contain">
            {filteredOptions.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">{emptyText}</div>
            ) : (
              <div className="p-1">
                {filteredOptions.map((option) => (
                  <div
                    key={option.value}
                    onClick={() => {
                      onValueChange(option.value);
                      setOpen(false);
                      setSearchQuery("");
                    }}
                    className="relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === option.value ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      {option.imageUrl && (
                        <img
                          src={option.imageUrl}
                          alt=""
                          className="w-6 h-6 object-contain rounded flex-shrink-0"
                        />
                      )}
                      <div className="flex flex-col min-w-0">
                        <span className="truncate">{option.label}</span>
                        {option.sublabel && (
                          <span className="text-xs text-muted-foreground truncate">
                            {option.sublabel}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

export default SearchableSelect;
