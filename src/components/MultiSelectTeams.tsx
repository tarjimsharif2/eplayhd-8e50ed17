import * as React from "react";
import { Check, ChevronsUpDown, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";

export interface TeamOption {
  value: string;
  label: string;
  sublabel?: string;
  imageUrl?: string | null;
}

interface MultiSelectTeamsProps {
  options: TeamOption[];
  selectedValues: string[];
  onSelectionChange: (values: string[]) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  className?: string;
  disabled?: boolean;
  onAddTeams?: () => void;
}

const MultiSelectTeams = ({
  options,
  selectedValues,
  onSelectionChange,
  placeholder = "Select teams...",
  searchPlaceholder = "Search teams...",
  emptyText = "No teams found.",
  className,
  disabled = false,
  onAddTeams,
}: MultiSelectTeamsProps) => {
  const [open, setOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState("");

  const filteredOptions = React.useMemo(() => {
    if (!searchQuery) return options;
    const query = searchQuery.toLowerCase();
    return options.filter(
      (option) =>
        option.label.toLowerCase().includes(query) ||
        option.sublabel?.toLowerCase().includes(query)
    );
  }, [options, searchQuery]);

  const toggleSelection = (value: string) => {
    if (selectedValues.includes(value)) {
      onSelectionChange(selectedValues.filter(v => v !== value));
    } else {
      onSelectionChange([...selectedValues, value]);
    }
  };

  const handleAddTeams = () => {
    if (onAddTeams) {
      onAddTeams();
    }
    setOpen(false);
    setSearchQuery("");
    onSelectionChange([]);
  };

  const selectedCount = selectedValues.length;

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
          {selectedCount > 0 ? (
            <span className="text-foreground">{selectedCount} teams selected</span>
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
          
          {selectedCount > 0 && (
            <div className="p-2 border-b flex flex-wrap gap-1">
              {selectedValues.map(value => {
                const option = options.find(o => o.value === value);
                return option ? (
                  <Badge 
                    key={value} 
                    variant="secondary" 
                    className="flex items-center gap-1 pr-1"
                  >
                    {option.imageUrl && (
                      <img src={option.imageUrl} alt="" className="w-4 h-4 object-contain rounded" />
                    )}
                    <span className="text-xs">{option.sublabel || option.label}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleSelection(value);
                      }}
                      className="ml-1 rounded-full hover:bg-muted-foreground/20 p-0.5"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ) : null;
              })}
            </div>
          )}
          
          <div className="max-h-48 overflow-y-auto overscroll-contain">
            {filteredOptions.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">{emptyText}</div>
            ) : (
              <div className="p-1">
                {filteredOptions.map((option) => (
                  <div
                    key={option.value}
                    onClick={() => toggleSelection(option.value)}
                    className="relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
                  >
                    <div className={cn(
                      "mr-2 h-4 w-4 border rounded flex items-center justify-center",
                      selectedValues.includes(option.value) 
                        ? "bg-primary border-primary" 
                        : "border-muted-foreground/50"
                    )}>
                      {selectedValues.includes(option.value) && (
                        <Check className="h-3 w-3 text-primary-foreground" />
                      )}
                    </div>
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
          
          {selectedCount > 0 && (
            <div className="p-2 border-t">
              <Button 
                size="sm" 
                className="w-full"
                onClick={handleAddTeams}
              >
                Add {selectedCount} Team{selectedCount > 1 ? 's' : ''}
              </Button>
            </div>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  );
};

export default MultiSelectTeams;
