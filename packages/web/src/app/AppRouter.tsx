import { Routes, Route, Navigate } from 'react-router-dom';
import { PublicLayout } from './layouts/PublicLayout.js';
import { AppLayout } from './layouts/AppLayout.js';
import { ProtectedRoute } from './layouts/ProtectedRoute.js';
import { LoginPage } from '../features/auth/pages/LoginPage.js';
import { SignupPage } from '../features/auth/pages/SignupPage.js';
import { ConfirmSignupPage } from '../features/auth/pages/ConfirmSignupPage.js';
import { ForgotPasswordPage } from '../features/auth/pages/ForgotPasswordPage.js';
import { ConfirmForgotPasswordPage } from '../features/auth/pages/ConfirmForgotPasswordPage.js';
import { NotFoundPage } from '../components/common/NotFoundPage.js';
import { WalletsListPage } from '../features/wallets/pages/WalletsListPage.js';
import { WalletDetailPage } from '../features/wallets/pages/WalletDetailPage.js';
import { CreateWalletPage } from '../features/wallets/pages/CreateWalletPage.js';
import { routes } from './routes.js';

// Stubs for PR3 (transactions/categories/settings)
const SettingsPage = () => (
  <div className="p-6">
    <h1 className="text-xl font-semibold">Configuración (próximamente)</h1>
  </div>
);

const CategoriesPage = () => (
  <div className="p-6">
    <h1 className="text-xl font-semibold">Categorías (próximamente)</h1>
  </div>
);

export const AppRouter = () => (
  <Routes>
    {/* Public routes — unauthenticated auth pages */}
    <Route element={<PublicLayout />}>
      <Route path={routes.login} element={<LoginPage />} />
      <Route path={routes.signup} element={<SignupPage />} />
      <Route path={routes.signupConfirm} element={<ConfirmSignupPage />} />
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
        <Route path={routes.categories} element={<CategoriesPage />} />
        <Route path={routes.settings} element={<SettingsPage />} />
      </Route>
    </Route>

    <Route path="*" element={<NotFoundPage />} />
  </Routes>
);
