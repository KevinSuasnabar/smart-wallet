import { z } from 'zod';
import { zWalletColor } from '../wallet-colors.js';
import { zUuid } from './common.js';

/**
 * A participant is a person a transaction can be attributed to — the answer to
 * "who spent this?" on a wallet shared by more than one person. Participants
 * are account-scoped (owned by the authenticated user), not wallet-scoped, so
 * the same list is reusable across every wallet.
 *
 * They are NOT accounts: a participant has no credentials and cannot sign in.
 */
export const CreateParticipantRequestSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Participant name must not be empty')
    .max(32, 'Participant name must not exceed 32 characters'),
  color: zWalletColor,
});

export type CreateParticipantDTO = z.infer<typeof CreateParticipantRequestSchema>;

export const ParticipantResponseSchema = z.object({
  participantId: z.string(),
  name: z.string(),
  color: zWalletColor,
  createdAt: z.string(),
});

export type ParticipantResponseDTO = z.infer<typeof ParticipantResponseSchema>;

export const ListParticipantsResponseSchema = z.object({
  items: z.array(ParticipantResponseSchema),
});

export type ListParticipantsResponseDTO = z.infer<typeof ListParticipantsResponseSchema>;

/** Partial update body for PATCH /participants/{participantId}. Strict + at-least-one. */
export const UpdateParticipantRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(32).optional(),
    color: zWalletColor.optional(),
  })
  .strict()
  .refine((data) => data.name !== undefined || data.color !== undefined, {
    message: 'At least one mutable field must be provided',
  });

export type UpdateParticipantDTO = z.infer<typeof UpdateParticipantRequestSchema>;

export const ParticipantIdPathSchema = z.object({
  participantId: zUuid,
});

export type ParticipantIdPathDTO = z.infer<typeof ParticipantIdPathSchema>;
