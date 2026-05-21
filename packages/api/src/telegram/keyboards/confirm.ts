import { InlineKeyboard } from 'grammy';

/**
 * Builds a two-button inline keyboard for the confirmation step.
 * callback_data: 'cf:y' for confirm, 'cf:n' for cancel.
 */
export function buildConfirmKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('Confirmar', 'cf:y')
    .text('Cancelar', 'cf:n');
}
