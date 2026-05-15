import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { PropsWithChildren } from 'react';
import {
  AuthenticationDetails,
  CognitoRefreshToken,
  CognitoUser,
  CognitoUserSession,
} from 'amazon-cognito-identity-js';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { userPool } from '../../lib/cognito/pool.js';
import { routes } from '../../app/routes.js';
import {
  clearPersisted,
  readPersisted,
  writePersisted,
} from './sessionStorage.js';
import type { AuthContextValue, AuthState, AuthUser } from './types.js';

export const AuthContext = createContext<AuthContextValue | null>(null);

const buildCognitoUser = (username: string): CognitoUser =>
  new CognitoUser({ Username: username, Pool: userPool });

const decodeJwt = (token: string): { sub?: string; email?: string } => {
  // Parse JWT payload without crypto verification — API Gateway verifies the token
  try {
    const parts = token.split('.');
    const payload = parts[1];
    if (!payload) return {};
    // Replace URL-safe base64 chars, then decode
    const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(decoded) as { sub?: string; email?: string };
  } catch {
    return {};
  }
};

export const AuthProvider = ({ children }: PropsWithChildren) => {
  const [state, setState] = useState<AuthState>({
    user: null,
    idToken: null,
    isLoading: true,
  });
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Single-flight: if a token refresh is already in flight, all callers share the same promise
  const refreshPromiseRef = useRef<Promise<string> | null>(null);
  const cognitoUserRef = useRef<CognitoUser | null>(null);

  // Hydrate from sessionStorage on mount — synchronous read, no network request
  useEffect(() => {
    const persisted = readPersisted();
    if (!persisted) {
      setState((s) => ({ ...s, isLoading: false }));
      return;
    }
    const claims = decodeJwt(persisted.idToken);
    const user: AuthUser = {
      username: persisted.username,
      email: claims.email ?? persisted.username,
      sub: claims.sub ?? '',
    };
    cognitoUserRef.current = buildCognitoUser(persisted.username);
    setState({ user, idToken: persisted.idToken, isLoading: false });
  }, []);

  const signIn = useCallback(
    async ({ email, password }: { email: string; password: string }) => {
      const cognitoUser = buildCognitoUser(email);
      const authDetails = new AuthenticationDetails({
        Username: email,
        Password: password,
      });
      const session = await new Promise<CognitoUserSession>(
        (resolve, reject) => {
          cognitoUser.authenticateUser(authDetails, {
            onSuccess: resolve,
            onFailure: (err: unknown) =>
              reject(err instanceof Error ? err : new Error(String(err))),
          });
        },
      );
      const idToken = session.getIdToken().getJwtToken();
      const refreshToken = session.getRefreshToken().getToken();
      const claims = decodeJwt(idToken);
      const user: AuthUser = {
        username: email,
        email: claims.email ?? email,
        sub: claims.sub ?? '',
      };
      writePersisted({ username: email, idToken, refreshToken });
      cognitoUserRef.current = cognitoUser;
      setState({ user, idToken, isLoading: false });
    },
    [],
  );

  const forgotPassword = useCallback(async (email: string) => {
    const cognitoUser = buildCognitoUser(email);
    await new Promise<void>((resolve, reject) => {
      cognitoUser.forgotPassword({
        onSuccess: () => resolve(),
        onFailure: (err) =>
          reject(err instanceof Error ? err : new Error(String(err))),
      });
    });
  }, []);

  const confirmForgotPassword = useCallback(
    async ({
      email,
      code,
      newPassword,
    }: {
      email: string;
      code: string;
      newPassword: string;
    }) => {
      const cognitoUser = buildCognitoUser(email);
      await new Promise<void>((resolve, reject) => {
        cognitoUser.confirmPassword(code, newPassword, {
          onSuccess: () => resolve(),
          onFailure: (err) =>
            reject(err instanceof Error ? err : new Error(String(err))),
        });
      });
    },
    [],
  );

  const changePassword = useCallback(
    async ({
      currentPassword,
      newPassword,
    }: {
      currentPassword: string;
      newPassword: string;
    }): Promise<void> => {
      const cognitoUser = cognitoUserRef.current;
      if (!cognitoUser) {
        throw new Error('No active session');
      }
      await new Promise<void>((resolve, reject) => {
        cognitoUser.changePassword(currentPassword, newPassword, (err) => {
          if (err) {
            return reject(err instanceof Error ? err : new Error(String(err)));
          }
          resolve();
        });
      });
    },
    [],
  );

  const signOut = useCallback(async () => {
    const cognitoUser = cognitoUserRef.current;
    if (cognitoUser) {
      // best-effort: globalSignOut revokes all tokens server-side; swallow errors
      await new Promise<void>((resolve) => {
        cognitoUser.globalSignOut({
          onSuccess: (_msg) => resolve(),
          onFailure: (_err) => resolve(),
        });
      });
    }
    cognitoUserRef.current = null;
    clearPersisted();
    queryClient.clear();
    setState({ user: null, idToken: null, isLoading: false });
    navigate(routes.login);
  }, [navigate, queryClient]);

  const refreshSession = useCallback(async (): Promise<string> => {
    // Single-flight: if a refresh is already in flight, await the existing promise
    if (refreshPromiseRef.current !== null) {
      return refreshPromiseRef.current;
    }

    const cognitoUser = cognitoUserRef.current;
    const persisted = readPersisted();
    if (!cognitoUser || !persisted) {
      throw new Error('No active session to refresh');
    }

    const refreshToken = new CognitoRefreshToken({
      RefreshToken: persisted.refreshToken,
    });

    const promise = new Promise<string>((resolve, reject) => {
      cognitoUser.refreshSession(refreshToken, (err: unknown, session: unknown) => {
        if (err || !(session instanceof CognitoUserSession)) {
          return reject(
            err instanceof Error ? err : new Error('refresh failed'),
          );
        }
        const newIdToken = session.getIdToken().getJwtToken();
        writePersisted({ ...persisted, idToken: newIdToken });
        setState((s) => ({ ...s, idToken: newIdToken }));
        resolve(newIdToken);
      });
    });

    refreshPromiseRef.current = promise;
    try {
      return await promise;
    } finally {
      refreshPromiseRef.current = null;
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      signIn,
      forgotPassword,
      confirmForgotPassword,
      signOut,
      refreshSession,
      changePassword,
    }),
    [
      state,
      signIn,
      forgotPassword,
      confirmForgotPassword,
      signOut,
      refreshSession,
      changePassword,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
