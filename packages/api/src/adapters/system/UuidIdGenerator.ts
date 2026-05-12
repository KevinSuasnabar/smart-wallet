import type { IdGenerator } from '@smart-wallet/domain';

export class UuidIdGenerator implements IdGenerator {
  uuid(): string {
    // crypto.randomUUID() is available globally in Node 22 without import
    return crypto.randomUUID();
  }
}
