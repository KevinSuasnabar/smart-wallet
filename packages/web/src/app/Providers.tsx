import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'sonner';
import type { PropsWithChildren } from 'react';
import { queryClient } from '../lib/queryClient.js';
import { ErrorBoundary } from './ErrorBoundary.js';

// NOTE: AuthProvider is intentionally NOT here yet — that is Slice 3.
// ApiClientBridge (wires apiClient.configure when idToken changes) is also Slice 3.
export const Providers = ({ children }: PropsWithChildren) => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        {children}
        <Toaster position="top-center" richColors />
      </BrowserRouter>
    </QueryClientProvider>
  </ErrorBoundary>
);
