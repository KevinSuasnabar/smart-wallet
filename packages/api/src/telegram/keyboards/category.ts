import { InlineKeyboard } from 'grammy';
import { PREDEFINED_CATEGORIES } from '@smart-wallet/shared-types';

/**
 * Builds an inline keyboard with categories.
 * When type is provided, shows only categories of that type.
 * When omitted, shows all categories (type is inferred from the selected categoryId).
 * callback_data format: `c:<categoryId>` (e.g. "c:expense:food" = 15 bytes, well within 64-byte limit).
 */
export function buildCategoryKeyboard(type?: 'expense' | 'income'): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  const filtered = type ? PREDEFINED_CATEGORIES.filter((cat) => cat.type === type) : PREDEFINED_CATEGORIES;
  for (const cat of filtered) {
    const callbackData = `c:${cat.categoryId}`;
    // Defensive assertion — category IDs are short (e.g. "expense:entertainment" = 21 chars + 2 = 23 bytes)
    if (callbackData.length > 64) {
      throw new Error(`callback_data exceeds 64 bytes: "${callbackData}"`);
    }
    keyboard.text(cat.name, callbackData).row();
  }
  return keyboard;
}
