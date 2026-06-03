# Proposal: settings

> SDD phase: propose
> Project: smart-wallet
> Change: settings
> Date: 2026-05-15
> Engram topic_key: `sdd/settings/proposal`

## 1. Intent

`web-mvp` shipped four feature surfaces — auth, wallets, transactions, categories — but Settings was deferred. Today, `/settings` resolves to a placeholder stub in `AppRouter.tsx:18-22` that reads "Configuración (próximamente)". The nav links to it, the user clicks, and the experience dead-ends.

This change replaces that stub with a real Settings page that gives the authenticated user three pieces of self-service control: see which account they are signed in as, change their Cognito password, and pick a default currency that pre-fills the wallet creation form. Nothing else.

Success means: clicking the Settings nav lands on a page where (a) the user's email is visible, (b) they can change their password without leaving the app, (c) they can pick `USD` or `PEN` as default, and (d) that default is honored the next time they open "Create wallet". Zero new backend endpoints, zero new infra, zero behavior change for users who don't visit Settings.

## 2. In Scope

- **Replace the inline stub** in `AppRouter.tsx` with a real `SettingsPage` imported from a new `features/settings/` feature slice.
- **Profile section** (read-only) — shows the signed-in user's email, sourced from `useAuth().user.email` (already populated from the Cognito ID-token claims).
- **Change-password section** — `react-hook-form` + Zod schema with three fields (`currentPassword`, `newPassword`, `confirmNewPassword`). Submits via a new `changePassword` method exposed by `AuthProvider`, which wraps `CognitoUser.changePassword(oldPassword, newPassword, callback)` from `amazon-cognito-identity-js` (already installed). On success: toast + clear form. On Cognito error: typed error message via `mapCognitoError`.
- **Default-currency section** — `Select` with `USD` and `PEN` (the only currencies the backend supports, per `packages/domain/src/wallet/Wallet.ts:12`). Saved to `localStorage` under a per-user key. Read in `CreateWalletPage` to pre-select the currency dropdown.
- **`AuthProvider` extension** — add `changePassword` to `AuthContextValue` and the provider's `value`. No other auth-flow changes.
- **`mapCognitoError` extension** — handle `NotAuthorizedException` (wrong current password), `InvalidPasswordException` (new password too weak), `LimitExceededException` (too many attempts) with Spanish messages.
- **Page layout** — uses existing primitives: `PageHeader` for the title, `Card` for each section, `Form`/`FormField` for the password form, plain `Label` + `Select` for the currency picker (matches the design-system convention established in the redesign).
- **i18n strings** — new `t.settings.*` keys in `lib/i18n.ts` for section titles, labels, and toast messages (Spanish only).

## 3. Out of Scope

- **No email change**. Cognito allows email change but requires a verification flow that's beyond MVP scope. The email field is read-only.
- **No display-name / username editing**. Cognito username is the email; no separate display name in the JWT.
- **No "delete account" / "deactivate account"**. Cognito user deletion would need a backend endpoint (and a real confirmation flow); deferred.
- **No notification preferences, no theme toggle, no language toggle**. The app is Spanish-only and light-mode-only by design.
- **No backend changes**. No new endpoints, no new DTOs, no schema changes in `shared-types`, no DynamoDB writes. The change-password call talks directly to Cognito; the currency preference lives in `localStorage`.
- **No "logout" button inside Settings**. Logout is already available from the sidebar (`LogOut` icon, desktop) and the bottom tab bar context (mobile sidebar). Duplicating it in Settings adds a fourth surface for the same action — noise without benefit.
- **No password-strength meter / live validation hints**. Cognito's password policy is enforced on submit; we surface its error message verbatim (translated). A meter is UI polish, deferred.
- **No "forgot current password" recovery link** inside the Settings change-password form. If the user doesn't remember it, they sign out and use the existing `/forgot-password` flow.
- **No cross-device sync of default currency**. `localStorage` is per-browser, per-user. Cross-device sync would need a backend preferences endpoint.

## 4. Architectural Decisions

### 4.1 No backend involvement — Cognito + localStorage, period

Settings has zero backend surface area:

- **Password change** → direct Cognito API call via `amazon-cognito-identity-js` (`CognitoUser.changePassword`). The handler runs in the browser, signed by the current access token. The Lambda backend never sees it.
- **Default currency** → `localStorage`, scoped per user.

Rationale: adding a `/me/preferences` endpoint for two settings is overengineering. Cognito already handles password mutations. `localStorage` is fine for a single-device personal app — and explicitly out-of-scope of cross-device sync (§3).

### 4.2 Per-user localStorage key

Key shape: `smart-wallet:preferred-currency:{cognitoSub}` where `{cognitoSub}` is `user.sub` (the Cognito UUID from the JWT claims, already on `AuthContextValue.user`).

Why per-user: if two different accounts use the same browser, they must not leak preferences between sessions. The `sub` claim is stable and globally unique per Cognito user.

Why not the email: email could in theory change in the future (out of scope today, but cheaper to be correct now).

### 4.3 Extend `AuthProvider` with `changePassword` — do not bypass it

The Settings change-password form must NOT instantiate `new CognitoUser(...)` directly. The `AuthProvider` already owns the `cognitoUserRef` and is the single seam for Cognito interactions. Adding `changePassword` to `AuthContextValue` keeps that boundary intact and avoids two competing sources of truth for the current user.

Method shape:

```ts
changePassword: (args: { currentPassword: string; newPassword: string }) => Promise<void>;
```

Implementation: calls `cognitoUserRef.current?.changePassword(currentPassword, newPassword, cb)` and wraps the node-style callback in a Promise. Throws on failure. Does NOT touch session storage, does NOT call `setState` (the access tokens stay valid after a password change — no re-auth needed).

### 4.4 Feature-sliced layout

New folder mirrors the existing convention (auth, wallets, transactions, categories):

```
packages/web/src/features/settings/
  pages/
    SettingsPage.tsx
  components/
    ProfileSection.tsx
    ChangePasswordSection.tsx
    PreferredCurrencySection.tsx
  schemas.ts              # Zod schema for change-password form
  usePreferredCurrency.ts # localStorage read/write hook
```

Sections are siblings (not nested) so the page composes them in a single column. Each section is a `Card` to match the redesign's bento-style.

### 4.5 `usePreferredCurrency` hook contract

```ts
const { currency, setCurrency } = usePreferredCurrency();
// currency: Currency | null  (null if user has not chosen one yet)
// setCurrency: (c: Currency) => void  (writes to localStorage, updates state)
```

Reads on first render via `useState(() => readFromStorage())`. Writes synchronously on `setCurrency`. No TanStack Query — this is local state, not server state.

Consumed by `CreateWalletPage` to set the initial value of the currency `Select`. The existing form keeps its current behavior if `currency` is `null` (USD default, as today).

### 4.6 Error handling for Cognito password errors

Extend `mapCognitoError` (in `features/auth/types.ts` or wherever it lives) with three new branches:

| Cognito code               | Spanish message                                       |
| -------------------------- | ----------------------------------------------------- |
| `NotAuthorizedException`   | "La contraseña actual no es correcta"                 |
| `InvalidPasswordException` | "La nueva contraseña no cumple los requisitos"        |
| `LimitExceededException`   | "Demasiados intentos. Probá de nuevo en unos minutos" |

Anything else → fallback to the existing generic message.

## 5. Risks

- **`mapCognitoError` divergence** — if its current signature is shared between login/forgot-password and the new change-password flow, the new branches must not break existing error mapping. Mitigation: append-only changes; existing branches stay verbatim. The spec phase will pin the current signature.
- **AuthProvider context shape change** — adding a method to `AuthContextValue` is a breaking change for any consumer that destructures with TypeScript exhaustiveness. In practice, consumers cherry-pick fields, so this is low risk. Mitigation: `tsc --noEmit` after the change.
- **localStorage availability** — Safari private mode and some embedded webviews throw on `localStorage.setItem`. Mitigation: wrap reads/writes in try/catch; falling back to "no preference" is acceptable degradation.
- **Empty state collision** — if a brand-new user opens Settings before signing out, `user.email` is guaranteed present (auth-gated route). No empty state needed for profile; the currency picker shows "USD" as a sensible default placeholder when storage is empty.

## 6. Success Criteria

1. `/settings` renders the new `SettingsPage` (no more "(próximamente)" stub).
2. Profile section displays the signed-in user's email, read-only.
3. Change-password form: with the correct current password and a valid new password, submission succeeds, a success toast appears, the form clears, and the user is NOT signed out.
4. Change-password errors: wrong current password shows "La contraseña actual no es correcta"; weak new password shows the policy error; rate-limit shows the wait message.
5. Default-currency picker: choosing `PEN` persists across reload; opening "Create wallet" pre-selects `PEN` in the currency dropdown.
6. `tsc --noEmit` and `pnpm lint` pass on `packages/web`.
7. No new packages installed. No backend, no CDK, no infra-sls touched.
