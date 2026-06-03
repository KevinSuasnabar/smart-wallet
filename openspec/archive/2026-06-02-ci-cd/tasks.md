# CI/CD — Tasks

**Branch**: `feat/ci-cd` (already on it)
**Delivery**: single PR (~205 LOC). No `size:exception` needed.
**Order**: bottom-up: CDK construct → smoke patch → workflows → docs.

## Slice 1 — CDK construct (~80 LOC)

- [ ] **T-01** Create `packages/infra-cdk/src/constructs/GithubOidcRole.ts` with the construct from design.md §5: `OpenIdConnectProvider` for GitHub, `Role` with federated trust policy condition on `repo:KevinSuasnabar/smart-wallet:ref:refs/heads/main`, `AdministratorAccess` managed policy, SSM parameter + CfnOutput for the role ARN.
- [ ] **T-02** Wire the construct in `packages/infra-cdk/src/stacks/SmartWalletStack.ts`: import + instantiate after `SsmParameters` with `repository: 'KevinSuasnabar/smart-wallet'` and `ssmParameterName: \`${prefix}/github-actions-role-arn\``.
- [ ] **T-03** Run `pnpm --filter @smart-wallet/infra-cdk typecheck` and resolve any errors.

## Slice 2 — Smoke script patch (~18 LOC modified)

- [ ] **T-04** Edit `packages/infra-sls/smoke-tests/smoke-prod.sh`:
  - Replace the `: "${AWS_PROFILE:?Set …}"` line with the optional-profile block from design.md §7.
  - Replace every `--profile "$AWS_PROFILE"` with `"${AWS_CLI_ARGS[@]}"`.
  - Update the comment block at top to document that CI uses env-var credentials (OIDC).
- [ ] **T-05** Verify the script still works locally: `AWS_PROFILE=tomishi-account pnpm smoke:prod` should run unchanged.

## Slice 3 — Workflows (~115 LOC)

- [ ] **T-06** Create `.github/workflows/ci.yml` per design.md §3. Triggers: `pull_request: [main]` + `push: [main]`. Steps: checkout, setup pnpm 10, setup Node from .nvmrc, install, format:check, typecheck, build. Concurrency: cancel-in-progress: true.
- [ ] **T-07** Create `.github/workflows/deploy-backend.yml` per design.md §4. Triggers: only `push: [main]`. Permissions `id-token: write` + `contents: read`. Concurrency: cancel-in-progress: false. Steps: checkout → setup → install → build → configure-aws-credentials (OIDC) → SSM read → serverless deploy → smoke prod.
- [ ] **T-08** Use `${{ vars.AWS_DEPLOY_ROLE_ARN }}` for the role-to-assume, NOT a secret. (Vars are non-secret values; the role ARN is non-sensitive.)

## Slice 4 — Verify locally (~0 LOC, manual)

- [ ] **T-09** `pnpm format:check` from repo root — passes.
- [ ] **T-10** `pnpm typecheck` from repo root — passes (already validated after every prior SDD).
- [ ] **T-11** `pnpm build` from repo root — passes.
- [ ] **T-12** Verify workflows lint: `gh workflow view ci.yml --repo …` won't work locally without push, but `npx @action-validator/cli ci.yml` (if needed). Or skip and trust GitHub's parser on push.

## Slice 5 — Commit, push, document rollout (~0 LOC)

- [ ] **T-13** Single commit: `feat(ci): GitHub Actions PR validation + auto-deploy backend via OIDC`. NO Co-Authored-By, NO AI attribution.
- [ ] **T-14** Push branch and open PR via the URL GitHub returns (no `gh` CLI installed locally).
- [ ] **T-15** Provide the user with the rollout steps (proposal §3 / design §8) in the PR description and the final summary message.

## Review Workload Forecast

- **Estimated changed lines**: ~205
- **Chained PRs recommended**: No
- **400-line budget risk**: Low
- **Decision needed before apply**: No — single PR with default delivery strategy.

## Done definition

- All 33 spec requirements / 9 scenarios covered.
- typecheck + build pass.
- Branch pushed, PR ready for user to merge.
- Rollout instructions delivered to the user (CDK deploy, role ARN copy, GitHub vars setup).
