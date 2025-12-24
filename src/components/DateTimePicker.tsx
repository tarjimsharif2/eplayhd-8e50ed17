import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { CalendarClock } from "lucide-react";
import { cn } from "@/lib/utils";

interface DateTimePickerProps {
  value: Date | null;
  onChange: (date: Date | null) => void;
  placeholder?: string;
}

const months = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

const WheelPicker = ({ 
  items, 
  value, 
  onChange,
  className
}: { 
  items: (string | number)[]; 
  value: string | number; 
  onChange: (val: string | number) => void;
  className?: string;
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const itemHeight = 40;
  const visibleItems = 3;
  
  const currentIndex = items.indexOf(value);
  
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = currentIndex * itemHeight;
    }
  }, [currentIndex]);

  const handleScroll = () => {
    if (containerRef.current) {
      const scrollTop = containerRef.current.scrollTop;
      const index = Math.round(scrollTop / itemHeight);
      if (index >= 0 && index < items.length && items[index] !== value) {
        onChange(items[index]);
      }
    }
  };

  return (
    <div className={cn("relative h-[120px] overflow-hidden", className)}>
      {/* Selection indicator */}
      <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-10 border-y border-primary/30 bg-primary/5 pointer-events-none z-10" />
      
      <div 
        ref={containerRef}
        onScroll={handleScroll}
        className="h-full overflow-y-auto scrollbar-hide snap-y snap-mandatory"
        style={{ scrollSnapType: 'y mandatory', paddingTop: itemHeight, paddingBottom: itemHeight }}
      >
        {items.map((item, i) => (
          <div 
            key={i}
            onClick={() => {
              onChange(item);
              if (containerRef.current) {
                containerRef.current.scrollTo({ top: i * itemHeight, behavior: 'smooth' });
              }
            }}
            className={cn(
              "h-10 flex items-center justify-center cursor-pointer transition-all snap-center",
              items[currentIndex] === item 
                ? "text-foreground font-semibold text-lg" 
                : "text-muted-foreground text-sm opacity-50"
            )}
          >
            {item}
          </div>
        ))}
      </div>
    </div>
  );
};

export const DateTimePicker = ({ value, onChange, placeholder = "Set date and time" }: DateTimePickerProps) => {
  const [open, setOpen] = useState(false);
  const [tempDate, setTempDate] = useState<{
    month: string;
    day: number;
    year: number;
    hour: number;
    minute: number;
    period: 'AM' | 'PM';
  }>(() => {
    const now = value || new Date();
    const hours = now.getHours();
    return {
      month: months[now.getMonth()],
      day: now.getDate(),
      year: now.getFullYear(),
      hour: hours % 12 || 12,
      minute: now.getMinutes(),
      period: hours >= 12 ? 'PM' : 'AM'
    };
  });

  // Generate options
  const years = Array.from({ length: 10 }, (_, i) => new Date().getFullYear() + i);
  const days = Array.from({ length: 31 }, (_, i) => i + 1);
  const hours = Array.from({ length: 12 }, (_, i) => i + 1);
  const minutes = Array.from({ length: 60 }, (_, i) => i);

  const handleSet = () => {
    const monthIndex = months.indexOf(tempDate.month);
    let hour = tempDate.hour;
    if (tempDate.period === 'PM' && hour !== 12) hour += 12;
    if (tempDate.period === 'AM' && hour === 12) hour = 0;
    
    const date = new Date(tempDate.year, monthIndex, tempDate.day, hour, tempDate.minute);
    onChange(date);
    setOpen(false);
  };

  const handleClear = () => {
    onChange(null);
    setOpen(false);
  };

  const formatDisplay = () => {
    if (!value) return placeholder;
    return value.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen(true)}
        className={cn(
          "w-full justify-start text-left font-normal",
          !value && "text-muted-foreground"
        )}
      >
        <CalendarClock className="mr-2 h-4 w-4" />
        {formatDisplay()}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[340px] p-0">
          <DialogHeader className="p-4 pb-2">
            <DialogTitle className="text-center">Set date and time</DialogTitle>
          </DialogHeader>
          
          <div className="px-4 pb-4">
            {/* Date Pickers */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              <WheelPicker
                items={months}
                value={tempDate.month}
                onChange={(v) => setTempDate({ ...tempDate, month: v as string })}
              />
              <WheelPicker
                items={days}
                value={tempDate.day}
                onChange={(v) => setTempDate({ ...tempDate, day: v as number })}
              />
              <WheelPicker
                items={years}
                value={tempDate.year}
                onChange={(v) => setTempDate({ ...tempDate, year: v as number })}
              />
            </div>

            {/* Time Pickers */}
            <div className="grid grid-cols-3 gap-2">
              <WheelPicker
                items={hours}
                value={tempDate.hour}
                onChange={(v) => setTempDate({ ...tempDate, hour: v as number })}
              />
              <WheelPicker
                items={minutes}
                value={tempDate.minute}
                onChange={(v) => setTempDate({ ...tempDate, minute: v as number })}
              />
              <WheelPicker
                items={['AM', 'PM'] as const}
                value={tempDate.period}
                onChange={(v) => setTempDate({ ...tempDate, period: v as 'AM' | 'PM' })}
              />
            </div>
          </div>

          <DialogFooter className="p-4 pt-0 flex justify-between">
            <Button variant="ghost" onClick={handleClear} className="text-destructive">
              Clear
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button variant="gradient" onClick={handleSet}>
                Set
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default DateTimePicker;
