import { env } from '../env.js';
import { ApiError } from './errors.js';

type GetToken = () => string | null;
type Refresh = () => Promise<string>;

class ApiClient {
  private getToken: GetToken = () => null;
  private refresh: Refresh = () => Promise.reject(new Error('refresh not configured'));
  private refreshPromise: Promise<string> | null = null;

  configure(opts: { getToken: GetToken; refresh: Refresh }): void {
    this.getToken = opts.getToken;
    this.refresh = opts.refresh;
  }

  async request<T>(input: {
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
    path: string;
    body?: unknown;
    headers?: Record<string, string>;
    query?: Record<string, string | number | undefined>;
  }): Promise<T> {
    const doFetch = async (token: string | null): Promise<Response> => {
      const url = new URL(input.path, env.apiBaseUrl);
      if (input.query) {
        for (const [k, v] of Object.entries(input.query)) {
          if (v !== undefined) url.searchParams.set(k, String(v));
        }
      }
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(input.headers ?? {}),
      };
      if (token) headers.Authorization = `Bearer ${token}`;
      const init: RequestInit = {
        method: input.method,
        headers,
      };
      if (input.body !== undefined) init.body = JSON.stringify(input.body);
      return fetch(url.toString(), init);
    };

    let response = await doFetch(this.getToken());

    // Single-flight refresh on 401: if a refresh is already in flight,
    // both concurrent callers await the same promise (no duplicate refresh).
    if (response.status === 401) {
      const newToken = await this.runRefresh();
      response = await doFetch(newToken);
    }

    // 204 No Content — DELETE endpoints return no body
    if (response.status === 204) {
      return undefined as T;
    }

    if (!response.ok) {
      let bodyJson: { error?: string; details?: unknown } | null = null;
      try {
        bodyJson = (await response.json()) as { error?: string; details?: unknown };
      } catch {
        // body not JSON or empty — use defaults below
      }
      throw new ApiError(
        response.status,
        bodyJson?.error ?? `http_${response.status}`,
        `HTTP ${response.status} ${response.statusText}`,
        bodyJson?.details,
      );
    }

    return (await response.json()) as T;
  }

  private async runRefresh(): Promise<string> {
    // Single-flight: coalesce concurrent 401s onto ONE refresh attempt.
    // Promise is cleared (set to null) after success OR failure via finally().
    if (this.refreshPromise) return this.refreshPromise;
    this.refreshPromise = this.refresh().finally(() => {
      this.refreshPromise = null;
    });
    return this.refreshPromise;
  }

  get<T>(path: string, query?: Record<string, string | number | undefined>): Promise<T> {
    return this.request<T>({ method: 'GET', path, ...(query ? { query } : {}) });
  }

  post<T>(path: string, body: unknown, headers?: Record<string, string>): Promise<T> {
    return this.request<T>({ method: 'POST', path, body, ...(headers ? { headers } : {}) });
  }

  put<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>({ method: 'PUT', path, body });
  }

  patch<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>({ method: 'PATCH', path, body });
  }

  del(path: string): Promise<void> {
    return this.request<void>({ method: 'DELETE', path });
  }
}

// Module-scope singleton. Configure() is called by ApiClientBridge on every
// auth state change (sign in / refresh / sign out).
export const apiClient = new ApiClient();
