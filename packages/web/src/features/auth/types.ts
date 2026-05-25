export interface AuthUser {
  username: string; // Cognito username (email in our setup)
  email: string;
  sub: string; // Cognito sub UUID (becomes userId in the API)
}

export interface AuthState {
  user: AuthUser | null;
  idToken: string | null;
  isLoading: boolean; // true during initial sessionStorage hydration
  requiresNewPassword: boolean; // true when Cognito responds with NEW_PASSWORD_REQUIRED challenge
}

export interface AuthContextValue extends AuthState {
  signIn: (input: { email: string; password: string }) => Promise<void>;
  completeNewPassword: (newPassword: string) => Promise<void>;
  forgotPassword: (email: string) => Promise<void>;
  confirmForgotPassword: (input: {
    email: string;
    code: string;
    newPassword: string;
  }) => Promise<void>;
  signOut: () => Promise<void>;
  // Returns new IdToken; reused across concurrent 401s via single-flight
  refreshSession: () => Promise<string>;
  // Changes the Cognito password for the current user. Does not invalidate
  // the active session — the user stays signed in.
  changePassword: (input: {
    currentPassword: string;
    newPassword: string;
  }) => Promise<void>;
}

export type AuthError =
  | { code: 'NotAuthorizedException'; message: string }
  | { code: 'CodeMismatchException'; message: string }
  | { code: 'ExpiredCodeException'; message: string }
  | { code: 'InvalidPasswordException'; message: string }
  | { code: 'LimitExceededException'; message: string }
  | { code: 'TooManyRequestsException'; message: string }
  | { code: 'unknown'; message: string };

// Per-call message overrides keyed by Cognito error code. Append-only: callers
// that pass nothing observe the prior behavior (raw Cognito message).
export type CognitoErrorOverrides = Partial<Record<string, string>>;

export const mapCognitoError = (
  err: unknown,
  overrides?: CognitoErrorOverrides,
): AuthError => {
  const e = err as { code?: string; message?: string; name?: string };
  const code = e.code ?? e.name ?? 'unknown';
  const message = overrides?.[code] ?? e.message ?? 'Error desconocido';

  switch (code) {
    case 'NotAuthorizedException':
      return { code, message };
    case 'CodeMismatchException':
      return { code, message };
    case 'ExpiredCodeException':
      return { code, message };
    case 'InvalidPasswordException':
      return { code, message };
    case 'LimitExceededException':
      return { code, message };
    case 'TooManyRequestsException':
      return { code, message };
    default:
      return { code: 'unknown', message };
  }
};
