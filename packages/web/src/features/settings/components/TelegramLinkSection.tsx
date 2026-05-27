import { useState } from 'react';
import { CheckCircle } from 'lucide-react';
import { Card } from '../../../components/ui/card.js';
import { Eyebrow } from '../../../components/common/Eyebrow.js';
import { Button } from '../../../components/ui/button.js';
import { Input } from '../../../components/ui/input.js';
import { t } from '../../../lib/i18n.js';
import { useGetTelegramLinkStatus, useGenerateTelegramToken } from '../queries.js';

export const TelegramLinkSection = () => {
  const { data: linkStatus, isLoading: isLoadingStatus } = useGetTelegramLinkStatus();
  const { mutate: generateToken, isPending, data } = useGenerateTelegramToken();
  const [copied, setCopied] = useState(false);

  const token = data?.token ?? null;
  const isLinked = linkStatus?.linked === true;
  const linkedAt =
    linkStatus?.linked === true
      ? new Date(linkStatus.linkedAt).toLocaleDateString('es-PE', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })
      : null;

  const handleCopy = () => {
    if (!token) return;
    void navigator.clipboard.writeText(token).then(() => {
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
      }, 2000);
    });
  };

  return (
    <Card className="flex flex-col gap-4 p-6">
      <div className="flex flex-col gap-2">
        <Eyebrow>{t.settings.telegram.eyebrow}</Eyebrow>
        <h2 className="text-2xl font-bold leading-none tracking-display">
          {t.settings.telegram.title}
        </h2>
      </div>

      {isLinked ? (
        <>
          <div className="flex items-center gap-2 text-sm text-green-600">
            <CheckCircle className="size-4 shrink-0" />
            <span>{t.settings.telegram.linkedStatus}</span>
          </div>
          {linkedAt !== null && (
            <p className="text-sm text-muted-foreground">
              {t.settings.telegram.linkedSince} {linkedAt}
            </p>
          )}
        </>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">{t.settings.telegram.description}</p>

          <Button
            type="button"
            onClick={() => {
              generateToken();
            }}
            disabled={isPending || isLoadingStatus}
            className="w-full"
          >
            {isPending ? t.app.loading : t.settings.telegram.generateButton}
          </Button>

          {token !== null && (
            <div className="flex flex-col gap-2">
              <span className="font-mono text-[11px] uppercase tracking-eyebrow text-muted-foreground">
                {t.settings.telegram.tokenLabel}
              </span>
              <div className="flex gap-2">
                <Input readOnly value={token} className="font-mono text-sm" />
                <Button type="button" variant="outline" onClick={handleCopy}>
                  {copied ? t.settings.telegram.tokenCopied : t.settings.telegram.tokenCopy}
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </Card>
  );
};
