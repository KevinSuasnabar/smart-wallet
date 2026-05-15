export { WalletId } from './WalletId.js';
export { Wallet } from './Wallet.js';
export type { CreateWalletProps, WalletProps } from './Wallet.js';
export {
  InvalidWalletId,
  InvalidWalletName,
  InvalidWalletCurrency,
  WalletAlreadyDeleted,
  WalletNotFound,
  WalletCurrencyLocked,
} from './WalletError.js';
export type { WalletError } from './WalletError.js';
export type { WalletRepository } from './WalletRepository.js';
export type { WalletCreated } from './events/WalletCreated.js';

export { makeCreateWallet } from './usecases/CreateWallet.js';
export type {
  CreateWalletInput,
  CreateWalletDeps,
  CreateWalletOutput,
} from './usecases/CreateWallet.js';

export { makeGetWallet } from './usecases/GetWallet.js';
export type {
  GetWalletInput,
  GetWalletDeps,
  GetWalletOutput,
} from './usecases/GetWallet.js';

export { makeListWallets } from './usecases/ListWallets.js';
export type {
  ListWalletsInput,
  ListWalletsOutput,
  ListWalletsDeps,
} from './usecases/ListWallets.js';

export { makeUpdateWallet } from './usecases/UpdateWallet.js';
export type {
  UpdateWalletInput,
  UpdateWalletDeps,
  UpdateWalletOutput,
} from './usecases/UpdateWallet.js';

export { makeDeleteWallet } from './usecases/DeleteWallet.js';
export type {
  DeleteWalletInput,
  DeleteWalletDeps,
  DeleteWalletOutput,
} from './usecases/DeleteWallet.js';
