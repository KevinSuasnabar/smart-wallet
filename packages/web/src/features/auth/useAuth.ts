import { useContext } from 'react';
import { AuthContext } from './AuthProvider.js';
import type { AuthContextValue } from './types.js';

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
