// Vite static replacement requires dot-notation literal access (e.g. import.meta.env.VITE_X).
// Using bracket notation with a dynamic variable (import.meta.env[name]) breaks Vite's
// transform and produces invalid code that tries to assign to the readonly import.meta.env.

const requireValue = (name: string, value: string | undefined): string => {
  if (typeof value !== 'string' || value === '') {
    throw new Error(`Missing env var: ${name}`);
  }
  return value;
};

export const env = {
  apiBaseUrl: requireValue('VITE_API_BASE_URL', import.meta.env.VITE_API_BASE_URL),
  cognito: {
    userPoolId: requireValue('VITE_COGNITO_USER_POOL_ID', import.meta.env.VITE_COGNITO_USER_POOL_ID),
    clientId: requireValue('VITE_COGNITO_CLIENT_ID', import.meta.env.VITE_COGNITO_CLIENT_ID),
    region: requireValue('VITE_COGNITO_REGION', import.meta.env.VITE_COGNITO_REGION),
  },
} as const;
