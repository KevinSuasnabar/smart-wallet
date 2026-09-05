import { apiClient } from '../../lib/api/client.js';
import type {
  CreateParticipantDTO,
  UpdateParticipantDTO,
  ParticipantResponseDTO,
  ListParticipantsResponseDTO,
} from '@smart-wallet/shared-types';

export const participantsApi = {
  list: (): Promise<ListParticipantsResponseDTO> =>
    apiClient.get<ListParticipantsResponseDTO>('/participants'),

  create: (dto: CreateParticipantDTO): Promise<ParticipantResponseDTO> =>
    apiClient.post<ParticipantResponseDTO>('/participants', dto),

  update: (
    participantId: string,
    dto: UpdateParticipantDTO,
  ): Promise<ParticipantResponseDTO> =>
    apiClient.patch<ParticipantResponseDTO>(`/participants/${participantId}`, dto),

  delete: (participantId: string): Promise<void> =>
    apiClient.del(`/participants/${participantId}`),
};
