import { PageHeader } from '../../../components/common/PageHeader.js';
import { ProfileSection } from '../components/ProfileSection.js';
import { ChangePasswordSection } from '../components/ChangePasswordSection.js';
import { PreferredCurrencySection } from '../components/PreferredCurrencySection.js';
import { TelegramLinkSection } from '../components/TelegramLinkSection.js';
import { t } from '../../../lib/i18n.js';

export const SettingsPage = () => (
  <div className="flex flex-col gap-6 pb-6">
    <PageHeader eyebrow={t.settings.eyebrow} title={t.settings.title} />
    <ProfileSection />
    <ChangePasswordSection />
    <PreferredCurrencySection />
    <TelegramLinkSection />
  </div>
);
