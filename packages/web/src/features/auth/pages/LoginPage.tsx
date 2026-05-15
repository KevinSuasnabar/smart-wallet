import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '../useAuth.js';
import { mapCognitoError } from '../types.js';
import { routes } from '../../../app/routes.js';
import { t } from '../../../lib/i18n.js';
import { ColorBlock } from '../../../components/common/ColorBlock.js';
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

export const LoginPage = () => {
  const { signIn } = useAuth();
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
    <ColorBlock tone="lime" className="p-6 md:p-7">
      <div className="mb-6">
        <Eyebrow>Acceso</Eyebrow>
        <h1 className="mt-2 text-2xl font-bold tracking-display">
          {t.auth.loginTitle}
        </h1>
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

          <div className="flex justify-end">
            <Link
              to={routes.forgotPassword}
              className="font-mono text-[11px] uppercase tracking-caption text-foreground/60 transition-colors hover:text-foreground"
            >
              {t.auth.forgotPassword}
            </Link>
          </div>

          <Button
            type="submit"
            className="w-full"
            disabled={form.formState.isSubmitting}
          >
            {form.formState.isSubmitting ? t.app.loading : t.auth.loginButton}
          </Button>
        </form>
      </Form>
    </ColorBlock>
  );
};
