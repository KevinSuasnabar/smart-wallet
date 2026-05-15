# Spec: settings

> SDD phase: spec
> Project: smart-wallet
> Change: settings
> Date: 2026-05-15
> Engram topic_key: `sdd/settings/spec`

---

## 1. Glossary

| Term | Definition |
|------|------------|
| **SettingsPage** | The page rendered at `/settings`. Composes three sibling sections — Profile, ChangePassword, PreferredCurrency — as a single vertical column. |
| **Profile section** | A read-only block that displays the signed-in user's Cognito email. Sourced from `useAuth().user.email` (already populated from JWT claims). |
| **ChangePassword section** | A form with three fields (`currentPassword`, `newPassword`, `confirmNewPassword`) that submits to Cognito's `changePassword` API via the AuthProvider. Never touches the smart-wallet backend. |
| **PreferredCurrency section** | A `Select` with two options — `USD` and `PEN` — that persists the choice to `localStorage` under a per-user key. Read by `CreateWalletPage` to pre-select the wallet's currency dropdown. |
| **Preferred currency** | A `Currency` value (`'USD' \| 'PEN'`) stored in `localStorage` per Cognito user (keyed by `sub`). May be absent (user has never chosen one) — absence is a legal state, not an error. |
| **Per-user localStorage key** | The string `smart-wallet:preferred-currency:${cognitoSub}`. The `cognitoSub` is the Cognito UUID, stable per user, exposed on `useAuth().user.sub`. |
| **`changePassword` (Cognito)** | A method on `CognitoUser` from `amazon-cognito-identity-js`. Takes `(oldPassword, newPassword, callback)` and invokes the callback with `(err, result)`. Requires the user to be already authenticated; uses the current access token implicitly. |
| **`mapCognitoError`** | A pure function in `features/auth/types.ts` that converts a Cognito error into a typed `AuthError` with a Spanish-localized `message`. Extended in this change to handle three additional Cognito error codes. |

---

## 2. Requirements

### Profile (SET-PROF)

- **REQ-SET-PROF-01**: The Profile section displays the signed-in user's email, read from `useAuth().user.email`. The value is rendered as static text (no input control).
- **REQ-SET-PROF-02**: The email is rendered with the same monospaced contextual eyebrow + bold value pattern used elsewhere in the design system: a short "Cuenta" / "Email" label above the value.
- **REQ-SET-PROF-03**: No control exists in this section to edit, copy, or reset the email. Email change is explicitly out of scope.
- **REQ-SET-PROF-04**: If `user` is `null` (the route guard normally prevents this), the section renders nothing and does not throw. This guards against a brief render before `ProtectedRoute` redirects.

### Change Password (SET-PWD)

- **REQ-SET-PWD-01**: The ChangePassword section is a `react-hook-form` form with three required fields: `currentPassword`, `newPassword`, `confirmNewPassword`. All three are rendered as `Input type="password"` with `autoComplete="current-password"` (first) and `autoComplete="new-password"` (last two).
- **REQ-SET-PWD-02**: Client-side Zod validation enforces: each field is non-empty, `newPassword.length >= 10`, `newPassword !== currentPassword`, `confirmNewPassword === newPassword`. Validation errors render inline beneath each field via `FormMessage`.
- **REQ-SET-PWD-03**: The submit button is disabled while the form is invalid, while a submission is in flight, or when no `currentPassword` is yet entered.
- **REQ-SET-PWD-04**: On submit, the form calls `useAuth().changePassword({ currentPassword, newPassword })`. The AuthProvider wraps `cognitoUserRef.current.changePassword(oldPassword, newPassword, cb)` and resolves on success, rejects on error.
- **REQ-SET-PWD-05**: On success: a Sonner toast displays "Contraseña actualizada", the form is reset to empty, and focus returns to the `currentPassword` input. The user's session is NOT signed out — the existing access token remains valid (Cognito's `changePassword` does not invalidate sessions).
- **REQ-SET-PWD-06**: On Cognito failure, `mapCognitoError` maps the error code to a Spanish message and a Sonner toast displays it. The form is NOT reset (so the user can correct one field and retry).
- **REQ-SET-PWD-07**: `mapCognitoError` is extended to handle three additional codes (append-only; existing branches must not change):
  - `NotAuthorizedException` → "La contraseña actual no es correcta"
  - `InvalidPasswordException` → "La nueva contraseña no cumple los requisitos"
  - `LimitExceededException` → "Demasiados intentos. Probá de nuevo en unos minutos"
- **REQ-SET-PWD-08**: If `cognitoUserRef.current` is `null` when `changePassword` is invoked (no active session), the call rejects with an `Error("No active session")`. The route guard prevents this in practice; the check is a safety net.

### Preferred Currency (SET-CUR)

- **REQ-SET-CUR-01**: The PreferredCurrency section displays a `Select` with two options: `USD` and `PEN`. The list of supported currencies must match `VALID_CURRENCIES` in `packages/domain/src/wallet/Wallet.ts`.
- **REQ-SET-CUR-02**: The initial value of the `Select` is read from `localStorage` via the key `smart-wallet:preferred-currency:${cognitoSub}` where `cognitoSub = useAuth().user.sub`. If the key is absent or malformed, the `Select` shows no selection (placeholder "Elegí tu moneda preferida").
- **REQ-SET-CUR-03**: Choosing a value writes it to `localStorage` synchronously and updates local state. No toast, no confirmation — the choice is implicit.
- **REQ-SET-CUR-04**: `localStorage` reads and writes are wrapped in `try`/`catch`. If storage is unavailable (Safari private mode, embedded webviews), reads return `null` and writes are no-ops. The UI still functions: the user can change the value during the session, but it does not persist.
- **REQ-SET-CUR-05**: The hook `usePreferredCurrency` returns `{ currency: Currency | null, setCurrency: (c: Currency) => void }`. It re-reads from storage on mount only (not on every render). Updates are local state + storage write.
- **REQ-SET-CUR-06**: `CreateWalletPage` consumes `usePreferredCurrency` and uses the returned `currency` as the `defaultValue` for the currency field of its form. If `currency` is `null`, the existing behavior is preserved (USD as default).
- **REQ-SET-CUR-07**: The per-user key MUST include the Cognito `sub`. A different user signing into the same browser MUST NOT see the previous user's preferred currency.

### Routing and Composition (SET-UI)

- **REQ-SET-UI-01**: The route `/settings` resolves to a new `SettingsPage` imported from `features/settings/pages/SettingsPage.tsx`. The inline stub in `AppRouter.tsx` is removed.
- **REQ-SET-UI-02**: `SettingsPage` is wrapped by `ProtectedRoute` (already declared in the existing route tree). Unauthenticated access redirects to `/login`.
- **REQ-SET-UI-03**: The page renders a `PageHeader` with title "Ajustes" and the three sections stacked vertically, each inside a `Card`. Section order: Profile → Change Password → Preferred Currency.
- **REQ-SET-UI-04**: Each section has its own eyebrow + title pair following the redesign convention (eyebrow tone, then `text-3xl font-bold tracking-display`).
- **REQ-SET-UI-05**: The page is reachable from existing nav surfaces (sidebar `LogOut` block does not change; the `Settings` link in BottomTabBar and Sidebar continues to point at `/settings`).

---

## 3. Scenarios

### SCN-SET-PROF: Profile display

**Given** a user signed in with email `kevin@example.com`,
**When** they navigate to `/settings`,
**Then** the Profile section shows "Email" followed by `kevin@example.com` as static text, and no edit control is present.

---

### SCN-SET-PWD-OK: Successful password change

**Given** a signed-in user on `/settings` with a known current password,
**When** they enter the correct current password and a new password meeting Cognito's policy in both `newPassword` and `confirmNewPassword`, and submit,
**Then** Cognito's `changePassword` resolves, a toast "Contraseña actualizada" is shown, the form is reset, and the user remains signed in (the next protected route or API request succeeds without re-authentication).

---

### SCN-SET-PWD-WRONG-CURRENT: Wrong current password

**Given** a signed-in user on `/settings`,
**When** they enter an incorrect current password and submit,
**Then** Cognito returns `NotAuthorizedException`, a toast "La contraseña actual no es correcta" is shown, the form keeps its values (so the user can edit), and the user remains signed in.

---

### SCN-SET-PWD-WEAK-NEW: New password violates policy

**Given** a signed-in user on `/settings`,
**When** they enter a correct current password and a new password Cognito rejects (e.g., too short, missing required character class) and submit,
**Then** Cognito returns `InvalidPasswordException`, a toast "La nueva contraseña no cumple los requisitos" is shown, and the form retains the entered values.

---

### SCN-SET-PWD-RATE-LIMIT: Too many attempts

**Given** a signed-in user who has submitted multiple failed change-password attempts in a short window,
**When** they submit again and Cognito returns `LimitExceededException`,
**Then** a toast "Demasiados intentos. Probá de nuevo en unos minutos" is shown, the submit button remains enabled (the user could wait and retry), and no state is lost.

---

### SCN-SET-PWD-CLIENT-VALIDATION: Local validation blocks submit

**Given** a signed-in user on `/settings`,
**When** they enter `newPassword` and `confirmNewPassword` that do not match,
**Then** the form shows an inline error under `confirmNewPassword`, the submit button is disabled, and no network request is made.

---

### SCN-SET-CUR-FIRST-CHOICE: First time setting preferred currency

**Given** a user who has never chosen a preferred currency (no entry in `localStorage`),
**When** they navigate to `/settings`,
**Then** the PreferredCurrency `Select` shows placeholder "Elegí tu moneda preferida" with no value selected.

**When** the user picks `PEN`,
**Then** `localStorage` contains `"PEN"` under `smart-wallet:preferred-currency:${their.sub}`, and the `Select` displays `PEN` as the current value.

---

### SCN-SET-CUR-PERSIST: Persistence across reload

**Given** a user who previously chose `PEN` as their preferred currency,
**When** they reload `/settings`,
**Then** the PreferredCurrency `Select` opens with `PEN` selected.

---

### SCN-SET-CUR-CONSUMED-BY-CREATE-WALLET: Default flows into new wallet form

**Given** a user with preferred currency `PEN` saved in `localStorage`,
**When** they open `/wallets/new`,
**Then** the currency field of the CreateWallet form is pre-selected to `PEN`. The user can still change it before submission; the preferred currency is a default, not a lock.

---

### SCN-SET-CUR-NO-LEAK-ACROSS-USERS: Per-user isolation

**Given** user A (sub `A-uuid`) chose preferred currency `PEN`, then signed out,
**When** user B (sub `B-uuid`) signs in on the same browser and opens `/settings`,
**Then** user B sees the placeholder "Elegí tu moneda preferida" with no selection — user A's preference is NOT shown.

---

### SCN-SET-CUR-STORAGE-UNAVAILABLE: localStorage throws

**Given** a user whose browser refuses `localStorage` writes (e.g., Safari private mode),
**When** they pick a preferred currency,
**Then** the `Select` updates to show the chosen value, no error is shown, but on the next reload the value is gone. The page does not throw or render an error boundary.

---

### SCN-SET-UI-ROUTE: Settings is a real page

**Given** a signed-in user clicking the "Settings" / "Ajustes" link in the sidebar (desktop) or bottom tab bar (mobile),
**When** the navigation completes,
**Then** the page renders `PageHeader` with "Ajustes", followed by three `Card`s in order: Perfil, Cambiar contraseña, Moneda preferida. No `"próximamente"` text is shown anywhere.
