export const routes = {
  // Public
  login: '/login',
  forgotPassword: '/forgot-password',
  // Protected
  home: '/',
  wallets: '/wallets',
  walletsNew: '/wallets/new',
  walletDetail: (walletId: string) => `/wallets/${walletId}`,
  walletTransactions: (walletId: string) => `/wallets/${walletId}/transactions`,
  walletTransactionsNew: (walletId: string) =>
    `/wallets/${walletId}/transactions/new`,
  transactionsNew: '/transactions/new',
  categories: '/categories',
  settings: '/settings',
} as const;
