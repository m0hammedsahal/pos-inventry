import { useEffect, useState } from "react";
import type { DateRange } from "react-day-picker";
import { CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatDate, isoDate, parseISODate } from "@/lib/format";

interface DateFilterProps {
  /** yyyy-mm-dd */
  from: string;
  /** yyyy-mm-dd */
  to: string;
  onChange: (from: string, to: string) => void;
  /** Latest selectable day (defaults to today). */
  max?: Date;
}

type Mode = "day" | "range";

const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/**
 * Interactive calendar filter: pick a single day or a range of days, or jump
 * with a preset. Days are always handled as local yyyy-mm-dd strings.
 */
export function DateFilter({ from, to, onChange, max }: DateFilterProps) {
  const today = new Date();
  const latest = max ?? today;
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>(from === to ? "day" : "range");
  const [month, setMonth] = useState<Date>(parseISODate(from));
  const [draft, setDraft] = useState<DateRange | undefined>({ from: parseISODate(from), to: parseISODate(to) });

  // Re-sync when the parent changes the dates (presets, clicking a table row, …).
  useEffect(() => {
    setDraft({ from: parseISODate(from), to: parseISODate(to) });
    setMonth(parseISODate(from));
    setMode(from === to ? "day" : "range");
  }, [from, to]);

  const apply = (a: Date, b: Date) => {
    const [start, end] = a <= b ? [a, b] : [b, a];
    onChange(isoDate(start), isoDate(end));
  };

  const preset = (a: Date, b: Date) => {
    apply(a, b);
    setOpen(false);
  };

  const label = from === to ? formatDate(parseISODate(from)) : `${formatDate(parseISODate(from))} – ${formatDate(parseISODate(to))}`;
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="justify-start gap-2 font-normal">
          <CalendarDays className="size-4" />
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <div className="flex flex-col sm:flex-row">
          <div className="flex flex-row flex-wrap gap-1 border-b border-border p-2 sm:w-36 sm:flex-col sm:flex-nowrap sm:border-b-0 sm:border-r">
            <Button size="sm" variant="ghost" className="justify-start" onClick={() => preset(today, today)}>
              Today
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="justify-start"
              onClick={() => preset(addDays(today, -1), addDays(today, -1))}
            >
              Yesterday
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="justify-start"
              onClick={() => preset(addDays(today, -6), today)}
            >
              Last 7 days
            </Button>
            <Button size="sm" variant="ghost" className="justify-start" onClick={() => preset(monthStart, today)}>
              This month
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="justify-start"
              onClick={() => preset(lastMonthStart, lastMonthEnd)}
            >
              Last month
            </Button>
          </div>
          <div>
            <div className="flex gap-1 p-2 pb-0">
              <Button size="sm" variant={mode === "day" ? "secondary" : "ghost"} onClick={() => setMode("day")}>
                Single day
              </Button>
              <Button size="sm" variant={mode === "range" ? "secondary" : "ghost"} onClick={() => setMode("range")}>
                Date range
              </Button>
            </div>
            {mode === "day" ? (
              <Calendar
                mode="single"
                month={month}
                onMonthChange={setMonth}
                selected={parseISODate(from)}
                onSelect={(d) => {
                  if (!d) return;
                  apply(d, d);
                  setOpen(false);
                }}
                disabled={{ after: latest }}
                captionLayout="dropdown"
                startMonth={new Date(2020, 0)}
                endMonth={latest}
              />
            ) : (
              <Calendar
                mode="range"
                month={month}
                onMonthChange={setMonth}
                selected={draft}
                onSelect={(range, clicked) => {
                  if (!range?.from) return;
                  // After a finished range, the next click starts a new one.
                  const finished = !!draft?.from && !!draft?.to && draft.from.getTime() !== draft.to.getTime();
                  if (finished) {
                    setDraft({ from: clicked, to: undefined });
                    return;
                  }
                  setDraft(range);
                  if (range.to) {
                    apply(range.from, range.to);
                    setOpen(false);
                  }
                }}
                disabled={{ after: latest }}
                numberOfMonths={2}
                captionLayout="dropdown"
                startMonth={new Date(2020, 0)}
                endMonth={latest}
              />
            )}
            <p className="px-3 pb-2 text-xs text-muted-foreground">
              {mode === "day" ? "Click a day to filter by it." : "Click a start day, then an end day."}
            </p>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
