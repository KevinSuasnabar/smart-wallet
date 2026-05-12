const KEY = 'smart-wallet:auth:v1';

interface PersistedAuth {
  username: string;
  idToken: string;
  refreshToken: string;
}

export const readPersisted = (): PersistedAuth | null => {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PersistedAuth;
  } catch {
    return null;
  }
};

export const writePersisted = (data: PersistedAuth): void => {
  sessionStorage.setItem(KEY, JSON.stringify(data));
};

export const clearPersisted = (): void => {
  sessionStorage.removeItem(KEY);
};
