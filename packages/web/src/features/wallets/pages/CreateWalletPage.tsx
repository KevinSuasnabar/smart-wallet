import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { ChevronLeft } from 'lucide-react';
import { CreateWalletRequestSchema } from '@smart-wallet/shared-types';
import type { CreateWalletDTO } from '@smart-wallet/shared-types';
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from '../../../components/ui/form.js';
import { Input } from '../../../components/ui/input.js';
import { Button } from '../../../components/ui/button.js';
import { Card } from '../../../components/ui/card.js';
import { Eyebrow } from '../../../components/common/Eyebrow.js';
import { CurrencySelect } from '../components/CurrencySelect.js';
import { useCreateWallet } from '../queries.js';
import { userMessageFor } from '../../../lib/api/errors.js';
import { routes } from '../../../app/routes.js';
import { t } from '../../../lib/i18n.js';

export const CreateWalletPage = () => {
  const navigate = useNavigate();
  const { mutate, isPending } = useCreateWallet();

  const form = useForm<CreateWalletDTO>({
    resolver: zodResolver(CreateWalletRequestSchema),
    defaultValues: {
      name: '',
    },
  });

  const onSubmit = (values: CreateWalletDTO) => {
    mutate(values, {
      onSuccess: (wallet) => {
        toast.success('Billetera creada correctamente');
        void navigate(routes.walletDetail(wallet.walletId));
      },
      onError: (err) => {
        toast.error(userMessageFor(err));
      },
    });
  };

  const handleBack = () => { void navigate(routes.wallets); };

  return (
    <div className="flex flex-col gap-6 py-4 pb-4">
      <Button
        variant="ghost"
        size="sm"
        onClick={handleBack}
        className="-ml-2 self-start gap-1"
      >
        <ChevronLeft className="size-4" />
        {t.common.back}
      </Button>

      <div className="flex flex-col gap-2">
        <Eyebrow>Nueva billetera</Eyebrow>
        <h1 className="text-3xl font-bold leading-none tracking-display md:text-4xl">
          {t.wallets.createTitle}
        </h1>
      </div>

      <Card className="p-6">
        <Form {...form}>
          <form
            onSubmit={(e) => { void form.handleSubmit(onSubmit)(e); }}
            className="flex flex-col gap-5"
          >
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t.wallets.nameLabel}</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="Ej: Efectivo, Banco, Ahorros…"
                      disabled={isPending}
                    />
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
                      disabled={isPending}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button type="submit" disabled={isPending} className="mt-1 w-full">
              {isPending ? t.app.loading : t.wallets.createCta}
            </Button>
          </form>
        </Form>
      </Card>
    </div>
  );
};
