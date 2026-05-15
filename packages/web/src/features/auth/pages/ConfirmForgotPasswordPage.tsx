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

const confirmForgotSchema = z
  .object({
    code: z
      .string()
      .length(6, 'El código debe tener 6 dígitos')
      .regex(/^\d+$/, 'El código solo puede contener números'),
    newPassword: z
      .string()
      .min(8, 'La contraseña debe tener al menos 8 caracteres'),
    confirmPassword: z.string().min(1, 'Confirmá tu contraseña'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Las contraseñas no coinciden',
    path: ['confirmPassword'],
  });

type ConfirmForgotFormValues = z.infer<typeof confirmForgotSchema>;

export const ConfirmForgotPasswordPage = () => {
  const { confirmForgotPassword } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const email =
    (location.state as { email?: string } | null)?.email ?? '';

  const form = useForm<ConfirmForgotFormValues>({
    resolver: zodResolver(confirmForgotSchema),
    defaultValues: { code: '', newPassword: '', confirmPassword: '' },
  });

  const onSubmit = async (values: ConfirmForgotFormValues) => {
    try {
      await confirmForgotPassword({
        email,
        code: values.code,
        newPassword: values.newPassword,
      });
      toast.success('Contraseña actualizada. ¡Ya puedes iniciar sesión!');
      void navigate(routes.login);
    } catch (err) {
      const authErr = mapCognitoError(err);
      toast.error(authErr.message);
    }
  };

  return (
    <div className="space-y-5">
      <ColorBlock tone="lime" className="p-6 md:p-7">
        <div className="mb-7">
          <Eyebrow>Recuperación</Eyebrow>
          <h1 className="mt-2 text-3xl font-bold leading-none tracking-display md:text-4xl">
            {t.auth.resetButton}
          </h1>
          <p className="mt-2 text-sm text-foreground/70">
            Ingresa el código que enviamos a tu email y tu nueva contraseña.
          </p>
        </div>

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
                      className="text-center font-mono text-lg tracking-[0.4em]"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="newPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t.auth.newPasswordLabel}</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      autoComplete="new-password"
                      {...field}
                    />
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
                  <FormLabel>Confirmar contraseña</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      autoComplete="new-password"
                      {...field}
                    />
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
              {form.formState.isSubmitting ? t.app.loading : t.auth.resetButton}
            </Button>
          </form>
        </Form>
      </ColorBlock>

      <p className="text-center">
        <Link
          to={routes.login}
          className="font-mono text-[11px] uppercase tracking-caption text-muted-foreground transition-colors hover:text-foreground"
        >
          Volver al inicio de sesión
        </Link>
      </p>
    </div>
  );
};
