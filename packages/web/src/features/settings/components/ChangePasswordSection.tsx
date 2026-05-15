import { useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { useAuth } from '../../auth/useAuth.js';
import { mapCognitoError } from '../../auth/types.js';
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
import { t } from '../../../lib/i18n.js';
import {
  ChangePasswordSchema,
  type ChangePasswordFormValues,
} from '../schemas.js';

export const ChangePasswordSection = () => {
  const { changePassword } = useAuth();
  const currentPasswordRef = useRef<HTMLInputElement | null>(null);

  const form = useForm<ChangePasswordFormValues>({
    resolver: zodResolver(ChangePasswordSchema),
    defaultValues: {
      currentPassword: '',
      newPassword: '',
      confirmNewPassword: '',
    },
    mode: 'onChange',
  });

  const onSubmit = async (values: ChangePasswordFormValues) => {
    try {
      await changePassword({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });
      toast.success(t.settings.changePassword.successToast);
      form.reset();
      currentPasswordRef.current?.focus();
    } catch (err) {
      const authErr = mapCognitoError(err, {
        NotAuthorizedException: t.settings.changePassword.errors.wrongCurrent,
        InvalidPasswordException: t.settings.changePassword.errors.weakNew,
        LimitExceededException: t.settings.changePassword.errors.rateLimit,
      });
      toast.error(authErr.message);
    }
  };

  const submitting = form.formState.isSubmitting;

  return (
    <Card className="flex flex-col gap-4 p-6">
      <div className="flex flex-col gap-2">
        <Eyebrow>{t.settings.changePassword.eyebrow}</Eyebrow>
        <h2 className="text-2xl font-bold leading-none tracking-display">
          {t.settings.changePassword.title}
        </h2>
      </div>

      <Form {...form}>
        <form
          onSubmit={(e) => {
            void form.handleSubmit(onSubmit)(e);
          }}
          className="flex flex-col gap-4"
        >
          <FormField
            control={form.control}
            name="currentPassword"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  {t.settings.changePassword.currentPasswordLabel}
                </FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    ref={(el) => {
                      field.ref(el);
                      currentPasswordRef.current = el;
                    }}
                    type="password"
                    autoComplete="current-password"
                    disabled={submitting}
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
                <FormLabel>
                  {t.settings.changePassword.newPasswordLabel}
                </FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    type="password"
                    autoComplete="new-password"
                    disabled={submitting}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="confirmNewPassword"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  {t.settings.changePassword.confirmNewPasswordLabel}
                </FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    type="password"
                    autoComplete="new-password"
                    disabled={submitting}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button
            type="submit"
            disabled={submitting || !form.formState.isValid}
            className="mt-1 w-full"
          >
            {submitting
              ? t.app.loading
              : t.settings.changePassword.submit}
          </Button>
        </form>
      </Form>
    </Card>
  );
};
