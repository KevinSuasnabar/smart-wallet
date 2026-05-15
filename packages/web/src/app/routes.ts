export const routes = {
  // Public
  login: '/login',
  forgotPassword: '/forgot-password',
  // Protected
  home: '/',
  wallets: '/wallets',
  walletsNew: '/wallets/new',
  walletDetail: (walletId: string) => `/wallets/${walletId}`,
  walletEdit: (walletId: string) => `/wallets/${walletId}/edit`,
  walletTransactions: (walletId: string) => `/wallets/${walletId}/transactions`,
  walletTransactionsNew: (walletId: string) =>
    `/wallets/${walletId}/transactions/new`,
  walletTransactionEdit: (walletId: string, transactionId: string) =>
    `/wallets/${walletId}/transactions/${transactionId}/edit`,
  transactionsNew: '/transactions/new',
  categories: '/categories',
  settings: '/settings',
} as const;
