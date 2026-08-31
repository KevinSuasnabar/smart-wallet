// Auth persistence. Despite the filename (kept to avoid a churny rename), this
// persists to `localStorage` so the session survives a full app/tab close and a
// standalone PWA cold launch — see the "Session Survives Cold Launch" spec.
// The storage key and JSON shape are unchanged; only the Storage backend differs.

const KEY = 'smart-wallet:auth:v1';

interface PersistedAuth {
  username: string;
  idToken: string;
  refreshToken: string;
}

export const readPersisted = (): PersistedAuth | null => {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PersistedAuth;
  } catch {
    return null;
  }
};

export const writePersisted = (data: PersistedAuth): void => {
  localStorage.setItem(KEY, JSON.stringify(data));
};

export const clearPersisted = (): void => {
  localStorage.removeItem(KEY);
};
