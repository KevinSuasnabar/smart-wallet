# CI/CD — Spec

## Capability groups

- **CI** — PR validation workflow (8 requirements)
- **DEPLOY** — Backend deploy workflow on push to main (10 requirements)
- **OIDC** — GitHub OIDC provider + IAM role construct (6 requirements)
- **SSM** — Env var resolution from SSM at deploy time (3 requirements)
- **SMOKE** — Post-deploy smoke verification (3 requirements)
- **ROLLOUT** — Manual one-time configuration steps (3 requirements)

Total: **33 requirements / 9 scenarios**.

---

## CI — PR validation

### CI-01

A workflow file `.github/workflows/ci.yml` MUST exist with `name: CI`.

### CI-02

The workflow MUST trigger on `pull_request` against `main` AND on `push` to `main`.

### CI-03

The workflow MUST cancel in-progress runs for the same ref using a `concurrency` group keyed by `ci-${{ github.ref }}` with `cancel-in-progress: true`.

### CI-04

There MUST be a single `validate` job running on `ubuntu-latest` with `timeout-minutes: 15`.

### CI-05

The job MUST checkout the code, set up pnpm via `pnpm/action-setup@v4` with `version: 10`, and set up Node via `actions/setup-node@v4` with `node-version-file: .nvmrc` and `cache: pnpm`.

### CI-06

The job MUST run, in order: `pnpm install --frozen-lockfile`, `pnpm format:check`, `pnpm typecheck`, `pnpm build`.

### CI-07

Failures in any of those steps MUST fail the job (default GitHub behavior — no `continue-on-error`).

### CI-08

The workflow MUST NOT require any AWS credentials (no `permissions: id-token: write`, no `configure-aws-credentials` step).

---

## DEPLOY — Backend deploy on merge

### DEPLOY-01

A workflow file `.github/workflows/deploy-backend.yml` MUST exist with `name: Deploy backend`.

### DEPLOY-02

The workflow MUST trigger ONLY on `push` to `main` (NOT on pull_request, NOT manually for v1).

### DEPLOY-03

The workflow MUST declare `permissions: id-token: write` (required for OIDC) AND `contents: read`.

### DEPLOY-04

The workflow MUST use `concurrency` with `group: deploy-backend` and `cancel-in-progress: false` — a deploy in flight must not be cancelled by a newer push.

### DEPLOY-05

The job MUST run on `ubuntu-latest` with `timeout-minutes: 20`.

### DEPLOY-06

Steps in order: checkout, setup pnpm + Node, `pnpm install --frozen-lockfile`, `pnpm build`, `aws-actions/configure-aws-credentials@v4` with `role-to-assume: ${{ vars.AWS_DEPLOY_ROLE_ARN }}` and `aws-region: us-east-1`, SSM parameter read step, deploy step with env vars wired in, smoke step.

### DEPLOY-07

The deploy step MUST run `npx serverless deploy --stage prod` from `packages/infra-sls` working directory, with these env vars wired from SSM outputs: `TABLE_NAME`, `TABLE_ARN`, `GSI1_NAME`, `COGNITO_ISSUER_URL`, `COGNITO_CLIENT_ID`.

### DEPLOY-08

The workflow MUST NOT hardcode any of those 5 values — they MUST come from SSM `GetParameter` calls in the SSM read step.

### DEPLOY-09

If any step fails (deploy or smoke), the job fails and GitHub notifies the actor via email (default behavior).

### DEPLOY-10

The workflow MUST NOT write any new SSM parameters or AWS resources outside of what `serverless deploy` itself manages.

---

## OIDC — IAM role construct

### OIDC-01

A new construct `GithubOidcRole` MUST live at `packages/infra-cdk/src/constructs/GithubOidcRole.ts`.

### OIDC-02

The construct MUST create (or look up if it already exists) an `OpenIdConnectProvider` for `https://token.actions.githubusercontent.com` with `clientIds: ['sts.amazonaws.com']`.

### OIDC-03

The construct MUST create an `IamRole` with `roleName: 'smart-wallet-github-actions-deploy'`. The role's `assumedBy` MUST be a `FederatedPrincipal` against the OIDC provider, conditioned on:

- `StringEquals: 'token.actions.githubusercontent.com:aud' = 'sts.amazonaws.com'`
- `StringLike: 'token.actions.githubusercontent.com:sub' = 'repo:${repository}:ref:refs/heads/main'`

### OIDC-04

The role MUST be granted the AWS-managed `AdministratorAccess` policy. The first-shippable scope is deliberately broad; trust policy already restricts blast radius. Tightening to least-privilege is a separate follow-up SDD.

### OIDC-05

The construct MUST publish the role ARN as an SSM parameter named `/smart-wallet/prod/github-actions-role-arn` AND as a `CfnOutput` named `GithubActionsRoleArn`.

### OIDC-06

`SmartWalletStack` MUST instantiate `GithubOidcRole` with `repository: 'KevinSuasnabar/smart-wallet'` and `ssmParameterName: '/smart-wallet/prod/github-actions-role-arn'`.

---

## SSM — Env var resolution

### SSM-01

The deploy workflow's SSM read step MUST call `aws ssm get-parameter --name <name> --query Parameter.Value --output text` for each of:

- `/smart-wallet/prod/dynamo/table-name`
- `/smart-wallet/prod/dynamo/table-arn`
- `/smart-wallet/prod/dynamo/gsi1-name`
- `/smart-wallet/prod/cognito/issuer-url`
- `/smart-wallet/prod/cognito/user-pool-client-id`

### SSM-02

Each read MUST write its result to `$GITHUB_OUTPUT` so subsequent steps reference them as `steps.<id>.outputs.<key>`.

### SSM-03

If any SSM read fails (parameter missing), the job MUST fail before reaching the deploy step (default behavior of `aws ssm get-parameter` returning non-zero exit code).

---

## SMOKE — Post-deploy verification

### SMOKE-01

After a successful `serverless deploy`, the workflow MUST run `pnpm smoke:prod`. That script lives at `packages/infra-sls/smoke-tests/smoke-prod.sh` and exits non-zero on failure.

### SMOKE-02

The smoke step MUST source `SMOKE_TEST_EMAIL` and `SMOKE_TEST_PASSWORD` from GitHub repo secrets, and `COGNITO_CLIENT_ID` + the API URL from SSM outputs.

### SMOKE-03

If the smoke fails, the workflow job fails. There is no automatic rollback (out of scope per proposal §4). The user investigates via the GitHub Actions logs.

---

## ROLLOUT — One-time manual steps (documented in proposal §3)

### ROLLOUT-01

A `## Rollout (one-time)` section MUST exist at the end of `proposal.md` documenting the 6 manual steps (merge PR → CDK deploy → read SSM → set GitHub repo variable → set smoke secrets → enable branch protection).

### ROLLOUT-02

The rollout MUST NOT require any change to existing local-deploy workflow. The user can still run `npx serverless deploy --stage prod` from their machine after the change ships.

### ROLLOUT-03

The proposal MUST list a follow-up SDD candidate for tightening the IAM policy from `AdministratorAccess` to least-privilege serverless-deploy actions.

---

## Scenarios

### S-01 — PR opened, validation runs

**Given** the workflow is in `main` and a contributor opens a PR
**When** GitHub triggers the `CI / validate` job
**Then** the job checks out, installs deps, runs `format:check`, `typecheck`, `build`, and posts a green check on the PR within ~5 minutes.

### S-02 — PR fails typecheck

**Given** a PR introduces a TS error
**When** CI runs
**Then** the `typecheck` step exits non-zero, the job is red, and GitHub blocks merge (if branch protection is configured).

### S-03 — Push to main triggers deploy

**Given** a PR is merged to main
**When** GitHub triggers `Deploy backend / deploy`
**Then** the job assumes the OIDC role, reads 5 SSM parameters, runs `serverless deploy --stage prod`, and runs the smoke. All steps green → deploy complete.

### S-04 — Concurrent deploys

**Given** a deploy is in-flight when a second push lands
**When** GitHub evaluates concurrency
**Then** the in-flight job continues to completion (cancel-in-progress: false). The second push queues a new job that starts after the first finishes.

### S-05 — Role ARN not configured in GitHub vars

**Given** the user has not set `vars.AWS_DEPLOY_ROLE_ARN`
**When** the deploy workflow runs
**Then** `configure-aws-credentials` fails because `role-to-assume` resolves to empty. The job fails with a clear error pointing the user to repo Settings → Variables.

### S-06 — Trust policy rejects PR from fork

**Given** an external user opens a PR from a fork (or a feature branch)
**When** the deploy workflow tries to assume the role
**Then** STS denies the assume because `sub` does not match `repo:KevinSuasnabar/smart-wallet:ref:refs/heads/main`. The job fails safely. PRs from forks do NOT have `id-token: write` permission by default anyway, but the trust policy is the second layer of defense.

### S-07 — Smoke fails after deploy

**Given** the deploy succeeds but the smoke detects a regression
**When** `pnpm smoke:prod` exits non-zero
**Then** the job fails, GitHub emails the actor, the prod environment is left in the deployed state (no auto-rollback). The user investigates and manually restores via `git revert` + new deploy.

### S-08 — CDK redeploys the OIDC construct

**Given** the construct is already deployed once and a contributor changes the role's permissions
**When** the user re-runs `cdk deploy`
**Then** the role is updated in place. The SSM parameter value stays the same (role ARN is stable). No GitHub config change needed.

### S-09 — `format:check` finds drift

**Given** a contributor commits without running `pnpm format` first
**When** CI runs
**Then** `pnpm format:check` finds drift, the job fails, the contributor runs `pnpm format` locally and pushes a fixup commit.

---

## Glossary

- **OIDC (OpenID Connect)**: federated authentication. GitHub Actions signs an identity token; AWS STS validates it against the configured OIDC provider and issues short-lived (~1 hour) credentials.
- **Trust policy**: the `AssumeRolePolicyDocument` of an IAM role — WHO can assume. Distinct from the role's permissions policy (WHAT it can do).
- **`sub` claim**: GitHub's identifier of the workflow context, format `repo:OWNER/REPO:ref:refs/heads/BRANCH` (or `:pull_request`, `:environment:NAME`, etc.).
- **Branch protection**: a GitHub-side rule that blocks merges until configured status checks pass. Not enforced by this SDD — the user enables it once in repo Settings.
- **Concurrency group**: GitHub's mechanism to serialize / cancel runs sharing the same key.
