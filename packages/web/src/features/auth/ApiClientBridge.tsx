import { useEffect } from 'react';
import { apiClient } from '../../lib/api/client.js';
import { useAuth } from './useAuth.js';

/**
 * Mounts inside AuthProvider. On every idToken change (sign in / token
 * refresh / sign out), re-configures the apiClient singleton so all
 * subsequent API calls use the latest token.
 *
 * Returns null — purely a side-effect component.
 */
export const ApiClientBridge = () => {
  const { idToken, refreshSession } = useAuth();

  useEffect(() => {
    apiClient.configure({
      getToken: () => idToken,
      refresh: refreshSession,
    });
  }, [idToken, refreshSession]);

  return null;
};
