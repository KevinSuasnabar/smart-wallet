# Design: settings

> SDD phase: design
> Project: smart-wallet
> Change: settings
> Date: 2026-05-15
> Engram topic_key: `sdd/settings/design`

---

## 1. Component tree

```
SettingsPage (features/settings/pages/SettingsPage.tsx)
  ├── PageHeader (components/common/PageHeader.tsx)            // "Ajustes"
  ├── ProfileSection
  │     └── reads useAuth().user                               // email + sub
  ├── ChangePasswordSection
  │     ├── react-hook-form + Zod
  │     └── calls useAuth().changePassword()
  └── PreferredCurrencySection
        ├── usePreferredCurrency()                              // localStorage hook
        └── CurrencySelect (existing — re-used from wallets feature)
```

Each `*Section` is a sibling. Composition lives only in `SettingsPage`. The sections do not import each other.

---

## 2. New files

### 2.1 `packages/web/src/features/settings/pages/SettingsPage.tsx`

```tsx
import { PageHeader } from '../../../components/common/PageHeader.js';
import { ProfileSection } from '../components/ProfileSection.js';
import { ChangePasswordSection } from '../components/ChangePasswordSection.js';
import { PreferredCurrencySection } from '../components/PreferredCurrencySection.js';
import { t } from '../../../lib/i18n.js';

export const SettingsPage = () => (
  <div className="flex flex-col gap-6 py-4 pb-4">
    <PageHeader eyebrow={t.settings.eyebrow} title={t.settings.title} />
    <ProfileSection />
    <ChangePasswordSection />
    <PreferredCurrencySection />
  </div>
);
```

### 2.2 `packages/web/src/features/settings/components/ProfileSection.tsx`

```tsx
import { useAuth } from '../../auth/useAuth.js';
import { Card } from '../../../components/ui/card.js';
import { Eyebrow } from '../../../components/common/Eyebrow.js';
import { t } from '../../../lib/i18n.js';

export const ProfileSection = () => {
  const { user } = useAuth();
  if (!user) return null; // route guard normally prevents this

  return (
    <Card className="flex flex-col gap-3 p-6">
      <Eyebrow>{t.settings.profile.eyebrow}</Eyebrow>
      <h2 className="text-2xl font-bold leading-none tracking-display">
        {t.settings.profile.title}
      </h2>
      <div className="flex flex-col gap-1">
        <span className="font-mono text-[11px] uppercase tracking-eyebrow text-muted-foreground">
          {t.settings.profile.emailLabel}
        </span>
        <span className="text-base font-medium tabular-nums">{user.email}</span>
      </div>
    </Card>
  );
};
```

### 2.3 `packages/web/src/features/settings/schemas.ts`

```ts
import { z } from 'zod';

/**
 * Cognito enforces the password policy server-side; the client schema mirrors
 * the minimum requirements so we don't waste a round trip on obviously bad
 * input. Server-side rejection (e.g., missing uppercase) is surfaced via
 * mapCognitoError → InvalidPasswordException.
 */
export const ChangePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'La contraseña actual es requerida'),
    newPassword: z.string().min(10, 'La nueva contraseña debe tener al menos 10 caracteres'),
    confirmNewPassword: z.string().min(1, 'Confirmá la nueva contraseña'),
  })
  .refine((data) => data.newPassword === data.confirmNewPassword, {
    path: ['confirmNewPassword'],
    message: 'Las contraseñas no coinciden',
  })
  .refine((data) => data.newPassword !== data.currentPassword, {
    path: ['newPassword'],
    message: 'La nueva contraseña debe ser distinta a la actual',
  });

export type ChangePasswordFormValues = z.infer<typeof ChangePasswordSchema>;
```

### 2.4 `packages/web/src/features/settings/components/ChangePasswordSection.tsx`

Standard `react-hook-form` + Zod resolver layout, same primitives used elsewhere (`Form` / `FormField` / `FormItem` / `FormLabel` / `FormControl` / `FormMessage` / `Input` / `Button`).

Submit handler:

```tsx
const { changePassword } = useAuth();

const onSubmit = async (values: ChangePasswordFormValues) => {
  try {
    await changePassword({
      currentPassword: values.currentPassword,
      newPassword: values.newPassword,
    });
    toast.success(t.settings.changePassword.successToast);
    form.reset();
  } catch (err) {
    const authErr = mapCognitoError(err, {
      NotAuthorizedException: t.settings.changePassword.errors.wrongCurrent,
      InvalidPasswordException: t.settings.changePassword.errors.weakNew,
      LimitExceededException: t.settings.changePassword.errors.rateLimit,
    });
    toast.error(authErr.message);
  }
};
```

Section header pattern is identical to `ProfileSection` (Card → Eyebrow → h2 → form).

### 2.5 `packages/web/src/features/settings/usePreferredCurrency.ts`

```ts
import { useEffect, useState } from 'react';
import { useAuth } from '../auth/useAuth.js';
import type { Currency } from '@smart-wallet/shared-types';

const VALID: readonly Currency[] = ['USD', 'PEN'] as const;

const keyFor = (sub: string) => `smart-wallet:preferred-currency:${sub}`;

const isCurrency = (v: unknown): v is Currency =>
  typeof v === 'string' && (VALID as readonly string[]).includes(v);

const readFromStorage = (sub: string): Currency | null => {
  try {
    const raw = localStorage.getItem(keyFor(sub));
    return isCurrency(raw) ? raw : null;
  } catch {
    return null;
  }
};

const writeToStorage = (sub: string, currency: Currency): void => {
  try {
    localStorage.setItem(keyFor(sub), currency);
  } catch {
    // Safari private mode, embedded webviews — degrade silently
  }
};

export const usePreferredCurrency = () => {
  const { user } = useAuth();
  const sub = user?.sub ?? '';

  // Lazy initial read; re-syncs when sub changes (different user signs in).
  const [currency, setCurrencyState] = useState<Currency | null>(() =>
    sub ? readFromStorage(sub) : null,
  );

  useEffect(() => {
    setCurrencyState(sub ? readFromStorage(sub) : null);
  }, [sub]);

  const setCurrency = (next: Currency): void => {
    if (!sub) return;
    writeToStorage(sub, next);
    setCurrencyState(next);
  };

  return { currency, setCurrency };
};
```

Rationale:

- **Lazy `useState` init** avoids reading localStorage on every render.
- **`useEffect` on `sub`** handles the rare case where the same `AuthProvider` instance transitions between users (logout + login without unmount). Tests this by running `SCN-SET-CUR-NO-LEAK-ACROSS-USERS`.
- **`isCurrency` runtime check** guards against stale or hand-edited storage values from older builds.

### 2.6 `packages/web/src/features/settings/components/PreferredCurrencySection.tsx`

```tsx
import { Card } from '../../../components/ui/card.js';
import { Eyebrow } from '../../../components/common/Eyebrow.js';
import { Label } from '../../../components/ui/label.js';
import { CurrencySelect } from '../../wallets/components/CurrencySelect.js';
import { usePreferredCurrency } from '../usePreferredCurrency.js';
import { t } from '../../../lib/i18n.js';

export const PreferredCurrencySection = () => {
  const { currency, setCurrency } = usePreferredCurrency();

  return (
    <Card className="flex flex-col gap-3 p-6">
      <Eyebrow>{t.settings.preferredCurrency.eyebrow}</Eyebrow>
      <h2 className="text-2xl font-bold leading-none tracking-display">
        {t.settings.preferredCurrency.title}
      </h2>
      <p className="text-sm text-muted-foreground">{t.settings.preferredCurrency.helper}</p>
      <div className="space-y-2">
        <Label htmlFor="preferred-currency-select">{t.settings.preferredCurrency.label}</Label>
        <CurrencySelect
          id="preferred-currency-select"
          value={currency ?? ''}
          onChange={(c) => setCurrency(c)}
          placeholder={t.settings.preferredCurrency.placeholder}
        />
      </div>
    </Card>
  );
};
```

`CurrencySelect` is a shared component used by `CreateWalletPage`. It accepts a `value`/`onChange` pair. The minor extensions needed are documented in §3.

---

## 3. File patches

### 3.1 `packages/web/src/features/auth/types.ts` — extend `mapCognitoError` and `AuthContextValue`

**Why a signature change vs. new branches**: the `switch` already contains `NotAuthorizedException`, `InvalidPasswordException`, and `LimitExceededException`. Today it just passes through `err.message` (English text from Cognito). The Settings spec mandates Spanish overrides, but adding context as a positional arg would force every existing caller to update. Better: append-only optional second arg.

```ts
export interface AuthContextValue extends AuthState {
  signIn: (input: { email: string; password: string }) => Promise<void>;
  forgotPassword: (email: string) => Promise<void>;
  confirmForgotPassword: (input: {
    email: string;
    code: string;
    newPassword: string;
  }) => Promise<void>;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<string>;
  // NEW
  changePassword: (input: { currentPassword: string; newPassword: string }) => Promise<void>;
}

/**
 * Per-call message overrides keyed by Cognito error code. Append-only —
 * existing callers (signIn, forgotPassword, confirmForgotPassword) pass no
 * overrides and observe identical behavior.
 */
export type CognitoErrorOverrides = Partial<Record<string, string>>;

export const mapCognitoError = (err: unknown, overrides?: CognitoErrorOverrides): AuthError => {
  const e = err as { code?: string; message?: string; name?: string };
  const code = e.code ?? e.name ?? 'unknown';
  const message = overrides?.[code] ?? e.message ?? 'Error desconocido';

  // ... existing switch stays as-is; only the message resolution changed above
};
```

Existing callers (`LoginPage`, `ForgotPasswordPage`, `ConfirmForgotPasswordPage`) call `mapCognitoError(err)` — no change required. `ChangePasswordSection` is the only caller that passes overrides.

### 3.2 `packages/web/src/features/auth/AuthProvider.tsx` — add `changePassword`

Insert after `confirmForgotPassword` (consistency: same node-callback-to-Promise pattern). Use `cognitoUserRef.current` — fail explicitly if `null`.

```ts
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
```

Then add `changePassword` to the `value` memo's dependency list and exported shape. No sessionStorage write, no `setState`, no token refresh — Cognito leaves the current session valid.

### 3.3 `packages/web/src/app/AppRouter.tsx` — replace stub with real import

Remove the inline `SettingsPage` const at lines 18-22. Add `import { SettingsPage } from '../features/settings/pages/SettingsPage.js';` to the imports block. The route declaration at `routes.settings` stays unchanged.

### 3.4 `packages/web/src/features/wallets/components/CurrencySelect.tsx` — accept `id` and `placeholder`

Currently the component renders a fixed placeholder ("Elegí una moneda" or similar). Add two optional props mirroring the pattern used in `WalletSelect` after the fix:

```ts
interface CurrencySelectProps {
  value: Currency | '';
  onChange: (currency: Currency) => void;
  disabled?: boolean;
  id?: string; // NEW — for accessible Label htmlFor
  placeholder?: string; // NEW — overrides the default
}
```

Spread `id` onto `SelectTrigger` and use `placeholder` in `SelectValue` when present, fallback to the existing default otherwise. Existing callers (`CreateWalletPage`) keep working without changes.

If `value` is `''`, the `Select` treats it as "no value selected" (Radix accepts empty string as unselected).

### 3.5 `packages/web/src/features/wallets/pages/CreateWalletPage.tsx` — consume preferred currency

Add the hook import and use the returned currency as the form `defaultValues`. The shape of `defaultValues` already requires a currency, so the fallback is `undefined` (form stays unselected) or `'USD'` if we want to preserve the old behavior. The spec says: keep existing behavior when `currency` is `null` (USD default).

```ts
import { usePreferredCurrency } from '../../settings/usePreferredCurrency.js';

// inside component:
const { currency: preferred } = usePreferredCurrency();

const form = useForm<CreateWalletDTO>({
  resolver: zodResolver(CreateWalletRequestSchema),
  defaultValues: {
    name: '',
    currency: preferred ?? 'USD',
  },
});
```

Note the existing `defaultValues` block omits `currency` entirely. Adding it as `preferred ?? 'USD'` aligns with REQ-SET-CUR-06 and removes a subtle inconsistency where the form previously rendered with no currency selected by default. Tests this via SCN-SET-CUR-CONSUMED-BY-CREATE-WALLET.

### 3.6 `packages/web/src/lib/i18n.ts` — add settings strings

Add a `settings` namespace:

```ts
settings: {
  eyebrow: 'Cuenta',
  title: 'Ajustes',
  profile: {
    eyebrow: 'Perfil',
    title: 'Tu cuenta',
    emailLabel: 'Email',
  },
  changePassword: {
    eyebrow: 'Seguridad',
    title: 'Cambiar contraseña',
    currentPasswordLabel: 'Contraseña actual',
    newPasswordLabel: 'Nueva contraseña',
    confirmNewPasswordLabel: 'Confirmar nueva contraseña',
    submit: 'Actualizar contraseña',
    successToast: 'Contraseña actualizada',
    errors: {
      wrongCurrent: 'La contraseña actual no es correcta',
      weakNew: 'La nueva contraseña no cumple los requisitos',
      rateLimit: 'Demasiados intentos. Probá de nuevo en unos minutos',
    },
  },
  preferredCurrency: {
    eyebrow: 'Preferencias',
    title: 'Moneda preferida',
    helper: 'Se preseleccionará al crear una billetera nueva.',
    label: 'Moneda',
    placeholder: 'Elegí tu moneda preferida',
  },
},
```

---

## 4. Cross-cutting decisions

### 4.1 No TanStack Query for changePassword

`changePassword` is fire-and-forget. There is no cached server state to invalidate (Cognito user metadata isn't read anywhere), no list to refetch. Wrapping it in `useMutation` would buy nothing — the form's local `isSubmitting` already conveys pending state. Keeps bundle/test surface smaller.

### 4.2 `usePreferredCurrency` is intentionally NOT in TanStack Query

It's pure local state (localStorage). TanStack Query is reserved for server state. Mixing them would mislead future maintainers into thinking the value syncs across tabs or windows. It doesn't.

### 4.3 Why `Card` instead of `ColorBlock`

`ColorBlock` is reserved for marketing-style highlight surfaces (bento tiles, heroes). Settings is functional, not promotional. Using `Card` (white, hairline border, no fill) keeps focus on the form content.

### 4.4 Section title hierarchy

Page title uses `text-3xl md:text-4xl` (the `PageHeader` default). Each section title uses `text-2xl` so the hierarchy is page → section. No section uses `h1`. Accessibility tree: one `h1` (PageHeader), three `h2`s (sections).

### 4.5 Storage key versioning

Key prefix `smart-wallet:preferred-currency:` is committed to. If the storage shape ever needs to change (e.g., become a JSON object with multiple prefs), the new key would be `smart-wallet:preferences:v2:${sub}` — distinct prefix, no migration needed for v1.

### 4.6 No password-strength meter

Cognito policy: ≥ 10 chars, uppercase, lowercase, digit. A live meter would duplicate that logic in the client and risk drift. Strategy: enforce length ≥ 10 in Zod (cheapest filter, blocks obvious mistakes) and surface the rest via Cognito's `InvalidPasswordException`. Spec REQ-SET-PWD-02 + REQ-SET-PWD-07 cover this.

### 4.7 Form does not auto-focus

The form does NOT call `.focus()` on mount. Users land on Settings deliberately (it's a multi-section page); the cursor should not jump to the password field unbidden. After a successful submit, however, we DO call `inputRef.current?.focus()` on the `currentPassword` field so a follow-up change is one keystroke away (REQ-SET-PWD-05 talks about resetting; we reset AND park focus).

---

## 5. Test surface (informational — strict TDD is OFF for this repo)

If/when tests are added for this change, the boundaries are:

- **`usePreferredCurrency`** (unit) — read/write round-trip; isolation across `sub`s; degradation when `localStorage.setItem` throws.
- **`mapCognitoError` with overrides** (unit) — overrides take precedence over `err.message`; unknown code without override falls back; existing call sites (no overrides) keep current behavior.
- **`ChangePasswordSection`** (integration, mock AuthProvider) — submit success path; each error branch surfaces the right toast; form does not reset on error.
- **`SettingsPage` route** (smoke) — route renders the three sections in order.

This change does NOT add tests in the apply phase. Adding tests is a follow-on change that does not need to block ship.

---

## 6. Risks and mitigations

| Risk                                                                                                                                | Mitigation                                                                                                                                                                                 |
| ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `mapCognitoError` signature change breaks existing callers at runtime if the type narrows.                                          | The new arg is **optional**. Existing call sites compile and behave identically. `tsc --noEmit` validates.                                                                                 |
| `CurrencySelect` is shared with `CreateWalletPage`; adding props could break existing usage.                                        | New props are **optional**. The existing call site (no `id`, no `placeholder`) renders identically.                                                                                        |
| `useEffect` re-read on `sub` change could cause a flash if the user signs out then back in within the same `AuthProvider` lifetime. | Acceptable. Sign-out clears `user`, which clears the `Select` to placeholder; sign-in re-hydrates. No flash because Settings is unmounted during the logged-out state (route is guarded).  |
| Cognito password policy changes server-side (e.g., minimum becomes 12).                                                             | The Zod check is a cheap filter, not the authority. Cognito will still reject and we surface the message via `InvalidPasswordException`. Update the Zod min later as needed; not blocking. |
| `localStorage` quota exceeded on writes.                                                                                            | Same `try/catch` as availability. User sees no error; preference doesn't persist. Acceptable degradation.                                                                                  |
