# Tasks: category-fork

> SDD phase: tasks
> Project: smart-wallet
> Change: category-fork
> Date: 2026-05-15
> Engram topic_key: `sdd/category-fork/tasks`

---

## Workload Forecast

| Metric | Value |
|---|---|
| Total tasks | 18 |
| Total estimated time | ~10–12 hours |
| Estimated changed lines | ~1300 |
| Files created | 9 |
| Files modified | 21 |
| **400-line budget** | **High** — single PR with size:exception |
| **Chained PRs** | **No** (backend+frontend coupling) |
| **Decision needed before apply** | **No** |

---

## Slice 1 — single PR

### Foundation: shared types and catalog rewrite

- [ ] **T-01-01** Rewrite `PREDEFINED_CATEGORIES` with Spanish-neutro names + color per entry
  - **Files**: `packages/shared-types/src/categories.ts`
  - **Acceptance**: REQ-FORK-DTO-06. All 14 entries have name in neutro AND color per proposal §4.7. `as const satisfies` keeps strict types.
  - **Est**: S

- [ ] **T-01-02** Add `color` to category schemas + new `UpdateCategoryRequestSchema` + widened `CategoryIdPathSchema`
  - **Files**: `packages/shared-types/src/schemas/category.ts`, `packages/shared-types/src/index.ts`
  - **Deps**: T-01-01
  - **Acceptance**: REQ-FORK-DTO-01..05.
  - **Est**: S

### Domain layer

- [ ] **T-01-03** Add `InvalidCategoryColor` + `CategoryAlreadyHidden` errors
  - **Files**: `packages/domain/src/category/CategoryError.ts`
  - **Acceptance**: REQ-FORK-DOM-04. Domain build green.
  - **Est**: S

- [ ] **T-01-04** Add `color` field + `applyEdits` to `Category` entity
  - **Files**: `packages/domain/src/category/Category.ts`
  - **Deps**: T-01-03
  - **Acceptance**: REQ-FORK-DOM-01..03. Domain build green.
  - **Est**: M

- [ ] **T-01-05** Create `HiddenPredefinedCategory` entity
  - **Files**: `packages/domain/src/category/HiddenPredefinedCategory.ts` (new), `packages/domain/src/category/index.ts` (re-export)
  - **Deps**: T-01-03
  - **Acceptance**: REQ-FORK-DOM-05.
  - **Est**: S

- [ ] **T-01-06** Extend `CategoryRepository` interface with `update`, `hide`, `listHiddenPredefined`, `forkPredefined`
  - **Files**: `packages/domain/src/category/CategoryRepository.ts`
  - **Acceptance**: REQ-FORK-REPO-01.
  - **Est**: S

- [ ] **T-01-07** Create `UpdateCustomCategory` use case
  - **Files**: `packages/domain/src/category/usecases/UpdateCustomCategory.ts` (new), `packages/domain/src/category/index.ts`
  - **Deps**: T-01-04, T-01-06
  - **Acceptance**: REQ-FORK-DOM-06.
  - **Est**: M

- [ ] **T-01-08** Create `HidePredefinedCategory` use case
  - **Files**: `packages/domain/src/category/usecases/HidePredefinedCategory.ts` (new), `packages/domain/src/category/index.ts`
  - **Deps**: T-01-05, T-01-06
  - **Acceptance**: REQ-FORK-DOM-08.
  - **Est**: M

- [ ] **T-01-09** Create `ForkPredefinedCategory` use case
  - **Files**: `packages/domain/src/category/usecases/ForkPredefinedCategory.ts` (new), `packages/domain/src/category/index.ts`
  - **Deps**: T-01-04, T-01-05, T-01-06
  - **Acceptance**: REQ-FORK-DOM-07. Includes the tx-migration construction (raw `oldSK` → new `txItem`).
  - **Est**: L

- [ ] **T-01-10** Update `ListCategories` to filter hidden + add color in response
  - **Files**: `packages/domain/src/category/usecases/ListCategories.ts`
  - **Deps**: T-01-06
  - **Acceptance**: REQ-FORK-DOM-09.
  - **Est**: M

### Repository implementation

- [ ] **T-01-11** Implement `update`, `hide`, `listHiddenPredefined`, `forkPredefined` in DynamoDB repo
  - **Files**: `packages/api/src/adapters/dynamodb/repositories/DynamoDBCategoryRepository.ts`, `packages/api/src/adapters/dynamodb/keyBuilders.ts` (+hiddenPredefinedSK), `packages/api/src/adapters/dynamodb/mappers/HiddenPredefinedCategoryMapper.ts` (new), `packages/api/src/adapters/dynamodb/mappers/CategoryMapper.ts` (+color w/ fallback)
  - **Deps**: T-01-04, T-01-05, T-01-06
  - **Acceptance**: REQ-FORK-REPO-01..04.
  - **Est**: L

### Composition + handlers

- [ ] **T-01-12** Wire 3 new use cases into container
  - **Files**: `packages/api/src/composition/container.ts`
  - **Deps**: T-01-07, T-01-08, T-01-09
  - **Acceptance**: REQ-FORK-COMP-01.
  - **Est**: S

- [ ] **T-01-13** Update existing handlers for color (create + list + delete)
  - **Files**: `packages/api/src/handlers/category/createCustomCategory.ts`, `packages/api/src/handlers/category/listCategories.ts`, `packages/api/src/handlers/category/deleteCustomCategory.ts` (RENAMED → `deleteCategory.ts`)
  - **Deps**: T-01-04, T-01-08, T-01-10
  - **Acceptance**: REQ-FORK-HTTP-03. Returns color in DTOs. The delete handler now dispatches by kind.
  - **Est**: M

- [ ] **T-01-14** Create `patchCategory` handler + shim
  - **Files**: `packages/api/src/handlers/category/patchCategory.ts` (new), `packages/infra-sls/src/handlers/category/patchCategory.ts` (new shim), `packages/infra-sls/src/handlers/category/deleteCategory.ts` (rename from deleteCustomCategory)
  - **Deps**: T-01-07, T-01-09, T-01-12
  - **Acceptance**: REQ-FORK-HTTP-02, REQ-FORK-HTTP-04.
  - **Est**: M

- [ ] **T-01-15** Update `serverless.yml`
  - **Files**: `packages/infra-sls/serverless.yml`
  - **Deps**: T-01-14
  - **Acceptance**: REQ-FORK-HTTP-05. `patchCategory` added, `deleteCustomCategory` renamed to `deleteCategory`.
  - **Est**: S

### Frontend

- [ ] **T-01-16** Frontend: i18n + new EditCategoryDialog + CategoryItem rework + CreateCategoryDialog ColorPicker + DeleteCategoryConfirm variant + page wiring + queries + api
  - **Files**: `packages/web/src/lib/i18n.ts`, `packages/web/src/features/categories/categoriesApi.ts`, `packages/web/src/features/categories/queries.ts`, `packages/web/src/features/categories/components/EditCategoryDialog.tsx` (new), `packages/web/src/features/categories/components/CategoryItem.tsx`, `packages/web/src/features/categories/components/CategoryList.tsx`, `packages/web/src/features/categories/components/CreateCategoryDialog.tsx`, `packages/web/src/features/categories/components/DeleteCategoryConfirm.tsx`, `packages/web/src/features/categories/pages/CategoriesPage.tsx`
  - **Deps**: T-01-13, T-01-14
  - **Acceptance**: REQ-FORK-FE-01..10.
  - **Est**: L

### Verification

- [ ] **T-01-17** Cross-package typecheck + local smoke
  - **Files**: none
  - **Deps**: T-01-01..16
  - **Acceptance**: All packages typecheck green. Manual smoke covers the 9 scenarios from proposal §6.
  - **Est**: M

- [ ] **T-01-18** Commit + push + open PR
  - **Files**: none (git)
  - **Acceptance**: Branch `feat/category-fork` pushed. PR opened with summary + spec link + smoke results.
  - **Est**: S

---

## Apply order (linear)

T-01-01 → T-01-02 → T-01-03 → T-01-04 → T-01-05 → T-01-06 → T-01-07 → T-01-08 → T-01-09 → T-01-10 → T-01-11 → T-01-12 → T-01-13 → T-01-14 → T-01-15 → T-01-16 → T-01-17 → T-01-18.

---

## Out-of-band tasks (not in this PR)

- Update `smoke-prod.sh` to include color in create + add fork scenario.
- Future: re-show / un-hide affordance.
- Future: bulk reset to default predefineds.
- Future: rename `WalletColor` to `Color` since it's shared with categories.
