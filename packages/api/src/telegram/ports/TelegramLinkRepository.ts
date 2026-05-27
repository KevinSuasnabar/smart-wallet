export interface TelegramLink {
  userId: string;
  linkedAt: string;
}

export interface TelegramUserLink {
  telegramId: string;
  linkedAt: string;
}

export interface TelegramLinkRepository {
  findByTelegramId(telegramId: string | number): Promise<TelegramLink | null>;
  findByUserId(userId: string): Promise<TelegramUserLink | null>;
  save(telegramId: string | number, userId: string): Promise<void>;
}
