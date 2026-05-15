import { useState } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Calendar as CalendarIcon } from 'lucide-react';
import { Calendar } from '../ui/calendar.js';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover.js';
import { cn } from '../../lib/utils.js';

interface DatePickerFieldProps {
  value: string; // ISO8601 string
  onChange: (isoString: string) => void;
  disabled?: boolean;
  minDate?: Date;
  maxDate?: Date;
  id?: string;
}

/**
 * Date picker that emits ISO8601 strings. The trigger mirrors the text-input
 * shape (hairline border, rounded.md, 44px) rather than a pill button, so it
 * sits flush in a form column.
 *
 * The time portion is set to noon UTC to avoid off-by-one issues across
 * timezones.
 */
export const DatePickerField = ({
  value,
  onChange,
  disabled,
  minDate,
  maxDate,
  id,
}: DatePickerFieldProps) => {
  const [open, setOpen] = useState(false);
  const selectedDate = value ? new Date(value) : undefined;

  const handleSelect = (date: Date | undefined) => {
    if (!date) return;
    const iso = new Date(
      Date.UTC(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
        12,
        0,
        0,
        0,
      ),
    ).toISOString();
    onChange(iso);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          disabled={disabled ?? false}
          className={cn(
            'flex h-11 w-full items-center gap-2 rounded-md border border-input bg-card px-3.5 text-left text-[15px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50',
            !selectedDate && 'text-muted-foreground',
          )}
        >
          <CalendarIcon className="size-4 shrink-0 text-muted-foreground" />
          {selectedDate ? (
            format(selectedDate, "d 'de' MMMM 'de' yyyy", { locale: es })
          ) : (
            <span>Elegí una fecha</span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selectedDate}
          onSelect={handleSelect}
          locale={es}
          {...(minDate ? { fromDate: minDate } : {})}
          {...(maxDate ? { toDate: maxDate } : {})}
        />
      </PopoverContent>
    </Popover>
  );
};
