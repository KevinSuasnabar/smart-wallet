export interface TelegramLinkTokenRepository {
  create(userId: string, token: string, ttlSeconds: number): Promise<void>;
  consume(userId: string, token: string): Promise<boolean>;
}
