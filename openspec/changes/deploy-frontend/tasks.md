# Deploy frontend — Tasks

**Branch**: `feat/deploy-frontend` (already on it)
**Delivery**: single PR (~210 LOC).
**Order**: CDK construct → stack wire → workflow → verify.

## Slice 1 — CDK construct (~125 LOC)

- [ ] **T-01** Create `packages/infra-cdk/src/constructs/WebDistribution.ts` per design.md §2: S3 bucket private + retain + encrypted, CloudFront distribution with OAC, default behavior + `/index.html` behavior + 403/404 → /index.html error responses, 3 SSM params, CfnOutput with full URL.
- [ ] **T-02** Wire the construct in `packages/infra-cdk/src/stacks/SmartWalletStack.ts`: import + instantiate after `GithubOidcRole`, passing `prefix` only.
- [ ] **T-03** Run `pnpm --filter @smart-wallet/infra-cdk typecheck` — must pass.
- [ ] **T-04** Run `pnpm --filter @smart-wallet/infra-cdk run synth` locally to sanity-check the CFN template generates without errors. (Doesn't deploy — pure local synth.)

## Slice 2 — Workflow (~85 LOC)

- [ ] **T-05** Create `.github/workflows/deploy-frontend.yml` per design.md §4. Triggers: push to main only. Steps: checkout → setup pnpm + node → install → configure-aws-credentials (OIDC) → SSM read (6 params) → build web with VITE_* injected → s3 sync (2 passes for cache headers) → cloudfront invalidate.
- [ ] **T-06** Verify `role-session-name` includes `run_attempt` for CloudTrail clarity (matching backend convention).

## Slice 3 — Verify locally (~0 LOC, manual)

- [ ] **T-07** `pnpm typecheck` from repo root — passes.
- [ ] **T-08** `pnpm build` from repo root — passes (builds web with placeholder env vars; CI will use real ones).
- [ ] **T-09** Quick inspect the new construct's CFN output: `pnpm --filter @smart-wallet/infra-cdk run synth` and check `cdk.out/SmartWalletProdStack.template.json` includes the new bucket + distribution resources.

## Slice 4 — Commit, push, document rollout (~0 LOC)

- [ ] **T-10** Single commit: `feat(infra,ci): deploy web to CloudFront on push to main`. NO Co-Authored-By, NO AI attribution.
- [ ] **T-11** Push and prepare rollout summary for the user (proposal §3 / design §8 reproduced in PR body).

## Review Workload Forecast

- **Estimated changed lines**: ~210
- **Chained PRs recommended**: No
- **400-line budget risk**: Low
- **Decision needed before apply**: No.

## Done definition

- All 34 spec requirements / 8 scenarios covered.
- typecheck + build pass.
- Branch pushed, PR ready for user.
- Rollout instructions (CDK deploy, SSM put, first deploy) delivered to user in the closing message.
