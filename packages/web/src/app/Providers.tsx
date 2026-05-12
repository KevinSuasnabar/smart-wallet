import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'sonner';
import type { PropsWithChildren } from 'react';
import { queryClient } from '../lib/queryClient.js';
import { ErrorBoundary } from './ErrorBoundary.js';
import { AuthProvider } from '../features/auth/AuthProvider.js';
import { ApiClientBridge } from '../features/auth/ApiClientBridge.js';

// AuthProvider must be INSIDE BrowserRouter (signOut calls useNavigate)
// and INSIDE QueryClientProvider (signOut calls useQueryClient().clear())
// ApiClientBridge must be INSIDE AuthProvider (it consumes useAuth()).
export const Providers = ({ children }: PropsWithChildren) => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <ApiClientBridge />
          {children}
          <Toaster position="top-center" richColors />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </ErrorBoundary>
);
