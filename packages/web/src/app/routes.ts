export const routes = {
  // Public
  login: '/login',
  signup: '/signup',
  signupConfirm: '/signup/confirm',
  forgotPassword: '/forgot-password',
  // Protected
  home: '/',
  wallets: '/wallets',
  walletsNew: '/wallets/new',
  walletDetail: (walletId: string) => `/wallets/${walletId}`,
  walletTransactions: (walletId: string) => `/wallets/${walletId}/transactions`,
  transactionsNew: '/transactions/new',
  categories: '/categories',
  settings: '/settings',
} as const;
