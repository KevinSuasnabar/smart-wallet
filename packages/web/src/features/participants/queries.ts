import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  CreateParticipantDTO,
  UpdateParticipantDTO,
  ParticipantResponseDTO,
} from '@smart-wallet/shared-types';
import { participantsApi } from './participantsApi.js';

export const participantKeys = {
  all: ['participants'] as const,
};

export const useParticipants = () =>
  useQuery({
    queryKey: participantKeys.all,
    queryFn: () => participantsApi.list(),
  });

export const useCreateParticipant = () => {
  const qc = useQueryClient();
  return useMutation<ParticipantResponseDTO, Error, CreateParticipantDTO>({
    mutationFn: (dto) => participantsApi.create(dto),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: participantKeys.all });
    },
  });
};

/**
 * Rename or recolor a participant. Transactions are invalidated too: their
 * rows resolve the participant name from this same list, so a rename has to
 * repaint them.
 */
export const useUpdateParticipant = () => {
  const qc = useQueryClient();
  return useMutation<
    ParticipantResponseDTO,
    Error,
    { participantId: string; dto: UpdateParticipantDTO }
  >({
    mutationFn: ({ participantId, dto }) => participantsApi.update(participantId, dto),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: participantKeys.all });
      void qc.invalidateQueries({ queryKey: ['transactions'] });
    },
  });
};

/**
 * Soft-delete a participant. The server keeps the attribution on transactions
 * that already reference it, so those rows fall back to a "deleted" label —
 * hence the transactions invalidation.
 */
export const useDeleteParticipant = () => {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (participantId) => participantsApi.delete(participantId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: participantKeys.all });
      void qc.invalidateQueries({ queryKey: ['transactions'] });
    },
  });
};

/**
 * Resolves a participantId to its display name. Returns undefined when there
 * is no attribution, and the "deleted participant" label when the id no longer
 * resolves — a soft-deleted participant leaves its id on old transactions.
 */
export const useParticipantName = () => {
  const { data } = useParticipants();
  return (participantId: string | undefined): string | undefined => {
    if (participantId === undefined || participantId === '') return undefined;
    return data?.items.find((p) => p.participantId === participantId)?.name;
  };
};
