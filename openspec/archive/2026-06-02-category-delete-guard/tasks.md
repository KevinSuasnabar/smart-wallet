# Tasks: category-delete-guard

> SDD phase: tasks
> Project: smart-wallet
> Change: category-delete-guard
> Date: 2026-05-15
> Engram topic_key: `sdd/category-delete-guard/tasks`

---

## Workload Forecast

| Metric                           | Value                                           |
| -------------------------------- | ----------------------------------------------- |
| Total tasks                      | 9                                               |
| Total estimated time             | ~1.5 hours (solo dev, no tests)                 |
| Estimated changed lines          | ~45                                             |
| Files modified                   | 6–7 (depending on `conflict()` helper presence) |
| Files created                    | 0                                               |
| **400-line budget**              | **Low** — single PR                             |
| **Chained PRs**                  | **No**                                          |
| **Decision needed before apply** | **No**                                          |

---

## Slice 1 — single PR, backend + frontend together

- [ ] **T-01-01** Add `CategoryHasTransactions` error class + union member
  - **Files**: `packages/domain/src/category/CategoryError.ts`
  - **Acceptance**: REQ-CAT-DEL-DOM-01, REQ-CAT-DEL-DOM-02. `pnpm --filter @smart-wallet/domain build` green.
  - **Est**: S

- [ ] **T-01-02** Extend `DeleteCustomCategory` deps + has-transactions check
  - **Files**: `packages/domain/src/category/usecases/DeleteCustomCategory.ts`
  - **Deps**: T-01-01
  - **Acceptance**: REQ-CAT-DEL-DOM-03, REQ-CAT-DEL-DOM-04, REQ-CAT-DEL-DOM-05, REQ-CAT-DEL-DOM-06. Check uses `transactionRepo.listByCategory(userId, categoryId.toString(), { limit: 1 })`. Returns `CategoryHasTransactions` when items present. Existing predefined + not-found paths unchanged. Domain build green.
  - **Est**: M

- [ ] **T-01-03** Wire `transactionRepo` into `deleteCustomCategory` in container
  - **Files**: `packages/api/src/composition/container.ts`
  - **Deps**: T-01-02
  - **Acceptance**: REQ-CAT-DEL-COMP-01. `pnpm --filter @smart-wallet/api typecheck` green.
  - **Est**: S

- [ ] **T-01-04** Add `conflict()` response helper (if missing)
  - **Files**: `packages/api/src/shared/response.ts`
  - **Acceptance**: Exports `conflict(code: string)` returning `{ statusCode: 409, headers, body: JSON.stringify({ error: code }) }`. Matches the shape of existing helpers (`badRequest`, `notFound`).
  - **Note**: Verify if `conflict()` already exists — skip this task if so.
  - **Est**: S

- [ ] **T-01-05** Add 409 branch to `deleteCustomCategory` handler
  - **Files**: `packages/api/src/handlers/category/deleteCustomCategory.ts`
  - **Deps**: T-01-04
  - **Acceptance**: REQ-CAT-DEL-HTTP-01, REQ-CAT-DEL-HTTP-02, REQ-CAT-DEL-HTTP-03, REQ-CAT-DEL-HTTP-04. Imports `CategoryHasTransactions`. Branch added between `InvalidCategoryId` and the fallthrough. Returns `conflict('category_has_transactions')`. API typecheck green.
  - **Est**: S

- [ ] **T-01-06** Add i18n string (Spanish neutro)
  - **Files**: `packages/web/src/lib/i18n.ts`
  - **Acceptance**: REQ-CAT-DEL-FE-01. `t.categories.deleteHasTransactionsError` exists with the exact string from spec. No voseo.
  - **Est**: S

- [ ] **T-01-07** Map error code in `userMessageFor`
  - **Files**: `packages/web/src/lib/api/errors.ts`
  - **Deps**: T-01-06
  - **Acceptance**: REQ-CAT-DEL-FE-02. New branch `err.code === 'category_has_transactions'` returns `t.categories.deleteHasTransactionsError`. Branch is placed BEFORE the status-based checks. Existing branches unchanged. Web typecheck green.
  - **Est**: S

- [ ] **T-01-08** Local smoke
  - **Files**: none (verification)
  - **Deps**: T-01-01..07
  - **Acceptance**: With DynamoDB Local + serverless offline running, the following 4 scenarios pass:
    1. Create custom category C. Add a transaction T referencing C. `DELETE /categories/{C.id}` → 409 with `category_has_transactions`. Frontend toast renders the Spanish neutro message. Category stays in list.
    2. Hard-delete T via `DELETE /wallets/{wid}/transactions/{tid}`. Retry `DELETE /categories/{C.id}` → 204. Category disappears.
    3. Create another custom category D (never used). Delete it → 204.
    4. Try `DELETE /categories/expense:food` (predefined) → 400 with `cannot_delete_predefined_category`. Frontend toast: generic error.
  - **Est**: M

- [ ] **T-01-09** Commit + push + open PR
  - **Files**: none (git)
  - **Deps**: T-01-08
  - **Acceptance**: Single conventional commit `feat(api,web): block delete of category with transactions`. Branch `feat/category-delete-guard` pushed. PR body references the spec/design and lists smoke results.
  - **Est**: S

---

## Out-of-band tasks (not in this PR)

- Re-deploy backend with the categoryId fix from the previous PR (still pending — user to run when convenient).
- Add a `smoke-categories-prod.sh` covering the 4 scenarios above against prod (future).
- Migrate prod orphans (transactions referencing deleted categories) to a fallback predefined category (future).
