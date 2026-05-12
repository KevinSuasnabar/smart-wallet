const required = (name: string): string => {
  const v: unknown = import.meta.env[name];
  if (typeof v !== 'string' || !v) throw new Error(`Missing env var: ${name}`);
  return v;
};

export const env = {
  apiBaseUrl: required('VITE_API_BASE_URL'),
  cognito: {
    userPoolId: required('VITE_COGNITO_USER_POOL_ID'),
    clientId: required('VITE_COGNITO_CLIENT_ID'),
    region: required('VITE_COGNITO_REGION'),
  },
} as const;
