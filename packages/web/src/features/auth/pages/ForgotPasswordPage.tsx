import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useNavigate } from 'react-router-dom';
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

const forgotSchema = z.object({
  email: z
    .string()
    .min(1, 'El email es requerido')
    .email('El email no es válido'),
});

type ForgotFormValues = z.infer<typeof forgotSchema>;

export const ForgotPasswordPage = () => {
  const { forgotPassword } = useAuth();
  const navigate = useNavigate();

  const form = useForm<ForgotFormValues>({
    resolver: zodResolver(forgotSchema),
    defaultValues: { email: '' },
  });

  const onSubmit = async (values: ForgotFormValues) => {
    try {
      await forgotPassword(values.email);
      toast.success(t.auth.forgotEmailSent);
      void navigate('/forgot-password/confirm', {
        state: { email: values.email },
      });
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
            {t.auth.forgotTitle}
          </h1>
          <p className="mt-2 text-sm text-foreground/70">
            Ingresa tu email y te enviaremos un código para recuperar tu
            contraseña.
          </p>
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

            <Button
              type="submit"
              className="w-full"
              disabled={form.formState.isSubmitting}
            >
              {form.formState.isSubmitting ? t.app.loading : 'Enviar código'}
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
