import { z } from 'zod';

/**
 * Mirrors the minimum requirements of Cognito's password policy so we don't
 * waste a round trip on obviously bad input. The server is still the authority
 * — full policy violations come back as InvalidPasswordException and surface
 * via mapCognitoError.
 */
export const ChangePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'La contraseña actual es requerida'),
    newPassword: z
      .string()
      .min(10, 'La nueva contraseña debe tener al menos 10 caracteres'),
    confirmNewPassword: z.string().min(1, 'Confirmá la nueva contraseña'),
  })
  .refine((data) => data.newPassword === data.confirmNewPassword, {
    path: ['confirmNewPassword'],
    message: 'Las contraseñas no coinciden',
  })
  .refine((data) => data.newPassword !== data.currentPassword, {
    path: ['newPassword'],
    message: 'La nueva contraseña debe ser distinta a la actual',
  });

export type ChangePasswordFormValues = z.infer<typeof ChangePasswordSchema>;
