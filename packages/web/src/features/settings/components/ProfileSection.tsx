import { useAuth } from '../../auth/useAuth.js';
import { Card } from '../../../components/ui/card.js';
import { Eyebrow } from '../../../components/common/Eyebrow.js';
import { t } from '../../../lib/i18n.js';

export const ProfileSection = () => {
  const { user } = useAuth();
  if (!user) return null;

  return (
    <Card className="flex flex-col gap-4 p-6">
      <div className="flex flex-col gap-2">
        <Eyebrow>{t.settings.profile.eyebrow}</Eyebrow>
        <h2 className="text-2xl font-bold leading-none tracking-display">
          {t.settings.profile.title}
        </h2>
      </div>
      <div className="flex flex-col gap-1">
        <span className="font-mono text-[11px] uppercase tracking-eyebrow text-muted-foreground">
          {t.settings.profile.emailLabel}
        </span>
        <span className="text-base font-medium">{user.email}</span>
      </div>
    </Card>
  );
};
