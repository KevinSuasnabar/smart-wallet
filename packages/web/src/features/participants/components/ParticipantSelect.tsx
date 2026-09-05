import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui/select.js';
import { useParticipants } from '../queries.js';
import { t } from '../../../lib/i18n.js';

/**
 * Radix Select refuses an empty-string item value, so "nobody in particular"
 * travels through this sentinel and is translated back to `undefined` at the
 * component boundary. Callers only ever see a real id or undefined.
 */
export const NO_PARTICIPANT = '__none__';

interface ParticipantSelectProps {
  /** Participant id, or undefined when unattributed. */
  value: string | undefined;
  onChange: (participantId: string | undefined) => void;
  disabled?: boolean;
  id?: string;
}

export const ParticipantSelect = ({
  value,
  onChange,
  disabled,
  id,
}: ParticipantSelectProps) => {
  const { data, isLoading } = useParticipants();
  const participants = data?.items ?? [];

  return (
    <Select
      value={value ?? NO_PARTICIPANT}
      onValueChange={(next) => {
        onChange(next === NO_PARTICIPANT ? undefined : next);
      }}
      disabled={(disabled ?? false) || isLoading}
    >
      <SelectTrigger id={id}>
        <SelectValue placeholder={isLoading ? t.app.loading : t.participants.selectPlaceholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NO_PARTICIPANT}>{t.participants.unattributed}</SelectItem>
        {participants.map((p) => (
          <SelectItem key={p.participantId} value={p.participantId}>
            {p.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};
