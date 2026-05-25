import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '../useAuth.js';
import { mapCognitoError } from '../types.js';
import { routes } from '../../../app/routes.js';
import { t } from '../../../lib/i18n.js';
import { Card } from '../../../components/ui/card.js';
import { Eyebrow } from '../../../components/common/Eyebrow.js';
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

const loginSchema = z.object({
  email: z
    .string()
    .min(1, 'El email es requerido')
    .email('El email no es válido'),
  password: z.string().min(1, 'La contraseña es requerida'),
});

type LoginFormValues = z.infer<typeof loginSchema>;

const newPasswordSchema = z
  .object({
    newPassword: z
      .string()
      .min(10, 'Mínimo 10 caracteres')
      .regex(/[A-Z]/, 'Debe tener al menos una mayúscula')
      .regex(/[a-z]/, 'Debe tener al menos una minúscula')
      .regex(/[0-9]/, 'Debe tener al menos un número'),
    confirmPassword: z.string().min(1, 'Confirmá tu contraseña'),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: t.auth.passwordsMismatch,
    path: ['confirmPassword'],
  });

type NewPasswordFormValues = z.infer<typeof newPasswordSchema>;

/**
 * Split-screen login — the only page in the app where the brand has room to
 * speak. Left: navy panel with editorial display copy and a lime accent line.
 * Right: a white card on the cream canvas with the actual sign-in form.
 * Stacks on mobile (navy hero on top, form filling the rest).
 */
const NewPasswordForm = () => {
  const { completeNewPassword } = useAuth();

  const form = useForm<NewPasswordFormValues>({
    resolver: zodResolver(newPasswordSchema),
    defaultValues: { newPassword: '', confirmPassword: '' },
  });

  const onSubmit = async (values: NewPasswordFormValues) => {
    try {
      await completeNewPassword(values.newPassword);
    } catch (err) {
      const authErr = mapCognitoError(err);
      toast.error(authErr.message);
    }
  };

  return (
    <Card className="p-7 md:p-8">
      <div className="mb-6 flex flex-col gap-2">
        <Eyebrow>{t.auth.firstAccessEyebrow}</Eyebrow>
        <h2 className="text-3xl font-bold leading-none tracking-display md:text-4xl">
          {t.auth.firstAccessTitle}
        </h2>
        <p className="text-sm text-muted-foreground">{t.auth.firstAccessHint}</p>
      </div>

      <Form {...form}>
        <form
          onSubmit={(e) => { void form.handleSubmit(onSubmit)(e); }}
          className="space-y-4"
        >
          <FormField
            control={form.control}
            name="newPassword"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t.auth.newPasswordLabel}</FormLabel>
                <FormControl>
                  <Input type="password" autoComplete="new-password" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="confirmPassword"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t.auth.confirmPasswordLabel}</FormLabel>
                <FormControl>
                  <Input type="password" autoComplete="new-password" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button
            type="submit"
            className="w-full"
            disabled={form.formState.isSubmitting}
          >
            {form.formState.isSubmitting ? t.app.loading : t.auth.firstAccessButton}
          </Button>
        </form>
      </Form>
    </Card>
  );
};

export const LoginPage = () => {
  const { signIn, requiresNewPassword } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const from =
    (location.state as { from?: { pathname: string } } | null)?.from
      ?.pathname ?? routes.wallets;

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = async (values: LoginFormValues) => {
    try {
      await signIn({ email: values.email, password: values.password });
      void navigate(from, { replace: true });
    } catch (err) {
      const authErr = mapCognitoError(err);
      toast.error(authErr.message);
    }
  };

  return (
    <div className="grid min-h-dvh grid-cols-1 grid-rows-[auto_1fr] bg-background lg:grid-cols-2 lg:grid-rows-1">
      {/* Navy hero — the brand side */}
      <aside className="flex flex-col justify-between gap-12 bg-foreground px-6 py-10 text-background md:px-12 md:py-14 lg:px-16">
        <span className="font-mono text-[11px] uppercase tracking-eyebrow text-background/55">
          {t.app.name}
        </span>

        <div className="flex flex-col gap-6">
          <Eyebrow className="text-background/55">
            Tu billetera personal
          </Eyebrow>
          <h1 className="text-4xl font-bold leading-[1.05] tracking-display md:text-5xl lg:text-[56px] xl:text-[64px]">
            Tu plata,
            <br />
            con orden.
          </h1>
          <p className="max-w-md text-base leading-snug text-background/70 md:text-lg">
            Un lugar para tus cuentas, gastos y categorías.
            <br />
            Simple. Tuyo.
          </p>
          <span aria-hidden className="mt-2 block h-1 w-16 bg-block-lime" />
        </div>

        <span className="font-mono text-[10px] uppercase tracking-caption text-background/40">
          Personal finance · {new Date().getFullYear()}
        </span>
      </aside>

      {/* Form panel — cream canvas with a white card */}
      <div className="flex items-center justify-center px-5 py-10 md:p-12">
        <div className="w-full max-w-sm">
          {requiresNewPassword ? (
            <NewPasswordForm />
          ) : (
            <Card className="p-7 md:p-8">
              <div className="mb-6 flex flex-col gap-2">
                <Eyebrow>Acceso</Eyebrow>
                <h2 className="text-3xl font-bold leading-none tracking-display md:text-4xl">
                  Iniciar sesión
                </h2>
              </div>

              <Form {...form}>
                <form
                  onSubmit={(e) => { void form.handleSubmit(onSubmit)(e); }}
                  className="space-y-4"
                >
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t.auth.emailLabel}</FormLabel>
                        <FormControl>
                          <Input type="email" autoComplete="email" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t.auth.passwordLabel}</FormLabel>
                        <FormControl>
                          <Input
                            type="password"
                            autoComplete="current-password"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="flex justify-end pt-1">
                    <Link
                      to={routes.forgotPassword}
                      className="font-mono text-[11px] uppercase tracking-caption text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {t.auth.forgotPassword}
                    </Link>
                  </div>

                  <Button
                    type="submit"
                    className="w-full"
                    disabled={form.formState.isSubmitting}
                  >
                    {form.formState.isSubmitting
                      ? t.app.loading
                      : t.auth.loginButton}
                  </Button>
                </form>
              </Form>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};
