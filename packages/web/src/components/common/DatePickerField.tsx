import { useState } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Calendar as CalendarIcon } from 'lucide-react';
import { Button } from '../ui/button.js';
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
 * Date picker that emits ISO8601 strings.
 * The time portion is preserved from `value` if present; otherwise set to noon UTC
 * to avoid off-by-one issues across timezones.
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
        <Button
          id={id}
          type="button"
          variant="outline"
          disabled={disabled ?? false}
          className={cn(
            'w-full min-h-[44px] justify-start text-left font-normal',
            !selectedDate && 'text-muted-foreground',
          )}
        >
          <CalendarIcon className="mr-2 size-4" />
          {selectedDate ? (
            format(selectedDate, "d 'de' MMMM 'de' yyyy", { locale: es })
          ) : (
            <span>Elegí una fecha</span>
          )}
        </Button>
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
