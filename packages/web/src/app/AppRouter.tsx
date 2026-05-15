import { Routes, Route, Navigate } from 'react-router-dom';
import { PublicLayout } from './layouts/PublicLayout.js';
import { AppLayout } from './layouts/AppLayout.js';
import { ProtectedRoute } from './layouts/ProtectedRoute.js';
import { LoginPage } from '../features/auth/pages/LoginPage.js';
import { ForgotPasswordPage } from '../features/auth/pages/ForgotPasswordPage.js';
import { ConfirmForgotPasswordPage } from '../features/auth/pages/ConfirmForgotPasswordPage.js';
import { NotFoundPage } from '../components/common/NotFoundPage.js';
import { WalletsListPage } from '../features/wallets/pages/WalletsListPage.js';
import { WalletDetailPage } from '../features/wallets/pages/WalletDetailPage.js';
import { CreateWalletPage } from '../features/wallets/pages/CreateWalletPage.js';
import { EditWalletPage } from '../features/wallets/pages/EditWalletPage.js';
import { AddTransactionPage } from '../features/transactions/pages/AddTransactionPage.js';
import { EditTransactionPage } from '../features/transactions/pages/EditTransactionPage.js';
import { TransactionListPage } from '../features/transactions/pages/TransactionListPage.js';
import { CategoriesPage } from '../features/categories/pages/CategoriesPage.js';
import { SettingsPage } from '../features/settings/pages/SettingsPage.js';
import { routes } from './routes.js';

export const AppRouter = () => (
  <Routes>
    {/* Login owns its own full-page split-screen layout. */}
    <Route path={routes.login} element={<LoginPage />} />

    {/* Forgot-password pages share the centered narrow PublicLayout. */}
    <Route element={<PublicLayout />}>
      <Route path={routes.forgotPassword} element={<ForgotPasswordPage />} />
      <Route
        path="/forgot-password/confirm"
        element={<ConfirmForgotPasswordPage />}
      />
    </Route>

    {/* Protected routes — require authentication */}
    <Route element={<ProtectedRoute />}>
      <Route element={<AppLayout />}>
        <Route
          path={routes.home}
          element={<Navigate to={routes.wallets} replace />}
        />
        <Route path={routes.wallets} element={<WalletsListPage />} />
        <Route path={routes.walletsNew} element={<CreateWalletPage />} />
        <Route path="/wallets/:walletId" element={<WalletDetailPage />} />
        <Route path="/wallets/:walletId/edit" element={<EditWalletPage />} />
        <Route
          path="/wallets/:walletId/transactions"
          element={<TransactionListPage />}
        />
        <Route
          path="/wallets/:walletId/transactions/new"
          element={<AddTransactionPage />}
        />
        <Route
          path="/wallets/:walletId/transactions/:transactionId/edit"
          element={<EditTransactionPage />}
        />
        <Route path={routes.transactionsNew} element={<AddTransactionPage />} />
        <Route path={routes.categories} element={<CategoriesPage />} />
        <Route path={routes.settings} element={<SettingsPage />} />
      </Route>
    </Route>

    <Route path="*" element={<NotFoundPage />} />
  </Routes>
);
