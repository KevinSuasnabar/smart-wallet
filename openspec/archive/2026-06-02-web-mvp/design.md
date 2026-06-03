# Design: web-mvp

> Companion to `proposal.md`. The proposal locks the WHAT and high-level HOW; this document expands the HOW into concrete file paths, code-level contracts, data flow, and an implementation order suitable for `sdd-tasks`.
>
> Currency set for MVP: **`USD | PEN`** only (mirrors `shared-types/src/currencies.ts`).
>
> Backend is LIVE at `https://f4vv2f72ua.execute-api.us-east-1.amazonaws.com`. This change consumes it as-is with ZERO backend modifications.

---

## 1. Approach overview

The user opens the deployed SPA at `https://{distribution-domain}/`. Vite's `index.html` boots `src/main.tsx`, which mounts `<App />` inside a `<Providers>` tree: `QueryClientProvider` → `AuthProvider` → `<BrowserRouter>` → `<ErrorBoundary>` → `<Toaster />`. On mount, `AuthProvider` synchronously hydrates from `sessionStorage` (key `auth`) — if it finds tokens, it sets `{ user, idToken, isLoading: false }` and the user is treated as authenticated until proven otherwise. If empty, `isLoading: false` + unauthenticated → `ProtectedRoute` redirects to `/login?next={pathname}`.

The user navigates to a protected route (e.g., `/wallets`). The route's page component calls a TanStack Query hook (`useWallets()`), which calls a per-feature typed API function (`walletsApi.list()`), which calls the generic `apiClient.request(...)` in `lib/api/client.ts`. The client attaches `Authorization: Bearer ${idToken}` from auth state, awaits `fetch`, and either returns the typed JSON, throws `ApiError(status, code, details)`, or — on 401 — triggers a **single-flight** refresh via `AuthProvider.refreshSession()`, retries the original request once, and only then surfaces the error (clearing the session on refresh failure). Query keys are produced by feature-owned factories (`walletKeys`, `transactionKeys`, `categoryKeys`); mutations call `apiClient` then `queryClient.invalidateQueries({ queryKey: feature.all })`. No optimistic updates — financial data reflects server confirmation.

The user fills `AddTransactionForm` (RHF + Zod resolver using `AddTransactionRequestSchema` from `@smart-wallet/shared-types`). A UUID v4 generated **once on form mount** via `crypto.randomUUID()` is held in form state and passed as the `Idempotency-Key` header on submit. Backend returns 201 on first write, 200 on replay — UI treats both as success, fires a Sonner toast, and `navigate(-1)` back to the wallet detail. Wallet detail's `useWallet(id)` + `useWalletTransactions(id, { limit: 10 })` are invalidated by the mutation's `onSuccess`, so the balance and recent list re-render automatically. The transaction list page (`/wallets/:walletId/transactions`) uses `useInfiniteQuery` with `getNextPageParam: (last) => last.nextCursor`; the "Load more" button calls `fetchNextPage()`. Layout is responsive: `< md` renders `BottomTabBar` (fixed, `pb-safe`); `≥ md` renders `Sidebar`. Both read the same `routes.ts` constants. CSS is Tailwind + CSS vars from `shadcn/ui` (New York preset) — single `globals.css`, no CSS-in-JS.

The infrastructure piece (PR4) ships a new `WebHosting` CDK construct producing a private S3 bucket (BPA on, versioned, KMS S3-managed), CloudFront with OAC, custom error responses mapping 403/404 → `/index.html` with HTTP 200, `PriceClass_100`, `REDIRECT_TO_HTTPS`, default cache policy `CACHING_OPTIMIZED`. Three new SSM parameters under `/smart-wallet/prod/web/` publish the bucket name, distribution id, and distribution domain. After the first CDK deploy, the operator captures the CloudFront domain from SSM, adds it to `UserPool` callback/logout URLs (committed via CDK source edit), and runs `cdk deploy` a second time. The web deploy script (`pnpm --filter @smart-wallet/web deploy`) reads bucket name + distribution id from SSM, `aws s3 sync` the Vite `dist/` output, then invalidates `/index.html` on CloudFront.

---

## 2. Package design

### 2.1 `packages/web/package.json`

**`type: "module"`** (consistent with monorepo).

```json
{
  "name": "@smart-wallet/web",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview --port 4173",
    "typecheck": "tsc --noEmit",
    "lint": "eslint . --max-warnings=0",
    "deploy": "node scripts/deploy.mjs"
  },
  "dependencies": {
    "@hookform/resolvers": "^3.9.1",
    "@radix-ui/react-avatar": "^1.1.2",
    "@radix-ui/react-dialog": "^1.1.4",
    "@radix-ui/react-label": "^2.1.1",
    "@radix-ui/react-popover": "^1.1.4",
    "@radix-ui/react-select": "^2.1.4",
    "@radix-ui/react-separator": "^1.1.1",
    "@radix-ui/react-slot": "^1.1.1",
    "@radix-ui/react-tabs": "^1.1.2",
    "@smart-wallet/shared-types": "workspace:*",
    "@tanstack/react-query": "^5.62.7",
    "amazon-cognito-identity-js": "^6.3.12",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "date-fns": "^4.1.0",
    "lucide-react": "^0.469.0",
    "react": "^18.3.1",
    "react-day-picker": "^8.10.1",
    "react-dom": "^18.3.1",
    "react-hook-form": "^7.54.2",
    "react-router-dom": "^6.28.1",
    "sonner": "^1.7.1",
    "tailwind-merge": "^2.5.5",
    "tailwindcss-animate": "^1.0.7",
    "zod": "catalog:"
  },
  "devDependencies": {
    "@types/react": "^18.3.17",
    "@types/react-dom": "^18.3.5",
    "@vitejs/plugin-react": "^4.3.4",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.49",
    "tailwindcss": "^3.4.16",
    "typescript": "catalog:",
    "vite": "^6.0.5"
  }
}
```

**Notes**:

- `zod` is taken from the workspace `catalog:` to share the exact version `shared-types` was built against. Same for `typescript`.
- `amazon-cognito-identity-js` is CJS; Vite's ESM/CJS interop handles it. No special config needed beyond default Vite behaviour.
- `date-fns` is added for the date picker; tree-shakeable; only `format` + `parseISO` will be imported, costing ~2 KB gz.
- `tailwindcss-animate` is a shadcn requirement (provides keyframes for dialogs/sheets).
- Radix primitives are pulled in **per shadcn component** — no umbrella radix package.

### 2.2 `packages/web/vite.config.ts`

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  preview: {
    port: 4173,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    target: 'es2022',
    rollupOptions: {
      output: {
        // Hashed filenames in assets/ → 1y immutable cache (set on s3 sync).
        assetFileNames: 'assets/[name]-[hash][extname]',
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
      },
    },
  },
  envPrefix: 'VITE_',
});
```

**Notes**:

- `@/` alias matches the `tsconfig.json` `paths` entry. TS-first (avoids `~/` which conflicts with home directories on some shells).
- `target: 'es2022'` aligns with `tsconfig` and Node 22 (matches backend). Modern browsers; Vite uses esbuild's modern target.
- `sourcemap: true` for production — small extra bytes, huge help when debugging from CloudFront logs/Sentry-future.

### 2.3 `packages/web/tsconfig.json`

Existing TS config is already strict-aligned. Verify:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "preserve",
    "strict": true,
    "exactOptionalPropertyTypes": true,
    "noUncheckedIndexedAccess": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true,
    "allowImportingTsExtensions": false,
    "isolatedModules": true,
    "noEmit": true,
    "resolveJsonModule": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"] },
    "types": ["vite/client"]
  },
  "include": ["src", "vite.config.ts"],
  "exclude": ["node_modules", "dist"]
}
```

**`moduleResolution: "Bundler"`** means imports do **not** need `.js` extensions (unlike `packages/api` which uses NodeNext). This is critical for shadcn copy-in components (they ship with extension-less imports).

`jsx: "preserve"` — Vite handles JSX transform via its esbuild plugin.

A separate `tsconfig.node.json` (already in monorepo for tooling) covers `vite.config.ts` if needed.

### 2.4 Tailwind config (`tailwind.config.ts`)

```ts
import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

const config: Config = {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    container: { center: true, padding: '1rem', screens: { '2xl': '1400px' } },
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: { DEFAULT: 'hsl(var(--primary))', foreground: 'hsl(var(--primary-foreground))' },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: { DEFAULT: 'hsl(var(--muted))', foreground: 'hsl(var(--muted-foreground))' },
        accent: { DEFAULT: 'hsl(var(--accent))', foreground: 'hsl(var(--accent-foreground))' },
        popover: { DEFAULT: 'hsl(var(--popover))', foreground: 'hsl(var(--popover-foreground))' },
        card: { DEFAULT: 'hsl(var(--card))', foreground: 'hsl(var(--card-foreground))' },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [animate],
};

export default config;
```

**Safe-area utilities** (added in `globals.css`, not in config, to keep config diff-free with shadcn updates):

```css
@layer utilities {
  .pb-safe {
    padding-bottom: calc(0.5rem + env(safe-area-inset-bottom));
  }
  .pt-safe {
    padding-top: calc(0.5rem + env(safe-area-inset-top));
  }
}
```

### 2.5 shadcn config (`components.json`)

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "tailwind.config.ts",
    "css": "src/styles/globals.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  }
}
```

**Components installed via `npx shadcn@latest add ...`** (16 in total per proposal §4.7):

Critical path: `button`, `input`, `label`, `form`, `card`, `select`, `separator`, `sonner`, `skeleton`, `dialog`, `sheet`.
Secondary: `badge`, `tabs`, `avatar`.
Date input: `calendar`, `popover` (composed as DatePickerField).
Data display: `table`.

**`lib/utils.ts`** is auto-generated by shadcn (`cn()` helper using `clsx` + `tailwind-merge`). Single line — keep as-is.

### 2.6 Folder structure (locked from proposal §4.3)

```
packages/web/
  index.html
  vite.config.ts
  tailwind.config.ts
  postcss.config.cjs
  components.json
  tsconfig.json
  .env.example
  .env.production
  scripts/
    deploy.mjs                          # reads SSM, runs s3 sync + invalidation
  public/
    favicon.svg
  src/
    main.tsx                            # ReactDOM.createRoot + <App />
    vite-env.d.ts                       # typed import.meta.env
    styles/
      globals.css                       # @tailwind + CSS vars + safe-area utilities
    app/
      App.tsx                           # composes <Providers> + <AppRouter />
      AppRouter.tsx                     # createBrowserRouter / <Routes>
      Providers.tsx                     # QueryClientProvider + AuthProvider + Toaster + ErrorBoundary
      ErrorBoundary.tsx                 # class component, root-level only
      routes.ts                         # RoutePaths constants
    features/
      auth/
        pages/
          LoginPage.tsx
          SignupPage.tsx
          ConfirmSignupPage.tsx
          ForgotPasswordPage.tsx
          ConfirmForgotPasswordPage.tsx
        components/
          PasswordRequirementsHint.tsx
        AuthProvider.tsx
        useAuth.ts                      # context hook (re-export)
        cognitoClient.ts                # CognitoUserPool singleton + helpers
        types.ts                        # AuthState, AuthContextValue
        sessionStorage.ts               # saveSession / loadSession / clearSession
      wallets/
        pages/
          WalletsListPage.tsx
          WalletDetailPage.tsx
          CreateWalletPage.tsx
        components/
          WalletCard.tsx
          WalletBalanceHeader.tsx
          WalletForm.tsx
          WalletsListSkeleton.tsx
          EmptyWalletsState.tsx
        walletsApi.ts                   # typed API functions
        queries.ts                      # useWallets, useWallet, useCreateWallet + walletKeys
        types.ts                        # local feature types (rare)
      transactions/
        pages/
          TransactionListPage.tsx
          AddTransactionPage.tsx
        components/
          TransactionListItem.tsx
          TransactionForm.tsx
          TransactionFilters.tsx
          RecentTransactionsList.tsx
          TransactionsListSkeleton.tsx
        transactionsApi.ts
        queries.ts                      # useWalletTransactions (infinite) + useAddTransaction + transactionKeys
      categories/
        pages/
          CategoriesPage.tsx
        components/
          CategoryList.tsx
          CategoryItem.tsx
          CreateCategoryDialog.tsx
          DeleteCategoryConfirm.tsx
        categoriesApi.ts
        queries.ts                      # useCategories + useCreateCustomCategory + useDeleteCustomCategory + categoryKeys
      settings/
        pages/
          SettingsPage.tsx
        components/
          AccountInfo.tsx
          SignOutButton.tsx
    components/
      ui/                               # shadcn copy-in
        button.tsx
        input.tsx
        label.tsx
        form.tsx
        card.tsx
        select.tsx
        separator.tsx
        sonner.tsx
        skeleton.tsx
        dialog.tsx
        sheet.tsx
        badge.tsx
        tabs.tsx
        avatar.tsx
        calendar.tsx
        popover.tsx
        table.tsx
      layout/
        AppLayout.tsx                   # protected shell (header + main + nav)
        PublicLayout.tsx                # auth pages shell (centred card)
        ProtectedRoute.tsx              # guards via useAuth + Navigate
        BottomTabBar.tsx                # < md
        Sidebar.tsx                     # >= md
        Fab.tsx                         # < md floating Add Transaction button
      forms/
        FormField.tsx                   # shadcn re-wrap if needed
        MoneyInput.tsx                  # decimal input bound to wallet currency
        DatePickerField.tsx             # calendar + popover composition
        CurrencySelect.tsx              # USD/PEN
        CategorySelect.tsx              # merged predefined + custom
        WalletSelect.tsx                # for AddTransaction
      common/
        ErrorState.tsx                  # "Retry" inline error card
        EmptyState.tsx                  # icon + text + optional CTA
        PageHeader.tsx                  # title + optional back/actions
        NotFoundPage.tsx
        GenericErrorScreen.tsx          # rendered by ErrorBoundary
    lib/
      utils.ts                          # cn() (shadcn-generated)
      env.ts                            # typed env access (throws if missing)
      currency.ts                       # formatCurrency, signedFormat, parseDecimalInput
      i18n.ts                           # Spanish UI strings (const tree)
      queryClient.ts                    # configured QueryClient
      idempotency.ts                    # generateIdempotencyKey() = crypto.randomUUID()
      api/
        client.ts                       # generic fetch wrapper with auth + 401 single-flight refresh
        errors.ts                       # ApiError class + mapping helpers
        types.ts                        # internal request shape
      cognito/
        pool.ts                         # CognitoUserPool singleton
    hooks/
      useDebouncedValue.ts
      useMediaQuery.ts
```

**Rationale**: this layout is the proposal's locked feature-sliced structure with each file's responsibility nailed down. `lib/api/` is the single seam where auth + refresh + error mapping live; per-feature `*Api.ts` files own the typed call signatures. `components/` is strictly cross-feature (layout, forms, ui). Spanish strings centralised in `lib/i18n.ts`.

---

## 3. Key code contracts

All snippets are TS strict (`exactOptionalPropertyTypes`, `verbatimModuleSyntax`, `noUncheckedIndexedAccess`). `import type` is used wherever a symbol is value-erased.

### 3.1 Env (`lib/env.ts`)

```ts
interface AppEnv {
  VITE_API_BASE_URL: string;
  VITE_COGNITO_USER_POOL_ID: string;
  VITE_COGNITO_CLIENT_ID: string;
  VITE_COGNITO_REGION: string;
}

function readRequired(key: keyof AppEnv): string {
  const value = import.meta.env[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Missing required env var: ${key}`);
  }
  return value;
}

export const env: AppEnv = {
  VITE_API_BASE_URL: readRequired('VITE_API_BASE_URL'),
  VITE_COGNITO_USER_POOL_ID: readRequired('VITE_COGNITO_USER_POOL_ID'),
  VITE_COGNITO_CLIENT_ID: readRequired('VITE_COGNITO_CLIENT_ID'),
  VITE_COGNITO_REGION: readRequired('VITE_COGNITO_REGION'),
};
```

Companion `vite-env.d.ts`:

```ts
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
  readonly VITE_COGNITO_USER_POOL_ID: string;
  readonly VITE_COGNITO_CLIENT_ID: string;
  readonly VITE_COGNITO_REGION: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
```

### 3.2 Cognito client (`lib/cognito/pool.ts`)

```ts
import { CognitoUserPool } from 'amazon-cognito-identity-js';
import { env } from '@/lib/env';

export const userPool = new CognitoUserPool({
  UserPoolId: env.VITE_COGNITO_USER_POOL_ID,
  ClientId: env.VITE_COGNITO_CLIENT_ID,
});
```

Single module-scope instance — `amazon-cognito-identity-js` is safe to share across the app.

### 3.3 AuthProvider + useAuth (`features/auth/AuthProvider.tsx`)

```ts
// features/auth/types.ts
import type { CognitoUser } from 'amazon-cognito-identity-js';

export interface AuthState {
  user: CognitoUser | null;
  idToken: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  username: string | null;
  isLoading: boolean;
}

export interface SignInResult {
  idToken: string;
  accessToken: string;
  refreshToken: string;
}

export interface AuthContextValue extends AuthState {
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  confirmSignUp: (email: string, code: string) => Promise<void>;
  resendCode: (email: string) => Promise<void>;
  forgotPassword: (email: string) => Promise<void>;
  confirmForgotPassword: (email: string, code: string, newPassword: string) => Promise<void>;
  refreshSession: () => Promise<string>; // returns fresh idToken
  signOut: () => Promise<void>;
}
```

```ts
// features/auth/AuthProvider.tsx
import { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  AuthenticationDetails,
  CognitoUser,
  CognitoUserAttribute,
  CognitoUserSession,
  CognitoRefreshToken,
} from 'amazon-cognito-identity-js';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { userPool } from '@/lib/cognito/pool';
import type { AuthContextValue, AuthState } from './types';
import { loadSession, saveSession, clearSession } from './sessionStorage';

export const AuthContext = createContext<AuthContextValue | null>(null);

const initialState: AuthState = {
  user: null,
  idToken: null,
  accessToken: null,
  refreshToken: null,
  username: null,
  isLoading: true,
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(initialState);
  const refreshInFlightRef = useRef<Promise<string> | null>(null);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // Hydrate from sessionStorage on mount — synchronous, no API call.
  useEffect(() => {
    const session = loadSession();
    if (session === null) {
      setState({ ...initialState, isLoading: false });
      return;
    }
    const user = new CognitoUser({ Username: session.username, Pool: userPool });
    setState({
      user,
      idToken: session.idToken,
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      username: session.username,
      isLoading: false,
    });
  }, []);

  const signIn = useCallback<AuthContextValue['signIn']>(async (email, password) => {
    const user = new CognitoUser({ Username: email, Pool: userPool });
    user.setAuthenticationFlowType('USER_PASSWORD_AUTH');
    const auth = new AuthenticationDetails({ Username: email, Password: password });
    const session = await new Promise<CognitoUserSession>((resolve, reject) => {
      user.authenticateUser(auth, { onSuccess: resolve, onFailure: reject });
    });
    const idToken = session.getIdToken().getJwtToken();
    const accessToken = session.getAccessToken().getJwtToken();
    const refreshToken = session.getRefreshToken().getToken();
    saveSession({ username: email, idToken, accessToken, refreshToken });
    setState({ user, idToken, accessToken, refreshToken, username: email, isLoading: false });
  }, []);

  const signUp = useCallback<AuthContextValue['signUp']>(async (email, password) => {
    await new Promise<void>((resolve, reject) => {
      const attrs = [new CognitoUserAttribute({ Name: 'email', Value: email })];
      userPool.signUp(email, password, attrs, [], (err) => (err ? reject(err) : resolve()));
    });
  }, []);

  const confirmSignUp = useCallback<AuthContextValue['confirmSignUp']>(async (email, code) => {
    const user = new CognitoUser({ Username: email, Pool: userPool });
    await new Promise<void>((resolve, reject) => {
      user.confirmRegistration(code, true, (err) => (err ? reject(err) : resolve()));
    });
  }, []);

  const resendCode = useCallback<AuthContextValue['resendCode']>(async (email) => {
    const user = new CognitoUser({ Username: email, Pool: userPool });
    await new Promise<void>((resolve, reject) => {
      user.resendConfirmationCode((err) => (err ? reject(err) : resolve()));
    });
  }, []);

  const forgotPassword = useCallback<AuthContextValue['forgotPassword']>(async (email) => {
    const user = new CognitoUser({ Username: email, Pool: userPool });
    await new Promise<void>((resolve, reject) => {
      user.forgotPassword({ onSuccess: () => resolve(), onFailure: reject });
    });
  }, []);

  const confirmForgotPassword = useCallback<AuthContextValue['confirmForgotPassword']>(
    async (email, code, newPassword) => {
      const user = new CognitoUser({ Username: email, Pool: userPool });
      await new Promise<void>((resolve, reject) => {
        user.confirmPassword(code, newPassword, { onSuccess: () => resolve(), onFailure: reject });
      });
    },
    [],
  );

  // Single-flight refresh: concurrent 401s share the same promise.
  const refreshSession = useCallback<AuthContextValue['refreshSession']>(async () => {
    if (refreshInFlightRef.current !== null) return refreshInFlightRef.current;
    const inflight = (async () => {
      const session = loadSession();
      if (session === null) throw new Error('no_refresh_token');
      const user = new CognitoUser({ Username: session.username, Pool: userPool });
      const refreshToken = new CognitoRefreshToken({ RefreshToken: session.refreshToken });
      const fresh = await new Promise<CognitoUserSession>((resolve, reject) => {
        user.refreshSession(refreshToken, (err, s) => (err !== null && err !== undefined ? reject(err) : resolve(s)));
      });
      const idToken = fresh.getIdToken().getJwtToken();
      const accessToken = fresh.getAccessToken().getJwtToken();
      const newRefresh = fresh.getRefreshToken().getToken();
      saveSession({ username: session.username, idToken, accessToken, refreshToken: newRefresh });
      setState((s) => ({ ...s, idToken, accessToken, refreshToken: newRefresh }));
      return idToken;
    })();
    refreshInFlightRef.current = inflight;
    try {
      return await inflight;
    } finally {
      refreshInFlightRef.current = null;
    }
  }, []);

  const signOut = useCallback<AuthContextValue['signOut']>(async () => {
    const u = userPool.getCurrentUser();
    if (u !== null) {
      u.signOut(); // local cleanup
      // best-effort global sign-out (invalidate refresh tokens server-side)
      try {
        await new Promise<void>((resolve) => {
          u.getSession((err: Error | null) => {
            if (err !== null) return resolve();
            u.globalSignOut({ onSuccess: () => resolve(), onFailure: () => resolve() });
          });
        });
      } catch {
        /* swallow */
      }
    }
    clearSession();
    setState({ ...initialState, isLoading: false });
    queryClient.clear();
    navigate('/login', { replace: true });
  }, [queryClient, navigate]);

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      signIn,
      signUp,
      confirmSignUp,
      resendCode,
      forgotPassword,
      confirmForgotPassword,
      refreshSession,
      signOut,
    }),
    [state, signIn, signUp, confirmSignUp, resendCode, forgotPassword, confirmForgotPassword, refreshSession, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
```

```ts
// features/auth/useAuth.ts
import { useContext } from 'react';
import { AuthContext } from './AuthProvider';
import type { AuthContextValue } from './types';

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (ctx === null) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
```

```ts
// features/auth/sessionStorage.ts
interface PersistedSession {
  username: string;
  idToken: string;
  accessToken: string;
  refreshToken: string;
}

const KEY = 'auth';

export function saveSession(session: PersistedSession): void {
  sessionStorage.setItem(KEY, JSON.stringify(session));
}

export function loadSession(): PersistedSession | null {
  const raw = sessionStorage.getItem(KEY);
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PersistedSession>;
    if (
      typeof parsed.username !== 'string' ||
      typeof parsed.idToken !== 'string' ||
      typeof parsed.accessToken !== 'string' ||
      typeof parsed.refreshToken !== 'string'
    ) {
      return null;
    }
    return {
      username: parsed.username,
      idToken: parsed.idToken,
      accessToken: parsed.accessToken,
      refreshToken: parsed.refreshToken,
    };
  } catch {
    return null;
  }
}

export function clearSession(): void {
  sessionStorage.removeItem(KEY);
}
```

### 3.4 API client (`lib/api/client.ts`)

```ts
import { ApiError } from './errors';
import { env } from '@/lib/env';

type Method = 'GET' | 'POST' | 'DELETE';

interface RequestOptions {
  method: Method;
  path: string;
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  headers?: Record<string, string>;
}

type TokenGetter = () => string | null;
type TokenRefresher = () => Promise<string>;

class ApiClient {
  private getToken: TokenGetter = () => null;
  private refreshToken: TokenRefresher = () => Promise.reject(new Error('refresh not configured'));

  configure(opts: { getToken: TokenGetter; refresh: TokenRefresher }): void {
    this.getToken = opts.getToken;
    this.refreshToken = opts.refresh;
  }

  async request<T>(options: RequestOptions): Promise<T> {
    return this.executeOnce<T>(options, /* allowRetry */ true);
  }

  private async executeOnce<T>(options: RequestOptions, allowRetry: boolean): Promise<T> {
    const url = this.buildUrl(options.path, options.query);
    const token = this.getToken();
    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token !== null ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    };
    let response: Response;
    try {
      response = await fetch(url, {
        method: options.method,
        headers,
        body: options.body !== undefined ? JSON.stringify(options.body) : null,
      });
    } catch (cause) {
      throw new ApiError(0, 'network_error', 'Network request failed', cause);
    }
    if (response.status === 401 && allowRetry) {
      try {
        await this.refreshToken(); // single-flight inside AuthProvider
      } catch {
        throw new ApiError(401, 'unauthorized', 'Session expired');
      }
      return this.executeOnce<T>(options, /* allowRetry */ false);
    }
    if (response.status === 204) return undefined as T;
    const text = await response.text();
    const parsed = text.length > 0 ? (JSON.parse(text) as unknown) : undefined;
    if (!response.ok) {
      const body = (parsed ?? {}) as { error?: string; message?: string; details?: unknown };
      throw new ApiError(
        response.status,
        body.error ?? 'unknown_error',
        body.message ?? response.statusText,
        body.details,
      );
    }
    return parsed as T;
  }

  private buildUrl(path: string, query?: Record<string, string | number | undefined>): string {
    const base = env.VITE_API_BASE_URL.replace(/\/$/, '');
    const url = new URL(`${base}${path}`);
    if (query !== undefined) {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined) url.searchParams.set(k, String(v));
      }
    }
    return url.toString();
  }

  get<T>(path: string, query?: Record<string, string | number | undefined>): Promise<T> {
    return this.request<T>({ method: 'GET', path, ...(query !== undefined ? { query } : {}) });
  }
  post<T>(path: string, body: unknown, headers?: Record<string, string>): Promise<T> {
    return this.request<T>({
      method: 'POST',
      path,
      body,
      ...(headers !== undefined ? { headers } : {}),
    });
  }
  delete(path: string): Promise<void> {
    return this.request<void>({ method: 'DELETE', path });
  }
}

export const apiClient = new ApiClient();
```

```ts
// lib/api/errors.ts
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError;
}

export function userMessageFor(error: unknown): string {
  if (!isApiError(error)) return 'Algo salió mal. Intentá de nuevo.';
  switch (error.code) {
    case 'transaction.currency_mismatch':
      return 'La moneda de la transacción debe coincidir con la de la billetera.';
    case 'transaction.amount_not_positive':
      return 'El monto debe ser mayor a cero.';
    case 'transaction.unknown_category':
      return 'La categoría seleccionada no existe.';
    case 'transaction.category_type_mismatch':
      return 'La categoría no coincide con el tipo de transacción.';
    case 'wallet.invalid_name':
      return 'El nombre de la billetera no es válido.';
    case 'wallet.not_found':
      return 'No encontramos la billetera.';
    case 'category.predefined_immutable':
      return 'Las categorías predefinidas no se pueden eliminar.';
    case 'category.not_found':
      return 'No encontramos la categoría.';
    case 'validation_failed':
      return 'Revisá los campos del formulario.';
    case 'network_error':
      return 'Sin conexión. Verificá tu red.';
    case 'unauthorized':
      return 'Tu sesión expiró. Iniciá sesión nuevamente.';
    default:
      return error.message || 'Algo salió mal. Intentá de nuevo.';
  }
}
```

**Wiring** (inside `Providers.tsx` after `AuthProvider` mounts, via a small bridge component that calls `apiClient.configure(...)` with current auth state — uses a `useEffect` listening to `idToken` changes; alternative is `apiClient.configure` called once with closures that read `useRef` slots updated by `AuthProvider`). The exact wiring lives in `Providers.tsx` (see §3.7).

### 3.5 Per-feature typed API functions

```ts
// features/wallets/walletsApi.ts
import { apiClient } from '@/lib/api/client';
import type {
  CreateWalletDTO,
  WalletResponseDTO,
  ListWalletsResponseDTO,
  ListWalletsQueryDTO,
} from '@smart-wallet/shared-types';

export const walletsApi = {
  list: (query?: ListWalletsQueryDTO) =>
    apiClient.get<ListWalletsResponseDTO>(
      '/wallets',
      query !== undefined
        ? {
            ...(query.limit !== undefined ? { limit: query.limit } : {}),
            ...(query.cursor !== undefined ? { cursor: query.cursor } : {}),
          }
        : undefined,
    ),
  get: (walletId: string) => apiClient.get<WalletResponseDTO>(`/wallets/${walletId}`),
  create: (dto: CreateWalletDTO) => apiClient.post<WalletResponseDTO>('/wallets', dto),
};
```

```ts
// features/transactions/transactionsApi.ts
import { apiClient } from '@/lib/api/client';
import type {
  AddTransactionDTO,
  TransactionResponseDTO,
  ListTransactionsResponseDTO,
  ListTransactionsByWalletQueryDTO,
} from '@smart-wallet/shared-types';

export const transactionsApi = {
  byWallet: (walletId: string, query: ListTransactionsByWalletQueryDTO) =>
    apiClient.get<ListTransactionsResponseDTO>(`/wallets/${walletId}/transactions`, {
      ...(query.limit !== undefined ? { limit: query.limit } : {}),
      ...(query.cursor !== undefined ? { cursor: query.cursor } : {}),
      ...(query.type !== undefined ? { type: query.type } : {}),
      ...(query.from !== undefined ? { from: query.from } : {}),
      ...(query.to !== undefined ? { to: query.to } : {}),
    }),
  add: (walletId: string, dto: AddTransactionDTO, idempotencyKey: string) =>
    apiClient.post<TransactionResponseDTO>(`/wallets/${walletId}/transactions`, dto, {
      'Idempotency-Key': idempotencyKey,
    }),
};
```

```ts
// features/categories/categoriesApi.ts
import { apiClient } from '@/lib/api/client';
import type {
  CreateCustomCategoryDTO,
  CategoryResponseDTO,
  ListCategoriesResponseDTO,
} from '@smart-wallet/shared-types';

export const categoriesApi = {
  list: () => apiClient.get<ListCategoriesResponseDTO>('/categories'),
  create: (dto: CreateCustomCategoryDTO) => apiClient.post<CategoryResponseDTO>('/categories', dto),
  delete: (categoryId: string) => apiClient.delete(`/categories/${categoryId}`),
};
```

### 3.6 TanStack Query hooks (key factories + hooks)

```ts
// features/wallets/queries.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { CreateWalletDTO, ListWalletsQueryDTO } from '@smart-wallet/shared-types';
import { walletsApi } from './walletsApi';

export const walletKeys = {
  all: ['wallets'] as const,
  lists: () => [...walletKeys.all, 'list'] as const,
  list: (query?: ListWalletsQueryDTO) => [...walletKeys.lists(), query ?? {}] as const,
  details: () => [...walletKeys.all, 'detail'] as const,
  detail: (walletId: string) => [...walletKeys.details(), walletId] as const,
};

export const useWallets = (query?: ListWalletsQueryDTO) =>
  useQuery({
    queryKey: walletKeys.list(query),
    queryFn: () => walletsApi.list(query),
    staleTime: 30_000,
  });

export const useWallet = (walletId: string | undefined) =>
  useQuery({
    queryKey: walletId !== undefined ? walletKeys.detail(walletId) : walletKeys.detail('disabled'),
    queryFn: () => walletsApi.get(walletId as string),
    enabled: walletId !== undefined,
  });

export const useCreateWallet = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateWalletDTO) => walletsApi.create(dto),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: walletKeys.all });
    },
  });
};
```

```ts
// features/transactions/queries.ts
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  AddTransactionDTO,
  ListTransactionsByWalletQueryDTO,
} from '@smart-wallet/shared-types';
import { transactionsApi } from './transactionsApi';
import { walletKeys } from '@/features/wallets/queries';

export const transactionKeys = {
  all: ['transactions'] as const,
  byWallet: (walletId: string) => [...transactionKeys.all, 'byWallet', walletId] as const,
  byWalletFiltered: (walletId: string, filters: ListTransactionsByWalletQueryDTO) =>
    [...transactionKeys.byWallet(walletId), filters] as const,
};

export const useWalletTransactions = (
  walletId: string,
  filters: ListTransactionsByWalletQueryDTO = {},
) =>
  useInfiniteQuery({
    queryKey: transactionKeys.byWalletFiltered(walletId, filters),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      transactionsApi.byWallet(walletId, {
        ...filters,
        ...(pageParam !== undefined ? { cursor: pageParam } : {}),
      }),
    getNextPageParam: (last) => last.nextCursor,
    staleTime: 15_000,
  });

export const useAddTransaction = (walletId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { dto: AddTransactionDTO; idempotencyKey: string }) =>
      transactionsApi.add(walletId, input.dto, input.idempotencyKey),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: transactionKeys.byWallet(walletId) });
      void qc.invalidateQueries({ queryKey: walletKeys.detail(walletId) });
      void qc.invalidateQueries({ queryKey: walletKeys.lists() });
    },
  });
};
```

```ts
// features/categories/queries.ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateCustomCategoryDTO } from '@smart-wallet/shared-types';
import { categoriesApi } from './categoriesApi';

export const categoryKeys = {
  all: ['categories'] as const,
  list: () => [...categoryKeys.all, 'list'] as const,
};

export const useCategories = () =>
  useQuery({
    queryKey: categoryKeys.list(),
    queryFn: () => categoriesApi.list(),
    staleTime: 5 * 60_000, // categories change rarely
  });

export const useCreateCustomCategory = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateCustomCategoryDTO) => categoriesApi.create(dto),
    onSuccess: () => void qc.invalidateQueries({ queryKey: categoryKeys.all }),
  });
};

export const useDeleteCustomCategory = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (categoryId: string) => categoriesApi.delete(categoryId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: categoryKeys.all }),
  });
};
```

### 3.7 Providers wiring (`app/Providers.tsx`)

```ts
import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/sonner';
import { AuthProvider } from '@/features/auth/AuthProvider';
import { useAuth } from '@/features/auth/useAuth';
import { ErrorBoundary } from './ErrorBoundary';
import { queryClient } from '@/lib/queryClient';
import { apiClient } from '@/lib/api/client';

function ApiClientBridge() {
  const { idToken, refreshSession } = useAuth();
  useEffect(() => {
    apiClient.configure({
      getToken: () => idToken,
      refresh: () => refreshSession(),
    });
  }, [idToken, refreshSession]);
  return null;
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ApiClientBridge />
          {children}
          <Toaster richColors position="top-center" />
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
```

**Important**: `AuthProvider` lives **inside** `QueryClientProvider` because `AuthProvider.signOut` calls `useQueryClient()`. It also lives inside `<BrowserRouter>` (via `app/App.tsx`) because `signOut` calls `useNavigate()`. The order in `App.tsx`:

```tsx
// app/App.tsx
import { BrowserRouter } from 'react-router-dom';
import { Providers } from './Providers';
import { AppRouter } from './AppRouter';

export function App() {
  return (
    <BrowserRouter>
      <Providers>
        <AppRouter />
      </Providers>
    </BrowserRouter>
  );
}
```

### 3.8 Router (`app/AppRouter.tsx`)

```tsx
import { Navigate, Route, Routes } from 'react-router-dom';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { ProtectedRoute } from '@/components/layout/ProtectedRoute';
import { AppLayout } from '@/components/layout/AppLayout';
import { LoginPage } from '@/features/auth/pages/LoginPage';
import { SignupPage } from '@/features/auth/pages/SignupPage';
import { ConfirmSignupPage } from '@/features/auth/pages/ConfirmSignupPage';
import { ForgotPasswordPage } from '@/features/auth/pages/ForgotPasswordPage';
import { ConfirmForgotPasswordPage } from '@/features/auth/pages/ConfirmForgotPasswordPage';
import { WalletsListPage } from '@/features/wallets/pages/WalletsListPage';
import { WalletDetailPage } from '@/features/wallets/pages/WalletDetailPage';
import { CreateWalletPage } from '@/features/wallets/pages/CreateWalletPage';
import { TransactionListPage } from '@/features/transactions/pages/TransactionListPage';
import { AddTransactionPage } from '@/features/transactions/pages/AddTransactionPage';
import { CategoriesPage } from '@/features/categories/pages/CategoriesPage';
import { SettingsPage } from '@/features/settings/pages/SettingsPage';
import { NotFoundPage } from '@/components/common/NotFoundPage';

export function AppRouter() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/signup/confirm" element={<ConfirmSignupPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/forgot-password/confirm" element={<ConfirmForgotPasswordPage />} />
      </Route>
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Navigate to="/wallets" replace />} />
          <Route path="/wallets" element={<WalletsListPage />} />
          <Route path="/wallets/new" element={<CreateWalletPage />} />
          <Route path="/wallets/:walletId" element={<WalletDetailPage />} />
          <Route path="/wallets/:walletId/transactions" element={<TransactionListPage />} />
          <Route path="/transactions/new" element={<AddTransactionPage />} />
          <Route path="/categories" element={<CategoriesPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
```

```tsx
// components/layout/ProtectedRoute.tsx
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/features/auth/useAuth';

export function ProtectedRoute() {
  const { idToken, isLoading } = useAuth();
  const location = useLocation();
  if (isLoading) return null; // splash handled by AppShell; keep this empty
  if (idToken === null) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  return <Outlet />;
}
```

### 3.9 AppShell with responsive nav (`components/layout/AppLayout.tsx`)

```tsx
import { Outlet } from 'react-router-dom';
import { BottomTabBar } from './BottomTabBar';
import { Sidebar } from './Sidebar';
import { Fab } from './Fab';

export function AppLayout() {
  return (
    <div className="min-h-dvh flex bg-background text-foreground">
      <Sidebar className="hidden md:flex" />
      <main className="flex-1 pb-24 md:pb-6 px-4 md:px-6">
        <Outlet />
      </main>
      <Fab className="md:hidden" />
      <BottomTabBar className="md:hidden fixed inset-x-0 bottom-0 pb-safe z-30" />
    </div>
  );
}
```

- `min-h-dvh` for true mobile viewport height (handles iOS Safari address bar).
- `pb-24` on main so the bottom tab bar doesn't overlap content; matches BottomTabBar height + `pb-safe`.
- Z-index discipline: FAB `z-40`, BottomTabBar `z-30`, modals/sheets `z-50` (shadcn defaults).

### 3.10 AddTransaction flow (component sketch)

```tsx
// features/transactions/pages/AddTransactionPage.tsx
import { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { AddTransactionRequestSchema, type AddTransactionDTO } from '@smart-wallet/shared-types';
import { generateIdempotencyKey } from '@/lib/idempotency';
import { useAddTransaction } from '@/features/transactions/queries';
import { useWallets } from '@/features/wallets/queries';
import { useCategories } from '@/features/categories/queries';
import { userMessageFor } from '@/lib/api/errors';
import { TransactionForm } from '../components/TransactionForm';

export function AddTransactionPage() {
  const [search] = useSearchParams();
  const walletIdFromQuery = search.get('walletId');
  const navigate = useNavigate();
  const wallets = useWallets();
  const categories = useCategories();

  // Stable per-form-mount idempotency key.
  const idempotencyKey = useMemo(() => generateIdempotencyKey(), []);

  const form = useForm<AddTransactionDTO>({
    resolver: zodResolver(AddTransactionRequestSchema),
    defaultValues: {
      type: 'expense',
      // currency + amount set after wallet selection
      occurredAt: new Date().toISOString(),
    },
  });

  const selectedWalletId = form.watch('walletId' as never) as string | undefined;
  const mutation = useAddTransaction(selectedWalletId ?? walletIdFromQuery ?? '');

  return (
    <TransactionForm
      form={form}
      wallets={wallets.data?.items ?? []}
      categories={categories.data?.items ?? []}
      submitting={mutation.isPending}
      onSubmit={form.handleSubmit(async (dto) => {
        try {
          await mutation.mutateAsync({ dto, idempotencyKey });
          toast.success('Transacción guardada');
          navigate(-1);
        } catch (e) {
          toast.error(userMessageFor(e));
        }
      })}
    />
  );
}
```

Key contract: **the `idempotencyKey` is stable for the lifetime of the form mount**. Double-clicking submit re-sends the same key; the backend replays the prior result and the UI surfaces success identically.

### 3.11 ErrorBoundary (`app/ErrorBoundary.tsx`)

```tsx
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { GenericErrorScreen } from '@/components/common/GenericErrorScreen';

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', error, info);
  }

  override render(): ReactNode {
    if (this.state.hasError) return <GenericErrorScreen onReload={() => location.reload()} />;
    return this.props.children;
  }
}
```

Renders only on React **render** errors. Query/mutation rejections handled by their own hooks; network errors handled by `ApiError` flow.

### 3.12 QueryClient (`lib/queryClient.ts`)

```ts
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
    mutations: {
      retry: 0,
    },
  },
});
```

### 3.13 Currency helpers (`lib/currency.ts`)

```ts
import type { Currency } from '@smart-wallet/shared-types';

export function formatCurrency(amount: string, currency: Currency): string {
  const num = Number.parseFloat(amount);
  const locale = currency === 'PEN' ? 'es-PE' : 'en-US';
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(num);
}

export function signedFormat(
  amount: string,
  type: 'income' | 'expense',
  currency: Currency,
): string {
  const formatted = formatCurrency(amount, currency);
  return type === 'expense' ? `-${formatted}` : `+${formatted}`;
}

// Parses user input (decimal string with optional sign), normalising commas to dots.
export function parseDecimalInput(raw: string): string {
  return raw.replace(/\s/g, '').replace(/,/g, '.');
}
```

### 3.14 Idempotency helper (`lib/idempotency.ts`)

```ts
export function generateIdempotencyKey(): string {
  // crypto.randomUUID is available in Vite-targeted browsers (Chrome 92+, Safari 15.4+).
  return crypto.randomUUID();
}
```

### 3.15 Spanish UI strings (`lib/i18n.ts`)

```ts
export const t = {
  auth: {
    loginTitle: 'Iniciar sesión',
    loginCta: 'Entrar',
    signupTitle: 'Crear cuenta',
    signupCta: 'Crear cuenta',
    confirmSignupTitle: 'Confirmá tu correo',
    confirmSignupCta: 'Confirmar',
    resendCode: 'Reenviar código',
    forgotPasswordTitle: 'Recuperar contraseña',
    forgotPasswordCta: 'Enviar código',
    confirmForgotPasswordTitle: 'Nueva contraseña',
    confirmForgotPasswordCta: 'Actualizar contraseña',
    email: 'Correo electrónico',
    password: 'Contraseña',
    newPassword: 'Nueva contraseña',
    code: 'Código de verificación',
    haveAccount: '¿Ya tenés cuenta?',
    noAccount: '¿No tenés cuenta?',
    forgotPasswordLink: '¿Olvidaste tu contraseña?',
    signOut: 'Cerrar sesión',
  },
  wallets: {
    title: 'Billeteras',
    empty: 'Todavía no tenés billeteras.',
    create: 'Nueva billetera',
    name: 'Nombre',
    currency: 'Moneda',
    balance: 'Balance',
    recentTransactions: 'Transacciones recientes',
    viewAll: 'Ver todas',
  },
  transactions: {
    title: 'Transacciones',
    add: 'Agregar transacción',
    type: 'Tipo',
    income: 'Ingreso',
    expense: 'Gasto',
    amount: 'Monto',
    category: 'Categoría',
    occurredAt: 'Fecha',
    note: 'Nota',
    loadMore: 'Cargar más',
    empty: 'No hay transacciones todavía.',
  },
  categories: {
    title: 'Categorías',
    create: 'Nueva categoría',
    delete: 'Eliminar',
    deleteConfirm: '¿Eliminar esta categoría?',
    name: 'Nombre',
    type: 'Tipo',
  },
  settings: {
    title: 'Configuración',
    account: 'Cuenta',
  },
  common: {
    save: 'Guardar',
    cancel: 'Cancelar',
    retry: 'Reintentar',
    back: 'Volver',
    loading: 'Cargando…',
    somethingWentWrong: 'Algo salió mal.',
  },
} as const;
```

---

## 4. CDK WebHosting construct design

### 4.1 `packages/infra-cdk/src/constructs/WebHosting.ts`

```ts
import { Construct } from 'constructs';
import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import {
  Bucket,
  BucketAccessControl,
  BucketEncryption,
  BlockPublicAccess,
  ObjectOwnership,
} from 'aws-cdk-lib/aws-s3';
import {
  Distribution,
  PriceClass,
  ViewerProtocolPolicy,
  AllowedMethods,
  CachePolicy,
  ResponseHeadersPolicy,
} from 'aws-cdk-lib/aws-cloudfront';
import { S3BucketOrigin } from 'aws-cdk-lib/aws-cloudfront-origins';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';

export interface WebHostingProps {
  /** Stage name. MVP: 'prod' only. */
  readonly stage: 'prod';
}

export class WebHosting extends Construct {
  public readonly bucket: Bucket;
  public readonly distribution: Distribution;

  constructor(scope: Construct, id: string, props: WebHostingProps) {
    super(scope, id);

    this.bucket = new Bucket(this, 'SiteBucket', {
      bucketName: `smart-wallet-${props.stage}-web`,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      encryption: BucketEncryption.S3_MANAGED,
      versioned: true,
      objectOwnership: ObjectOwnership.BUCKET_OWNER_ENFORCED,
      // MVP: bucket holds only static assets that can be re-uploaded; safe to DESTROY.
      // Versioned + retained access logs are not in MVP scope.
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const origin = S3BucketOrigin.withOriginAccessControl(this.bucket);

    this.distribution = new Distribution(this, 'SiteDistribution', {
      defaultRootObject: 'index.html',
      priceClass: PriceClass.PRICE_CLASS_100,
      defaultBehavior: {
        origin,
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        cachePolicy: CachePolicy.CACHING_OPTIMIZED,
        responseHeadersPolicy: ResponseHeadersPolicy.SECURITY_HEADERS,
        compress: true,
      },
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: Duration.seconds(0),
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: Duration.seconds(0),
        },
      ],
      comment: `smart-wallet ${props.stage} web`,
    });

    // SSM parameters consumed by deploy script and (manually) by UserPool callback config.
    new StringParameter(this, 'BucketNameParam', {
      parameterName: `/smart-wallet/${props.stage}/web/bucket-name`,
      stringValue: this.bucket.bucketName,
    });
    new StringParameter(this, 'DistributionIdParam', {
      parameterName: `/smart-wallet/${props.stage}/web/distribution-id`,
      stringValue: this.distribution.distributionId,
    });
    new StringParameter(this, 'DistributionDomainParam', {
      parameterName: `/smart-wallet/${props.stage}/web/distribution-domain`,
      stringValue: this.distribution.distributionDomainName,
    });
  }
}
```

**Key decisions**:

- **`removalPolicy: DESTROY` + `autoDeleteObjects: true`** for MVP. The bucket holds only built assets that are recreated by every deploy. Versioned not needed (deferred). This matches proposal §4.11 — overriding the earlier draft of `RETAIN` because for personal MVP we want tearable infra. Decision recorded with rationale.
- **`S3BucketOrigin.withOriginAccessControl`** (modern OAC). CDK auto-generates the bucket policy granting CloudFront access via the OAC SigV4 signature.
- **`SECURITY_HEADERS` managed policy** adds X-Content-Type-Options, Strict-Transport-Security, Referrer-Policy, X-Frame-Options. Free Lighthouse boost.
- **No CSP** in MVP — adding it correctly with Cognito + API Gateway is risky and out of scope.
- **`compress: true`** — gzip/br compression for assets at the edge.

### 4.2 Stack integration

```ts
// packages/infra-cdk/src/stacks/SmartWalletStack.ts (delta)
import { WebHosting } from '../constructs/WebHosting';

export class SmartWalletStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);

    const singleTable = new SingleTable(this, 'SingleTable', { ... });
    const userPool = new UserPool(this, 'UserPool', { ... });
    const webHosting = new WebHosting(this, 'WebHosting', { stage: 'prod' });
    new SsmParameters(this, 'SsmParameters', { singleTable, userPool, webHosting });

    new CfnOutput(this, 'WebDistributionDomain', {
      value: webHosting.distribution.distributionDomainName,
      description: 'CloudFront domain — copy into UserPool callbackUrls and redeploy.',
    });
  }
}
```

`SsmParameters` already publishes the existing 8 params; the `WebHosting` construct publishes its own 3 directly (no need to thread them through `SsmParameters` — keeps that construct domain-focused).

### 4.3 UserPool callback URLs update strategy (proposal §4.13, Q3)

**Locked: manual two-step deploy** (proposal Option A). Implementation detail:

**Step 1** — first deploy creates CloudFront and publishes domain to SSM. `UserPool` construct callbackUrls only contains `http://localhost:5173/` (dev) at this point.

**Step 2** — operator captures domain:

```bash
aws ssm get-parameter --name /smart-wallet/prod/web/distribution-domain \
  --query 'Parameter.Value' --output text
# e.g. d1abcdef1234.cloudfront.net
```

**Step 3** — operator edits `packages/infra-cdk/src/constructs/UserPool.ts` to add the literal domain:

```ts
const client = userPool.addClient('Client', {
  // ...
  oAuth: {
    callbackUrls: [
      'http://localhost:5173/',
      'https://d1abcdef1234.cloudfront.net/', // NEW
    ],
    logoutUrls: [
      'http://localhost:5173/',
      'https://d1abcdef1234.cloudfront.net/', // NEW
    ],
    // ...
  },
});
```

**Step 4** — `cdk deploy` second time. Only the user pool client diff applies.

**Rejected alternative considered**: CDK context (`cdk deploy --context webDomain=...`). Trade-off: less manual but the URL becomes invisible in the source tree — the literal in source is documentation. We pick the literal-in-source approach with a `DEPLOY.md` checklist. Future custom-domain change replaces the literal with a single edit.

**Note**: MVP uses `USER_PASSWORD_AUTH` directly (NOT the hosted UI OAuth flow), so `callbackUrls` are unused by the auth path in practice. They're set for forward compatibility (hosted UI + Google federation are future additive changes). Including them now avoids a future blocker. If `cdk synth` complains that `callbackUrls` is empty without `oAuth.flows`, the construct sets `oAuth.flows.authorizationCodeGrant: true` + `oAuth.scopes: [OAuthScope.OPENID, EMAIL, PROFILE]` to satisfy validation.

### 4.4 Deploy script (`packages/web/scripts/deploy.mjs`)

```js
#!/usr/bin/env node
// @ts-check
import { execSync } from 'node:child_process';

const STAGE = 'prod';

function ssm(name) {
  return execSync(
    `aws ssm get-parameter --name /smart-wallet/${STAGE}/web/${name} --query 'Parameter.Value' --output text`,
  )
    .toString()
    .trim();
}

console.log('[deploy] reading SSM parameters…');
const bucket = ssm('bucket-name');
const distId = ssm('distribution-id');

console.log(
  '\n[deploy] REMINDER: did you run Lighthouse on http://localhost:4173 before deploying?\n',
);

console.log(`[deploy] syncing dist/ → s3://${bucket}/ (assets immutable, index.html no-cache)…`);
execSync(
  `aws s3 sync dist/ s3://${bucket}/ --delete --exclude index.html ` +
    `--cache-control "public, max-age=31536000, immutable"`,
  { stdio: 'inherit' },
);
execSync(
  `aws s3 cp dist/index.html s3://${bucket}/index.html ` +
    `--cache-control "no-cache, no-store, must-revalidate" --content-type "text/html; charset=utf-8"`,
  { stdio: 'inherit' },
);

console.log(`[deploy] invalidating /index.html on distribution ${distId}…`);
execSync(`aws cloudfront create-invalidation --distribution-id ${distId} --paths "/index.html"`, {
  stdio: 'inherit',
});

console.log('[deploy] done.');
```

Two-step S3 upload because:

- Hashed assets (`assets/*.js`, `assets/*.css`) get 1-year immutable cache.
- `index.html` is the only un-hashed entry; must be revalidated on every visit.

---

## 5. Implementation order (slices for sdd-tasks)

Total: 13 slices across 4 chained PRs, ~3,200-3,500 LOC across TS/TSX/CSS/YAML/MD.

### PR1 — `feat(web): bootstrap + auth shell` (~900 LOC)

- **Slice 0 — Install deps.** `pnpm --filter @smart-wallet/web add react react-dom react-router-dom @tanstack/react-query @hookform/resolvers react-hook-form amazon-cognito-identity-js lucide-react sonner clsx tailwind-merge class-variance-authority date-fns react-day-picker tailwindcss-animate @radix-ui/react-slot @radix-ui/react-label @radix-ui/react-dialog @radix-ui/react-popover @radix-ui/react-select @radix-ui/react-separator @radix-ui/react-avatar @radix-ui/react-tabs`. `pnpm --filter @smart-wallet/web add -D vite @vitejs/plugin-react @types/react @types/react-dom tailwindcss postcss autoprefixer`. Add `zod` from catalog. Commit lockfile.
- **Slice 1 — Vite + Tailwind + shadcn init + base components.** Create `vite.config.ts`, `tailwind.config.ts`, `postcss.config.cjs`, `components.json`, `index.html`, `src/main.tsx`, `src/styles/globals.css` (with CSS vars + safe-area utilities), `src/vite-env.d.ts`. Run `npx shadcn@latest init` accepting New York preset + neutral. Run `npx shadcn@latest add button input label form card select separator sonner skeleton dialog sheet badge tabs avatar calendar popover table`. Verify `pnpm --filter @smart-wallet/web typecheck` green.
- **Slice 2 — `app/` scaffolding.** Create `app/App.tsx`, `app/Providers.tsx` (with `ApiClientBridge`), `app/AppRouter.tsx` (skeleton with only `/login` returning placeholder), `app/ErrorBoundary.tsx`, `app/routes.ts` (RoutePaths constants). Create `lib/queryClient.ts`, `lib/env.ts`, `lib/utils.ts` (already from shadcn init), `lib/i18n.ts`, `lib/currency.ts`, `lib/idempotency.ts`, `lib/api/client.ts`, `lib/api/errors.ts`, `lib/cognito/pool.ts`. Create `components/common/{NotFoundPage,GenericErrorScreen,ErrorState,EmptyState,PageHeader}.tsx`. Commit `.env.example` + `.env.production`.
- **Slice 3 — AuthProvider + useAuth.** Create `features/auth/AuthProvider.tsx`, `features/auth/useAuth.ts`, `features/auth/cognitoClient.ts` (helper wrappers), `features/auth/sessionStorage.ts`, `features/auth/types.ts`. Wire `ApiClientBridge` in `Providers.tsx`. Manually validate hydration via DevTools (set sessionStorage by hand, refresh, observe state).
- **Slice 4 — Auth pages + layouts.** Create `components/layout/{ProtectedRoute,PublicLayout,AppLayout,BottomTabBar,Sidebar,Fab}.tsx`. Create all 5 auth pages with forms (RHF + Zod with inline schemas — no shared-types schemas exist for auth payloads, only for backend DTOs). Each form uses shadcn `<Form>`. Update `AppRouter.tsx` with the full route map. Test the flow end-to-end against the **deployed prod Cognito** (signup → confirm → login → land on `/wallets` placeholder). Sign-out works (clears state + navigates to `/login`).

**PR1 acceptance**: `pnpm typecheck` + `pnpm lint` green; user can sign up, confirm email, log in, and reach the empty `/wallets` placeholder; refresh on `/wallets` doesn't kick to `/login`; sign-out works.

### PR2 — `feat(web): wallets feature` (~700 LOC)

- **Slice 5 — Wallets API + queries.** Create `features/wallets/walletsApi.ts`, `features/wallets/queries.ts` (with `walletKeys` factory).
- **Slice 6 — Wallets pages + components.** `WalletsListPage` (with skeleton + empty state), `WalletDetailPage` (header + recent txns slot, txns wired in PR3), `CreateWalletPage` (form: name + CurrencySelect). Components: `WalletCard`, `WalletBalanceHeader`, `WalletForm`, `WalletsListSkeleton`, `EmptyWalletsState`. Wire `formatCurrency` into `WalletCard`.
- **Slice 7 — Responsive nav wired.** `BottomTabBar` and `Sidebar` populated with the 4 nav targets (Wallets / Add Transaction FAB / Categories / Settings). Active state from `useLocation`. Smoke-test on Chrome DevTools mobile emulation.

**PR2 acceptance**: user can list wallets, see balance, navigate to detail, create a new wallet (USD or PEN); empty state renders when zero wallets; skeletons render during fetch; error state on network failure has Retry.

### PR3 — `feat(web): transactions + categories` (~1,000 LOC)

- **Slice 8 — Transactions API + queries.** `features/transactions/transactionsApi.ts`, `features/transactions/queries.ts` (with `useInfiniteQuery` and `transactionKeys`).
- **Slice 9 — Transactions pages + forms.** `TransactionListPage` (filtered list with `TransactionFilters`: type + date range, "Load more" button), `AddTransactionPage` (form with `WalletSelect`, `CategorySelect`, `MoneyInput`, `DatePickerField`, type toggle, note input). `idempotencyKey` generated once via `useMemo` on mount. `RecentTransactionsList` component on `WalletDetailPage`. Manual smoke test: double-click submit → only one transaction appears.
- **Slice 10 — Categories API + queries + pages.** `features/categories/categoriesApi.ts`, `features/categories/queries.ts`. `CategoriesPage` lists merged predefined + custom (badge marks predefined as immutable). `CreateCategoryDialog` (name + type). `DeleteCategoryConfirm` (only enabled for custom; predefined items show disabled trash with tooltip). Verify deletion soft-deletes (backend returns 204; UI removes from list via invalidation).

**PR3 acceptance**: full add-transaction flow works end-to-end against prod backend; pagination works (load 50, then "Load more" → 50 more); duplicate submit produces one transaction; categories can be created and used in transactions; custom categories can be deleted.

### PR4 — `feat(infra): web hosting + cognito callbacks + deploy` (~600 LOC, mostly TS infra + scripts + docs)

- **Slice 11 — CDK WebHosting construct + stack integration.** Create `packages/infra-cdk/src/constructs/WebHosting.ts`. Wire into `SmartWalletStack`. Add `WebDistributionDomain` `CfnOutput`. `pnpm --filter @smart-wallet/infra-cdk synth` clean. Document the two-step deploy in `DEPLOY.md` (allowed: project doc, not SDD artifact).
- **Slice 12 — Deploy step 1 + capture domain.** `pnpm --filter @smart-wallet/infra-cdk deploy`. Read distribution-domain from SSM. Verify `https://{domain}` returns the placeholder app (build + sync first, then test). Build script: `pnpm --filter @smart-wallet/web build`. Run `node scripts/deploy.mjs` to sync + invalidate. Open the URL — should land on `/login` (no Cognito callback registered yet, so login WILL fail with `Invalid callback URL` — expected; that's Slice 13's job).
- **Slice 13 — Update Cognito callbackUrls + verify.** Edit `UserPool.ts` to add the literal CloudFront URL. `pnpm --filter @smart-wallet/infra-cdk deploy` again. Run Lighthouse mobile against the deployed URL (must be ≥ 90 Performance). Test the full happy path on a real phone: signup → confirm → login → create wallet → add transaction → see balance.

**PR4 acceptance**: site is live at CloudFront URL; Cognito callbacks accept the CloudFront origin; Lighthouse mobile Performance ≥ 90 (report attached to PR); deploy script idempotent; SSM has 3 new params.

---

## 6. Risks reviewed and mitigations sharpened

For each risk in proposal §8, the design's concrete mitigation:

1. **Cognito callback two-step deploy (§4.3)** — `DEPLOY.md` checklist with the literal `aws ssm get-parameter` command and a TODO line in the PR4 description that ensures the operator runs the second `cdk deploy`. The `WebHosting` construct also adds a `CfnOutput` so the domain appears at the bottom of the first `cdk deploy` output.
2. **Bundle size with `amazon-cognito-identity-js`** — Slice 1 measures `pnpm --filter @smart-wallet/web build` output size and logs the report. If `dist/assets/*.js` gzipped exceeds 300 KB, defer auth pages with `React.lazy` in `AppRouter.tsx` (one-line change per page import). Vite's `rollupOptions` already produces hashed chunks so code-splitting is automatic.
3. **`verbatimModuleSyntax` + React/shadcn** — `moduleResolution: "Bundler"` (not NodeNext) and `allowSyntheticDefaultImports: true` are already set; shadcn components use default exports for type+value imports correctly. Spike: install ONE shadcn component first (`button`), `pnpm typecheck`, only then install the other 15.
4. **CloudFront 403/404 mapping** — `errorResponses` set BOTH 403 AND 404 (both required: S3 returns 403 for missing keys when BPA is on, but some edge cases produce 404). PR4 smoke test: deploy, then `curl -i https://{domain}/wallets/foo` → MUST return `HTTP/2 200` + index.html body.
5. **Token refresh race conditions** — single in-flight `refreshInFlightRef` in `AuthProvider`; multiple concurrent 401s share the same Promise. Tested manually by triggering two queries simultaneously with expired token in DevTools.
6. **FAB z-index overlap** — explicit z-index discipline in `AppLayout` (Sidebar `z-20`, BottomTabBar `z-30`, FAB `z-40`, modal `z-50`). Documented in a code comment at the top of `AppLayout.tsx`.
7. **Session storage size** — tokens are ~1-2 KB each, total ~5 KB. No risk.
8. **CORS regression** — out of scope here, but the deploy script's first line could `curl -sI -X OPTIONS ...` against the API and warn on a missing `Access-Control-Allow-Origin` header. Deferred to future hardening; documented in `DEPLOY.md`.

---

## 7. Non-obvious decisions

- **Vite path alias `@/`** (TS-friendly; matches shadcn default; works in `tsconfig.json` `paths`).
- **`moduleResolution: "Bundler"`** in `packages/web/tsconfig.json` — explicit `.js` extensions NOT required in source. This DIFFERS from `packages/api` (NodeNext, extensions required). Cross-package imports still work because both packages emit `.d.ts` with declarations.
- **Single CSS file** (`globals.css`) with Tailwind directives — no CSS-in-JS, no CSS modules.
- **`"type": "module"`** in `packages/web/package.json` (consistent with monorepo).
- **`jsx: "preserve"`** — Vite handles transform.
- **shadcn New York preset, neutral base color** — matches the lock-in for visual consistency.
- **All toast notifications use Sonner defaults** (richColors enabled, top-center position). No custom theming.
- **`min-h-dvh`** (not `min-h-screen`) — dynamic viewport units; correct iOS Safari behaviour with the address bar.
- **`crypto.randomUUID()`** browser-native (Chrome 92+, Safari 15.4+, all supported per proposal §7). No `uuid` library needed.
- **AuthProvider lives inside QueryClientProvider AND inside BrowserRouter** — required for `useQueryClient` and `useNavigate` inside `signOut`. Order in `App.tsx`: BrowserRouter → Providers (which wraps QueryClientProvider → AuthProvider).
- **`ApiClientBridge`** — small bridge component re-configures `apiClient` whenever `idToken` changes. Avoids passing the API client through context.
- **Idempotency key per form mount** (`useMemo(generateIdempotencyKey, [])`) — guarantees double-click replays return the same transaction.
- **`refetchOnWindowFocus: false`** — prevents surprise refetches when switching tabs; explicit refresh via pull-to-refresh on mobile is a future concern.
- **No URL-state for filters in MVP** — `TransactionFilters` state lives in component local state. URL-syncing is a future enhancement.
- **Spanish strings**: per project context and proposal — Argentina/LatAm Spanish (`vos` form). One const tree in `lib/i18n.ts`; no library.
- **`<DEPLOY.md>` allowed**: per `~/.claude/CLAUDE.md`, we don't write SDD-summary `.md` files, but per-project deploy docs are project docs, not SDD artifacts — and proposal §4.13 explicitly requires this doc.

---

## 8. Open questions

**None.** All 10 questions from the proposal are resolved and locked. The design fills in the file/path/type details consistently with those locks. If anything in Section 5 (slicing) needs adjustment for size or sequencing, `sdd-tasks` is the right place to revise — but the technical contract is complete.

---

## 9. Spanish UI strings inventory

See §3.15 — `lib/i18n.ts` is the single source. Every `<Button>`, `<Label>`, `<FormMessage>`, `<EmptyState>`, and `<Toaster>` call site imports from `t.*`. No string literals in JSX outside of `lib/i18n.ts` (enforced by review).

Future i18n change can swap the const tree for a lookup function (`t('auth.loginTitle')`) without touching call sites if we wrap with a thin function from the start. Decision: keep it as a literal tree for MVP — refactor to a function only when a second language is added.
