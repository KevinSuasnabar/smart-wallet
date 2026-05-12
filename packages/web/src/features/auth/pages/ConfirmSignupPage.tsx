import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate, useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '../useAuth.js';
import { mapCognitoError } from '../types.js';
import { routes } from '../../../app/routes.js';
import { t } from '../../../lib/i18n.js';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '../../../components/ui/card.js';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '../../../components/ui/form.js';
import { Input } from '../../../components/ui/input.js';
import { Button } from '../../../components/ui/button.js';

const confirmSchema = z.object({
  code: z
    .string()
    .length(6, 'El código debe tener 6 dígitos')
    .regex(/^\d+$/, 'El código solo puede contener números'),
});

type ConfirmFormValues = z.infer<typeof confirmSchema>;

export const ConfirmSignupPage = () => {
  const { confirmSignUp, resendConfirmationCode } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const email =
    (location.state as { email?: string } | null)?.email ?? '';

  const form = useForm<ConfirmFormValues>({
    resolver: zodResolver(confirmSchema),
    defaultValues: { code: '' },
  });

  const onSubmit = async (values: ConfirmFormValues) => {
    try {
      await confirmSignUp({ email, code: values.code });
      toast.success('Cuenta confirmada. ¡Podés iniciar sesión!');
      void navigate(routes.login);
    } catch (err) {
      const authErr = mapCognitoError(err);
      toast.error(authErr.message);
    }
  };

  const handleResend = async () => {
    try {
      await resendConfirmationCode(email);
      toast.success('Código reenviado. Revisá tu email.');
    } catch (err) {
      const authErr = mapCognitoError(err);
      toast.error(authErr.message);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl text-center">{t.auth.confirmTitle}</CardTitle>
        {email && (
          <p className="text-sm text-muted-foreground text-center mt-1">
            Ingresá el código que enviamos a{' '}
            <span className="font-medium text-foreground">{email}</span>
          </p>
        )}
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form
            onSubmit={(e) => { void form.handleSubmit(onSubmit)(e); }}
            className="space-y-4"
          >
            <FormField
              control={form.control}
              name="code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t.auth.confirmCodeLabel}</FormLabel>
                  <FormControl>
                    <Input
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      className="min-h-[44px] text-center tracking-widest text-lg"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button
              type="submit"
              className="w-full min-h-[44px]"
              disabled={form.formState.isSubmitting}
            >
              {form.formState.isSubmitting ? t.app.loading : t.auth.confirmButton}
            </Button>
          </form>
        </Form>

        <Button
          type="button"
          variant="ghost"
          className="w-full mt-2 min-h-[44px]"
          onClick={() => { void handleResend(); }}
        >
          {t.auth.resendCode}
        </Button>
      </CardContent>
    </Card>
  );
};
