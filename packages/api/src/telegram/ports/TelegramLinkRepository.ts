export interface TelegramLink {
  userId: string;
  linkedAt: string;
}

export interface TelegramLinkRepository {
  findByTelegramId(telegramId: string | number): Promise<TelegramLink | null>;
  save(telegramId: string | number, userId: string): Promise<void>;
}
