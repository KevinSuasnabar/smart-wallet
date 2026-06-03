# CI/CD — Design

## 1. File tree

```
.github/workflows/
├── ci.yml                                              # NEW — PR + push validation
└── deploy-backend.yml                                  # NEW — push to main → deploy

packages/infra-cdk/src/
├── constructs/
│   └── GithubOidcRole.ts                               # NEW — OIDC provider + IAM role
└── stacks/
    └── SmartWalletStack.ts                             # MODIFY — instantiate GithubOidcRole

packages/infra-sls/smoke-tests/
└── smoke-prod.sh                                       # MODIFY — make AWS_PROFILE optional (CI uses OIDC env vars instead)

openspec/changes/ci-cd/
└── proposal.md                                         # already written; includes rollout section
```

## 2. Discovery from exploration

Two facts changed the design vs the initial proposal:

### 2.1 `smoke-prod.sh` already creates ephemeral Cognito users

The existing script reads SSM, creates a random `smoke-{uuid}@smart-wallet.test` user, runs 12 smoke steps, then deletes the user via a `trap` cleanup. **No `SMOKE_TEST_EMAIL` / `SMOKE_TEST_PASSWORD` secrets are needed.** The proposal mentioned them as a backup plan; this design drops them. The OIDC role's `AdministratorAccess` already grants `cognito-idp:AdminCreateUser` + `AdminDeleteUser`.

### 2.2 The script requires `AWS_PROFILE` and uses `--profile` on every aws CLI call

In CI with OIDC, there is no profile — credentials live in env vars (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`) set by `configure-aws-credentials@v4`. The script must be edited to make `--profile` optional.

**Minimal patch** to `smoke-prod.sh`:

```bash
# Replace this:
: "${AWS_PROFILE:?Set AWS_PROFILE (e.g. AWS_PROFILE=tomishi-account)}"

# With this:
AWS_PROFILE="${AWS_PROFILE:-}"
if [[ -n "$AWS_PROFILE" ]]; then
  AWS_CLI_ARGS=(--profile "$AWS_PROFILE")
else
  # CI context — credentials come from env vars set by configure-aws-credentials.
  AWS_CLI_ARGS=()
fi
```

Then replace every `--profile "$AWS_PROFILE"` with `"${AWS_CLI_ARGS[@]}"`. About 8 occurrences.

This keeps the script backward-compatible for local runs (user still exports `AWS_PROFILE=tomishi-account`).

## 3. `.github/workflows/ci.yml`

```yaml
name: CI

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  validate:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 10

      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: pnpm

      - name: Install
        run: pnpm install --frozen-lockfile

      - name: Format check
        run: pnpm format:check

      - name: Typecheck
        run: pnpm typecheck

      - name: Build
        run: pnpm build
```

Notes:

- `pnpm typecheck` uses Turbo with `dependsOn: [^build]` per `turbo.json` — so build dependencies are emitted first. Turbo caches across steps inside the same job.
- No `id-token: write` — CI doesn't need AWS.
- `cache: pnpm` on setup-node uses pnpm's lockfile to key the cache. Cache hits on lock-stable PRs.
- No `format:write`. CI only checks; formatting is the contributor's responsibility.

## 4. `.github/workflows/deploy-backend.yml`

```yaml
name: Deploy backend

on:
  push:
    branches: [main]

permissions:
  id-token: write
  contents: read

concurrency:
  group: deploy-backend
  cancel-in-progress: false

jobs:
  deploy:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 10

      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: pnpm

      - name: Install
        run: pnpm install --frozen-lockfile

      - name: Build
        run: pnpm build

      - name: Configure AWS credentials (OIDC)
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ vars.AWS_DEPLOY_ROLE_ARN }}
          aws-region: us-east-1
          role-session-name: smart-wallet-deploy-${{ github.run_id }}

      - name: Read SSM parameters
        id: ssm
        run: |
          set -euo pipefail
          P=/smart-wallet/prod
          get() { aws ssm get-parameter --name "$1" --query Parameter.Value --output text; }
          {
            echo "table_name=$(get $P/dynamo/table-name)"
            echo "table_arn=$(get $P/dynamo/table-arn)"
            echo "gsi1_name=$(get $P/dynamo/gsi1-name)"
            echo "issuer_url=$(get $P/cognito/issuer-url)"
            echo "client_id=$(get $P/cognito/user-pool-client-id)"
          } >> "$GITHUB_OUTPUT"

      - name: Deploy serverless
        working-directory: packages/infra-sls
        env:
          TABLE_NAME: ${{ steps.ssm.outputs.table_name }}
          TABLE_ARN: ${{ steps.ssm.outputs.table_arn }}
          GSI1_NAME: ${{ steps.ssm.outputs.gsi1_name }}
          COGNITO_ISSUER_URL: ${{ steps.ssm.outputs.issuer_url }}
          COGNITO_CLIENT_ID: ${{ steps.ssm.outputs.client_id }}
        run: npx serverless deploy --stage prod

      - name: Smoke prod
        run: pnpm smoke:prod
```

Notes:

- `pnpm smoke:prod` reads its own SSM values internally; it doesn't need anything piped in. The `AWS_PROFILE` requirement is removed by the script patch (see §2.2).
- `role-session-name` makes CloudTrail entries grep-able (includes the GitHub run id).
- No `if: success()` — GitHub treats failed prior steps as job failure by default; smoke only runs if deploy succeeded.

## 5. `GithubOidcRole` construct

```ts
import { Construct } from 'constructs';
import { CfnOutput } from 'aws-cdk-lib';
import {
  OpenIdConnectProvider,
  Role,
  FederatedPrincipal,
  ManagedPolicy,
} from 'aws-cdk-lib/aws-iam';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';

export interface GithubOidcRoleProps {
  /** GitHub owner/repo. Example: "KevinSuasnabar/smart-wallet". */
  repository: string;
  /** SSM parameter where the role ARN gets published. */
  ssmParameterName: string;
}

/**
 * Federated IAM role that GitHub Actions can assume via OpenID Connect.
 * No long-lived AWS credentials are stored in GitHub — each workflow run
 * trades its short-lived OIDC token for a 1-hour STS session.
 *
 * Trust policy:
 *   - Federated principal: the OIDC provider for token.actions.githubusercontent.com
 *   - aud claim must equal sts.amazonaws.com
 *   - sub claim must match repo:{repository}:ref:refs/heads/main
 *     (no PR branches, no forks, no environments other than main)
 *
 * Permissions: AdministratorAccess. The trust policy is the security
 * boundary; the permissions policy is intentionally broad for v1.
 * Tightening to least-privilege for `serverless deploy` is a follow-up SDD.
 */
export class GithubOidcRole extends Construct {
  readonly role: Role;
  readonly ssmParameter: StringParameter;

  constructor(scope: Construct, id: string, props: GithubOidcRoleProps) {
    super(scope, id);

    const provider = new OpenIdConnectProvider(this, 'Provider', {
      url: 'https://token.actions.githubusercontent.com',
      clientIds: ['sts.amazonaws.com'],
    });

    this.role = new Role(this, 'Role', {
      roleName: 'smart-wallet-github-actions-deploy',
      description:
        'Assumable by GitHub Actions on push to main of smart-wallet repo (OIDC federated).',
      assumedBy: new FederatedPrincipal(
        provider.openIdConnectProviderArn,
        {
          StringEquals: {
            'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
          },
          StringLike: {
            'token.actions.githubusercontent.com:sub': `repo:${props.repository}:ref:refs/heads/main`,
          },
        },
        'sts:AssumeRoleWithWebIdentity',
      ),
      managedPolicies: [ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess')],
    });

    this.ssmParameter = new StringParameter(this, 'RoleArnSsm', {
      parameterName: props.ssmParameterName,
      stringValue: this.role.roleArn,
      description: 'IAM role ARN for GitHub Actions OIDC deploys',
    });

    new CfnOutput(this, 'GithubActionsRoleArn', {
      value: this.role.roleArn,
      description: 'Paste this into GitHub repo Settings → Variables → AWS_DEPLOY_ROLE_ARN',
    });
  }
}
```

Considerations:

- **OIDC provider uniqueness**: AWS only allows ONE provider per URL per account. If another stack already created one for `token.actions.githubusercontent.com`, this stack will fail. For this repo's account (used only by smart-wallet) the create is safe. If you later add a second project, factor the provider out into a shared stack OR use `OpenIdConnectProvider.fromOpenIdConnectProviderArn(...)` to look up the existing one.
- **Role name fixed**: `smart-wallet-github-actions-deploy`. CDK will let you change props in place; renaming via CDK would create a new role + leave the old one orphaned, so keep this stable.

## 6. `SmartWalletStack` change

```ts
// existing imports
import { GithubOidcRole } from '../constructs/GithubOidcRole.js';

// inside the constructor, after SsmParameters:
new GithubOidcRole(this, 'GithubOidc', {
  repository: 'KevinSuasnabar/smart-wallet',
  ssmParameterName: `${prefix}/github-actions-role-arn`,
});
```

`prefix` already exists as `/smart-wallet/prod` per the existing code.

## 7. `smoke-prod.sh` patch

Only one diff worth highlighting:

```diff
 # ---------- Config ----------
-: "${AWS_PROFILE:?Set AWS_PROFILE (e.g. AWS_PROFILE=tomishi-account)}"
+# AWS_PROFILE is optional. When unset (e.g. CI with OIDC), the aws CLI uses
+# env-var credentials (AWS_ACCESS_KEY_ID etc.) set by configure-aws-credentials.
+AWS_PROFILE="${AWS_PROFILE:-}"
+if [[ -n "$AWS_PROFILE" ]]; then
+  AWS_CLI_ARGS=(--profile "$AWS_PROFILE")
+else
+  AWS_CLI_ARGS=()
+fi
 AWS_REGION="${AWS_REGION:-us-east-1}"
```

Then every `--profile "$AWS_PROFILE"` becomes `"${AWS_CLI_ARGS[@]}"`. ~8 substitutions.

## 8. Rollout

These steps run ONCE after merge. Documented in proposal.md §3 but reproduced here for the apply task:

1. **Mergear el PR.**
2. **Deploy CDK** desde local: `AWS_PROFILE=tomishi-account pnpm --filter @smart-wallet/infra-cdk deploy`. Crea el OIDC provider + role + SSM param + CfnOutput.
3. **Leer el role ARN**:
   ```bash
   aws ssm get-parameter \
     --name /smart-wallet/prod/github-actions-role-arn \
     --query Parameter.Value --output text \
     --region us-east-1 --profile tomishi-account
   ```
4. **GitHub repo Settings → Secrets and variables → Actions → Variables**:
   - Crear variable `AWS_DEPLOY_ROLE_ARN` con el ARN del paso 3.
5. **Branch protection** (opcional): `Settings → Branches → main`:
   - Marcar "Require status checks to pass" + seleccionar `CI / validate`.
6. **Validar**: abrir un PR trivial (cambio de README) y verificar que `CI / validate` corre y queda verde. Después, mergeás y verificás que `Deploy backend / deploy` corre verde también.

## 9. Cross-cutting decisions

| Decisión                                | Razón                                                                                                                                                         |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AdministratorAccess` en el role        | Trust policy ya acota a este repo+branch. Least-privilege es follow-up SDD.                                                                                   |
| `cancel-in-progress: false` para deploy | Un deploy a medias deja CloudFormation en un estado raro. Mejor terminar el actual y luego correr el siguiente.                                               |
| `cancel-in-progress: true` para CI      | PR pushes seguidos cancelan el job viejo — no aporta nada validar el commit intermedio.                                                                       |
| Sin retry policy                        | Si el deploy falla, el usuario investiga. Retries automáticos enmascaran problemas (e.g. quota issues).                                                       |
| Smoke en el mismo job que deploy        | Si quedara en job separado, perderíamos visibilidad inmediata. Tradeoff: el smoke depende del deploy step succeeding, lo cual es exactamente lo que queremos. |
| Sin matriz de Node                      | El proyecto solo soporta Node 22. Probar contra otras versiones no agrega valor.                                                                              |
| `frozen-lockfile`                       | Detecta drift del lockfile en CI. Si alguien commitea cambios al package.json sin regenerar lockfile, CI lo agarra.                                           |
| Sin `pnpm lint`                         | No hay ESLint configurado en los paquetes. Cuando se agregue, se enchufa.                                                                                     |
| Token de GitHub sin scopes extra        | `permissions: contents: read` es el mínimo. CI no necesita escribir comentarios, releases, ni packages.                                                       |

## 10. Risks revisited

- **GitHub Actions free tier**: 2000 minutes/mes para repos privados. Este repo es público (presumiblemente sin charge). Validar antes del merge.
- **OIDC provider exists ya en la cuenta**: si está, `cdk deploy` falla. Mitigación: si ocurre, cambiar el construct para usar `fromOpenIdConnectProviderArn`. No bloquea el v1.
- **Role name colisión**: si la cuenta ya tiene un role llamado `smart-wallet-github-actions-deploy`, falla. La cuenta es dedicada a smart-wallet, no debería ocurrir.
- **Smoke crea/borra users en cada deploy**: cada deploy a main genera un user efímero. Si el deploy se aborta entre create y delete, queda un user huérfano. La cleanup `trap` minimiza esto. Aceptable.
- **`--frozen-lockfile` rompe contributors externos** que olviden regenerar el lockfile: la solución es correr `pnpm install` localmente antes del commit. CI lo guía con el error message.

## 11. LOC estimate (refined)

| Archivo                                                      | LOC      |
| ------------------------------------------------------------ | -------- |
| `.github/workflows/ci.yml`                                   | ~40      |
| `.github/workflows/deploy-backend.yml`                       | ~75      |
| `packages/infra-cdk/src/constructs/GithubOidcRole.ts`        | ~70      |
| `packages/infra-cdk/src/stacks/SmartWalletStack.ts` (modify) | +6       |
| `packages/infra-sls/smoke-tests/smoke-prod.sh` (modify)      | +10/-8   |
| **Total**                                                    | **~205** |

Single PR. Bajo budget.
