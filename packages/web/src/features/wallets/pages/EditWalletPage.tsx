import { useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ChevronLeft } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';
import {
  UpdateWalletRequestSchema,
  type UpdateWalletDTO,
  type WalletResponseDTO,
} from '@smart-wallet/shared-types';
import { Button } from '../../../components/ui/button.js';
import { Card } from '../../../components/ui/card.js';
import { Skeleton } from '../../../components/ui/skeleton.js';
import { Eyebrow } from '../../../components/common/Eyebrow.js';
import { ErrorState } from '../../../components/common/ErrorState.js';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '../../../components/ui/form.js';
import { Input } from '../../../components/ui/input.js';
import { CurrencySelect } from '../components/CurrencySelect.js';
import { useWallet, useUpdateWallet } from '../queries.js';
import { useWalletTransactions } from '../../transactions/queries.js';
import { ApiError, userMessageFor } from '../../../lib/api/errors.js';
import { routes } from '../../../app/routes.js';
import { t } from '../../../lib/i18n.js';

/**
 * Form-side schema. Same shape as UpdateWalletRequestSchema but with both
 * fields ALWAYS present (defaults seeded from the loaded wallet). The diff
 * vs initialValues is computed on submit; the PATCH body only includes
 * fields whose value actually changed.
 */
const FormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'El nombre es requerido')
    .max(64, 'El nombre debe tener máximo 64 caracteres'),
  currency: UpdateWalletRequestSchema._def.schema.shape.currency.unwrap(),
});
type FormValues = z.infer<typeof FormSchema>;

export const EditWalletPage = () => {
  const { walletId = '' } = useParams<{ walletId: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  const walletQuery = useWallet(walletId);
  // Currency-lock probe: any transaction at all blocks the currency change.
  const txProbe = useWalletTransactions(walletId, { limit: 1 });
  const updateMutation = useUpdateWallet();

  const goBack = () => {
    const from = (location.state as { from?: string } | null)?.from;
    void navigate(from ?? routes.walletDetail(walletId), { replace: true });
  };

  const hasTransactions = useMemo(
    () => (txProbe.data?.pages[0]?.items?.length ?? 0) > 0,
    [txProbe.data],
  );
  // Be defensive on probe error — assume locked so we don't trigger 409.
  const currencyLocked = hasTransactions || txProbe.isError;

  if (walletQuery.isLoading) {
    return (
      <div className="flex flex-col gap-6 py-4 pb-4">
        <div className="h-9 w-20 animate-pulse rounded-full bg-muted" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-3 w-20 rounded-sm" />
          <Skeleton className="h-10 w-64 rounded-sm" />
        </div>
        <Card className="p-6">
          <div className="flex flex-col gap-5">
            <Skeleton className="h-11 rounded-md" />
            <Skeleton className="h-11 rounded-md" />
            <Skeleton className="h-11 rounded-md" />
          </div>
        </Card>
      </div>
    );
  }

  if (walletQuery.isError || !walletQuery.data) {
    const isNotFound =
      walletQuery.error instanceof ApiError && walletQuery.error.status === 404;
    return (
      <div className="flex flex-col gap-6 py-4 pb-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={goBack}
          className="-ml-2 self-start gap-1"
        >
          <ChevronLeft className="size-4" />
          {t.common.back}
        </Button>
        <ErrorState
          message={isNotFound ? t.wallets.notFound : userMessageFor(walletQuery.error)}
          onRetry={() => { void walletQuery.refetch(); }}
        />
      </div>
    );
  }

  return (
    <EditWalletForm
      wallet={walletQuery.data}
      walletId={walletId}
      currencyLocked={currencyLocked}
      submitting={updateMutation.isPending}
      goBack={goBack}
      onSubmit={(diff) => {
        updateMutation.mutate(
          { walletId, dto: diff },
          {
            onSuccess: () => {
              toast.success(t.wallets.editSuccess);
              goBack();
            },
            onError: (err) => {
              if (err instanceof ApiError && err.status === 404) {
                toast.error(t.wallets.notFound);
                void navigate(routes.wallets, { replace: true });
                return;
              }
              toast.error(userMessageFor(err));
            },
          },
        );
      }}
    />
  );
};

interface EditWalletFormProps {
  wallet: WalletResponseDTO;
  walletId: string;
  currencyLocked: boolean;
  submitting: boolean;
  goBack: () => void;
  onSubmit: (diff: UpdateWalletDTO) => void;
}

const EditWalletForm = ({
  wallet,
  currencyLocked,
  submitting,
  goBack,
  onSubmit,
}: EditWalletFormProps) => {
  const form = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    mode: 'onChange',
    defaultValues: {
      name: wallet.name,
      currency: wallet.currency,
    },
  });

  const handleSubmit = (values: FormValues) => {
    const diff: UpdateWalletDTO = {};
    if (values.name !== wallet.name) diff.name = values.name;
    if (values.currency !== wallet.currency) diff.currency = values.currency;

    if (Object.keys(diff).length === 0) {
      toast(t.wallets.editNoChanges);
      return;
    }
    onSubmit(diff);
  };

  return (
    <div className="flex flex-col gap-6 py-4 pb-4">
      <Button
        variant="ghost"
        size="sm"
        onClick={goBack}
        className="-ml-2 self-start gap-1"
      >
        <ChevronLeft className="size-4" />
        {t.common.back}
      </Button>

      <div className="flex flex-col gap-2">
        <Eyebrow>{t.wallets.editEyebrow}</Eyebrow>
        <h1 className="text-3xl font-bold leading-none tracking-display md:text-4xl">
          {t.wallets.editTitle}
        </h1>
      </div>

      <Card className="p-6">
        <Form {...form}>
          <form
            onSubmit={(e) => { void form.handleSubmit(handleSubmit)(e); }}
            className="flex flex-col gap-5"
          >
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t.wallets.nameLabel}</FormLabel>
                  <FormControl>
                    <Input {...field} disabled={submitting} maxLength={64} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="currency"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t.wallets.currencyLabel}</FormLabel>
                  <FormControl>
                    <CurrencySelect
                      value={field.value}
                      onChange={field.onChange}
                      disabled={submitting || currencyLocked}
                    />
                  </FormControl>
                  {currencyLocked && (
                    <p className="text-sm text-muted-foreground">
                      {t.wallets.currencyLockedHelper}
                    </p>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button
              type="submit"
              disabled={submitting || !form.formState.isValid}
              className="mt-1 w-full"
            >
              {submitting ? t.app.loading : t.wallets.editSubmit}
            </Button>
          </form>
        </Form>
      </Card>
    </div>
  );
};
