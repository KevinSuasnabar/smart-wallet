import { InlineKeyboard } from 'grammy';
import type { Wallet } from '@smart-wallet/domain';

/**
 * Builds an inline keyboard with one button per wallet.
 * callback_data format: `w:<walletId>` (UUID is 36 chars + 2 = 38 bytes, well within 64-byte limit).
 */
export function buildWalletKeyboard(wallets: readonly Wallet[]): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  for (const wallet of wallets) {
    const callbackData = `w:${wallet.id.value}`;
    // Defensive assertion — UUIDs are 36 chars, prefix is 2 chars = 38 bytes, always < 64
    if (callbackData.length > 64) {
      throw new Error(`callback_data exceeds 64 bytes: "${callbackData}"`);
    }
    keyboard.text(wallet.name, callbackData).row();
  }
  return keyboard;
}
