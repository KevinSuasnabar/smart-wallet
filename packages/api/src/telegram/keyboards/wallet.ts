import { InlineKeyboard } from 'grammy';

export interface WalletOption {
  id: string;
  name: string;
}

/**
 * Builds an inline keyboard with one button per wallet.
 * Receives plain objects (not Wallet class instances) so the keyboard
 * survives grammy's JSON serialization during conversation replay.
 * callback_data format: `w:<walletId>` (UUID 36 chars + 2 = 38 bytes, well within 64-byte limit).
 */
export function buildWalletKeyboard(wallets: readonly WalletOption[]): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  for (const wallet of wallets) {
    const callbackData = `w:${wallet.id}`;
    if (callbackData.length > 64) {
      throw new Error(`callback_data exceeds 64 bytes: "${callbackData}"`);
    }
    keyboard.text(wallet.name, callbackData).row();
  }
  return keyboard;
}
