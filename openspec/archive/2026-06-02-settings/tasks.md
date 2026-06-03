# Tasks: settings

> SDD phase: tasks
> Project: smart-wallet
> Change: settings
> Date: 2026-05-15
> Engram topic_key: `sdd/settings/tasks`

---

## Conventions

- `[ ]` = pending, `[x]` = completed (sdd-apply ticks these)
- Task ID: `T-01-{nn}` (single slice — all tasks live in one PR)
- Each task includes:
  - **Files**: created / modified
  - **Deps**: prior T-01-YY that must complete first
  - **Acceptance**: spec REQ IDs it covers + verification step
  - **Est**: S (≤ 15 min), M (15–45 min), L (45–90 min)
- All user-facing copy is in Spanish (voseo/rioplatense).

---

## Workload Forecast

| Metric                           | Estimate                                        |
| -------------------------------- | ----------------------------------------------- |
| Total tasks                      | 11                                              |
| Total estimated time             | ~3.5 hours (solo dev, no tests)                 |
| Estimated changed lines (LOC)    | ~340                                            |
| Files created                    | 6                                               |
| Files modified                   | 6                                               |
| **400-line budget risk**         | **Low**                                         |
| **Chained PRs recommended**      | **No**                                          |
| **Decision needed before apply** | **No** (delivery strategy `single-pr` resolved) |

---

## Slice 1 — Settings page end-to-end

### Foundation — additive primitives (no consumer changes)

- [ ] **T-01-01** Add `settings` namespace to `lib/i18n.ts`
  - **Files**: `packages/web/src/lib/i18n.ts` (modified)
  - **Deps**: none
  - **Acceptance**: covers all copy strings consumed by §3.6 of design. `pnpm --filter @smart-wallet/web typecheck` green. `t.settings.title === 'Ajustes'`.
  - **Est**: S

- [ ] **T-01-02** Extend `mapCognitoError` with optional `overrides` arg + add `changePassword` to `AuthContextValue` shape
  - **Files**: `packages/web/src/features/auth/types.ts` (modified)
  - **Deps**: none
  - **Acceptance**: REQ-SET-PWD-04, REQ-SET-PWD-07. Existing callers (`LoginPage`, `ForgotPasswordPage`, `ConfirmForgotPasswordPage`) compile and behave identically (no second arg passed → identical message resolution path). `tsc --noEmit` green across packages/web.
  - **Est**: S

- [ ] **T-01-03** Add `changePassword` implementation to `AuthProvider`
  - **Files**: `packages/web/src/features/auth/AuthProvider.tsx` (modified)
  - **Deps**: T-01-02 (the context type)
  - **Acceptance**: REQ-SET-PWD-04, REQ-SET-PWD-08. Method is in `value` memo (deps list updated). When `cognitoUserRef.current` is `null`, throws `Error("No active session")`. `tsc --noEmit` green.
  - **Est**: S

- [ ] **T-01-04** Add optional `id` and `placeholder` props to `CurrencySelect`
  - **Files**: `packages/web/src/features/wallets/components/CurrencySelect.tsx` (modified)
  - **Deps**: none
  - **Acceptance**: REQ-SET-CUR-01 (the component is the surface), supports SCN-SET-CUR-FIRST-CHOICE via `placeholder`. `CreateWalletPage` consumer keeps rendering identically (no props passed → defaults preserved). `tsc --noEmit` green.
  - **Est**: S

### Feature slice — settings module

- [ ] **T-01-05** Create `usePreferredCurrency` hook
  - **Files**: `packages/web/src/features/settings/usePreferredCurrency.ts` (new)
  - **Deps**: none (depends on `useAuth` which already exists)
  - **Acceptance**: REQ-SET-CUR-02, REQ-SET-CUR-04, REQ-SET-CUR-05, REQ-SET-CUR-07. Lazy `useState` init reads `localStorage`. `useEffect` on `sub` re-syncs. `try/catch` wraps read and write. Returns `{ currency, setCurrency }`. `tsc --noEmit` green.
  - **Est**: M

- [ ] **T-01-06** Create `ChangePasswordSchema` (Zod) in `features/settings/schemas.ts`
  - **Files**: `packages/web/src/features/settings/schemas.ts` (new)
  - **Deps**: none
  - **Acceptance**: REQ-SET-PWD-02. Schema enforces non-empty current, `newPassword.length >= 10`, `confirmNewPassword === newPassword` (via `.refine`), `newPassword !== currentPassword` (via `.refine`). `tsc --noEmit` green.
  - **Est**: S

- [ ] **T-01-07** Create `ProfileSection` component
  - **Files**: `packages/web/src/features/settings/components/ProfileSection.tsx` (new)
  - **Deps**: T-01-01 (i18n strings)
  - **Acceptance**: REQ-SET-PROF-01, REQ-SET-PROF-02, REQ-SET-PROF-03, REQ-SET-PROF-04. Renders `Card` with eyebrow + h2 + email value from `useAuth().user.email`. Returns `null` if `user` is `null`. No edit control present.
  - **Est**: S

- [ ] **T-01-08** Create `ChangePasswordSection` component
  - **Files**: `packages/web/src/features/settings/components/ChangePasswordSection.tsx` (new)
  - **Deps**: T-01-01 (i18n), T-01-02 (mapCognitoError overrides + AuthContextValue), T-01-03 (changePassword impl), T-01-06 (Zod schema)
  - **Acceptance**: REQ-SET-PWD-01 through REQ-SET-PWD-06. `react-hook-form` form with three `Input type="password"` fields and correct `autoComplete`. Submit calls `useAuth().changePassword`, success → toast + `form.reset()` + focus on `currentPassword`, error → `mapCognitoError(err, overrides)` → toast. Submit disabled while invalid or submitting. `tsc --noEmit` green.
  - **Est**: M

- [ ] **T-01-09** Create `PreferredCurrencySection` component
  - **Files**: `packages/web/src/features/settings/components/PreferredCurrencySection.tsx` (new)
  - **Deps**: T-01-01 (i18n), T-01-04 (CurrencySelect props), T-01-05 (hook)
  - **Acceptance**: REQ-SET-CUR-01, REQ-SET-CUR-03, REQ-SET-CUR-06 (consumer side covered in T-01-11). Renders `Card` with eyebrow + h2 + helper text + `Label` + `CurrencySelect`. Choosing a value calls `setCurrency`. `tsc --noEmit` green.
  - **Est**: S

- [ ] **T-01-10** Create `SettingsPage` and wire it into `AppRouter`
  - **Files**: `packages/web/src/features/settings/pages/SettingsPage.tsx` (new), `packages/web/src/app/AppRouter.tsx` (modified — remove stub, import real page)
  - **Deps**: T-01-07, T-01-08, T-01-09
  - **Acceptance**: REQ-SET-UI-01, REQ-SET-UI-02, REQ-SET-UI-03, REQ-SET-UI-04, REQ-SET-UI-05. Inline stub at `AppRouter.tsx:18-22` is removed. The route at `routes.settings` resolves to the real page. Page composes the three sections in order: Profile → ChangePassword → PreferredCurrency.
  - **Est**: S

### Consumer integration — preferred currency flows into create-wallet form

- [ ] **T-01-11** Wire `usePreferredCurrency` into `CreateWalletPage` defaults
  - **Files**: `packages/web/src/features/wallets/pages/CreateWalletPage.tsx` (modified)
  - **Deps**: T-01-05
  - **Acceptance**: REQ-SET-CUR-06, SCN-SET-CUR-CONSUMED-BY-CREATE-WALLET. `defaultValues.currency` is `preferred ?? 'USD'`. Existing flow unchanged when no preference set. `tsc --noEmit` green.
  - **Est**: S

### Verification (runs after all tasks above are checked)

- [ ] **T-01-12** Typecheck + lint pass on `packages/web`
  - **Files**: none (verification only)
  - **Deps**: T-01-01 through T-01-11
  - **Acceptance**: `pnpm --filter @smart-wallet/web typecheck` and `pnpm --filter @smart-wallet/web lint` both exit 0. No new warnings introduced. (Existing lint warnings are out of scope — record any new ones for follow-up.)
  - **Est**: S

- [ ] **T-01-13** Manual smoke (dev server, single user, happy paths)
  - **Files**: none (verification only)
  - **Deps**: T-01-12
  - **Acceptance**: With `pnpm --filter @smart-wallet/web dev` running and pointed at prod Cognito:
    1. Open `/settings` — page shows three sections, no "(próximamente)".
    2. Profile shows the logged-in email.
    3. Change password with correct current + valid new → success toast, form clears, navigation works (no forced sign-out).
    4. Change password with wrong current → "La contraseña actual no es correcta" toast, form keeps values.
    5. Choose preferred currency `PEN` → reload → still `PEN` selected.
    6. Open `/wallets/new` → currency dropdown is pre-selected to `PEN`.
    7. Sign out + sign in with a different test user (if available) → `/settings` shows the placeholder for currency (no leak).
  - **Est**: M

---

## Dependency graph

```
T-01-01 (i18n) ────────┐
T-01-02 (types) ──┐    │
                  ├── T-01-08 (ChangePasswordSection)
T-01-03 (provider)┤
T-01-06 (schema) ─┘

T-01-04 (CurSelect) ─┐
T-01-05 (hook) ──────┼── T-01-09 (PreferredCurrencySection)
                     │
                     └── T-01-11 (CreateWalletPage)

T-01-01 ── T-01-07 (ProfileSection)

T-01-07 ─┐
T-01-08 ─┼── T-01-10 (SettingsPage + AppRouter)
T-01-09 ─┘

T-01-01..11 ── T-01-12 (typecheck/lint) ── T-01-13 (smoke)
```

## Suggested apply order

The dependency graph admits multiple orderings. Recommended linear sequence (matches design §3):

1. **T-01-01** i18n strings
2. **T-01-02** `mapCognitoError` + `AuthContextValue` shape
3. **T-01-03** `AuthProvider.changePassword`
4. **T-01-04** `CurrencySelect` props
5. **T-01-05** `usePreferredCurrency` hook
6. **T-01-06** Zod schema
7. **T-01-07** `ProfileSection`
8. **T-01-08** `ChangePasswordSection`
9. **T-01-09** `PreferredCurrencySection`
10. **T-01-10** `SettingsPage` + `AppRouter`
11. **T-01-11** `CreateWalletPage` integration
12. **T-01-12** Typecheck + lint
13. **T-01-13** Manual smoke

This ordering ensures every dependent task's deps are satisfied at apply time and yields a clean conventional-commit grouping if commit-splitting is requested later.

---

## Out of scope for this change (reaffirmation)

- No backend changes — no Lambda, no DynamoDB, no SSM, no CDK.
- No tests are added. Test surface is documented in design §5 for a follow-on change.
- No deploy to AWS prod — change works on dev server pointing at prod Cognito. Deploy is task #16 in the broader project board, deferred per the user's "ship features locally first" decision.
