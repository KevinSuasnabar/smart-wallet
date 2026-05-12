import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'sonner';
import type { PropsWithChildren } from 'react';
import { queryClient } from '../lib/queryClient.js';
import { ErrorBoundary } from './ErrorBoundary.js';
import { AuthProvider } from '../features/auth/AuthProvider.js';

// AuthProvider must be INSIDE BrowserRouter (signOut calls useNavigate)
// and INSIDE QueryClientProvider (signOut calls useQueryClient().clear())
export const Providers = ({ children }: PropsWithChildren) => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          {children}
          <Toaster position="top-center" richColors />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </ErrorBoundary>
);
