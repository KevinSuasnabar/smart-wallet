# CI/CD — Proposal

## 1. Intent

Automatizar dos flujos que hoy se corren a mano:

1. **Validación de PRs**: lint + typecheck + build de todos los paquetes en cada PR contra `main`. Hoy esto se corre localmente y depende de la disciplina del autor; CI lo blinda y permite configurar branch protection.
2. **Deploy del backend a prod**: cuando se mergea a `main`, `serverless deploy --stage prod` corre solo. Hoy el usuario hace el deploy a mano exportando 5 SSM env vars + AWS_PROFILE. CI elimina ese paso manual.

Cumple Task #5 (pendiente desde el inicio del repo). Cero infra adicional fuera de un IAM role nuevo en CDK.

## 2. Scope

### In

- **`.github/workflows/ci.yml`** — corre en `pull_request` contra main y en `push` a main (badge fresco). Steps: checkout, setup node 22 + pnpm 10, restore cache, install (`--frozen-lockfile`), `pnpm typecheck` (turbo), `pnpm build` (turbo), `pnpm format:check`. Sin tests (no existen en el repo).
- **`.github/workflows/deploy-backend.yml`** — corre en `push` a main. Steps: checkout, setup, install, build, asume IAM role via OIDC, lee 5 SSM parameters, export como env vars, `npx serverless deploy --stage prod` (en `packages/infra-sls`), smoke check post-deploy contra el endpoint Cognito.
- **`GithubOidcRole` construct nuevo** en CDK: crea (o reutiliza) el OIDC provider de GitHub (`token.actions.githubusercontent.com`), un IAM Role con trust policy condicionada a `repo:KevinSuasnabar/smart-wallet:*` (con condicional adicional `ref:refs/heads/main` para acciones de deploy si la action lo declara), permisos para `cloudformation:*` (deploy stack), `lambda:*`, `apigateway:*`, `iam:PassRole`, `s3:*` (deployment bucket de serverless), `logs:*`, `ssm:GetParameter` sobre el prefix `/smart-wallet/prod/*`, y `dynamodb:DescribeTable`.
- **CDK output + SSM**: el ARN del role queda como CfnOutput **y** como SSM parameter `/smart-wallet/prod/github-actions-role-arn`. El usuario lo lee una vez y lo configura como `vars.AWS_DEPLOY_ROLE_ARN` en GitHub repo settings.
- **`packages/infra-sls/smoke-tests/smoke-prod.sh`** se invoca en el deploy workflow después del `serverless deploy` exitoso, contra el endpoint prod. Si el smoke falla, el job falla (alerta visible).
- **Documentación del rollout**: una sección al final del proposal con los pasos manuales que el usuario hace UNA vez (deploy CDK, copiar role ARN, configurar GitHub).

### Out

- **Deploy del frontend**: queda fuera. La task #16 (CloudFront distribution + S3 bucket + CDK changes) es otro SDD aparte. Por ahora el usuario sigue corriendo el frontend en local.
- **Rollback automático**: si el deploy o el smoke falla, queda en estado fallido y el usuario investiga. No auto-revert.
- **Tests en CI**: no hay tests en el repo todavía. Cuando los haya se agregan al workflow.
- **Preview environments por PR**: out of scope; un deploy stack por PR es caro y no agrega valor para una app personal.
- **Slack/email notifications**: GitHub ya manda email al autor en cada job fail; no agregamos integraciones.
- **Secrets clásicos AWS** (AKIA…): explícitamente NO — OIDC es la única forma soportada.
- **Migración del workflow del frontend (npm run build → CloudFront sync)**: para el futuro deploy-frontend SDD.
- **`pnpm lint`**: hoy en root `package.json` está como script pero `turbo run lint` no encuentra task `lint` configurada en los paquetes (no hay ESLint scripts en los package.json individuales). El workflow corre `format:check` + `typecheck` + `build` para asegurar correctness. Si más adelante se agrega ESLint, se enchufa.

## 3. Approach

### Workflow `ci.yml` — runs on every PR + push to main

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
        with: { version: 10 }
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm format:check
      - run: pnpm typecheck
      - run: pnpm build
```

### Workflow `deploy-backend.yml` — runs only on push to main

```yaml
name: Deploy backend
on:
  push:
    branches: [main]

concurrency:
  group: deploy-backend
  cancel-in-progress: false  # don't cancel a running deploy

permissions:
  id-token: write    # required for OIDC
  contents: read

jobs:
  deploy:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 10 }
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ vars.AWS_DEPLOY_ROLE_ARN }}
          aws-region: us-east-1
      - name: Read SSM parameters
        id: ssm
        run: |
          PREFIX=/smart-wallet/prod
          echo "table_name=$(aws ssm get-parameter --name $PREFIX/dynamo/table-name --query Parameter.Value --output text)" >> "$GITHUB_OUTPUT"
          echo "table_arn=$(aws ssm get-parameter --name $PREFIX/dynamo/table-arn --query Parameter.Value --output text)" >> "$GITHUB_OUTPUT"
          echo "gsi1_name=$(aws ssm get-parameter --name $PREFIX/dynamo/gsi1-name --query Parameter.Value --output text)" >> "$GITHUB_OUTPUT"
          echo "issuer_url=$(aws ssm get-parameter --name $PREFIX/cognito/issuer-url --query Parameter.Value --output text)" >> "$GITHUB_OUTPUT"
          echo "cognito_client_id=$(aws ssm get-parameter --name $PREFIX/cognito/user-pool-client-id --query Parameter.Value --output text)" >> "$GITHUB_OUTPUT"
      - name: Deploy serverless
        env:
          TABLE_NAME: ${{ steps.ssm.outputs.table_name }}
          TABLE_ARN: ${{ steps.ssm.outputs.table_arn }}
          GSI1_NAME: ${{ steps.ssm.outputs.gsi1_name }}
          COGNITO_ISSUER_URL: ${{ steps.ssm.outputs.issuer_url }}
          COGNITO_CLIENT_ID: ${{ steps.ssm.outputs.cognito_client_id }}
        working-directory: packages/infra-sls
        run: npx serverless deploy --stage prod
      - name: Smoke prod
        env:
          # smoke-prod.sh needs the API URL and a Cognito test user; both
          # come from SSM. Setup is documented in the rollout section.
          API_BASE_URL: ${{ steps.ssm.outputs.api_base_url }}
          COGNITO_TEST_EMAIL: ${{ secrets.SMOKE_TEST_EMAIL }}
          COGNITO_TEST_PASSWORD: ${{ secrets.SMOKE_TEST_PASSWORD }}
          COGNITO_CLIENT_ID: ${{ steps.ssm.outputs.cognito_client_id }}
        run: pnpm smoke:prod
```

Nota: la URL del API también vive en SSM (CFN output del stack de serverless). Si todavía no existe ese parameter, el smoke se ejecuta con un fallback que infiere la URL del `cdk-outputs.json` (lo dejamos definitivo en design.md).

### `GithubOidcRole` construct

```ts
import { Construct } from 'constructs';
import { Stack } from 'aws-cdk-lib';
import {
  OpenIdConnectProvider,
  Role,
  PolicyStatement,
  FederatedPrincipal,
  Effect,
  ManagedPolicy,
} from 'aws-cdk-lib/aws-iam';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { CfnOutput } from 'aws-cdk-lib';

export interface GithubOidcRoleProps {
  /** Owner/repo to scope the trust policy (e.g. "KevinSuasnabar/smart-wallet"). */
  repository: string;
  /** SSM parameter to publish the resulting role ARN under. */
  ssmParameterName: string;
}

export class GithubOidcRole extends Construct {
  readonly role: Role;
  constructor(scope: Construct, id: string, props: GithubOidcRoleProps) {
    super(scope, id);
    const provider = new OpenIdConnectProvider(this, 'Provider', {
      url: 'https://token.actions.githubusercontent.com',
      clientIds: ['sts.amazonaws.com'],
    });
    this.role = new Role(this, 'Role', {
      roleName: 'smart-wallet-github-actions-deploy',
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
    });
    // Permission grants — see design.md for the full minimal IAM policy
    // (CloudFormation, Lambda, APIGW, IAM PassRole, S3, Logs, SSM read).
    this.role.addManagedPolicy(
      ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess'),
    );
    // ↑ Start coarse; the design doc proposes a tighter scope but the
    //   first-shippable version uses AdministratorAccess because writing a
    //   correct serverless-deploy least-privilege policy is its own SDD.
    //   The trust policy already restricts WHO can assume it.
    new StringParameter(this, 'RoleArnSsm', {
      parameterName: props.ssmParameterName,
      stringValue: this.role.roleArn,
    });
    new CfnOutput(this, 'RoleArn', { value: this.role.roleArn });
  }
}
```

Decisión grande aquí: arrancamos con `AdministratorAccess`. La trust policy ya está blindada por repo+branch+OIDC, así que el blast radius está acotado al fork del repo. Ajustar a IAM least-privilege para serverless deploy es un follow-up (es otro SDD entero por la cantidad de actions necesarias).

### Cambios en `SmartWalletStack`

Agrega el construct nuevo:

```ts
new GithubOidcRole(this, 'GithubOidc', {
  repository: 'KevinSuasnabar/smart-wallet',
  ssmParameterName: `${prefix}/github-actions-role-arn`,
});
```

### Rollout order (manual, una sola vez)

1. **Mergear el PR** de este SDD.
2. **Deploy CDK**: en local, `pnpm --filter @smart-wallet/infra-cdk deploy` (o `cdk deploy`). Crea el OIDC provider, el role, y publica el ARN en SSM + CfnOutput.
3. **Leer el role ARN**: `aws ssm get-parameter --name /smart-wallet/prod/github-actions-role-arn --query Parameter.Value --output text`.
4. **Configurar GitHub**: en `Settings → Secrets and variables → Actions → Variables`, agregar `AWS_DEPLOY_ROLE_ARN` con el valor del paso anterior.
5. **Smoke secrets** (si querés smoke post-deploy): en `Settings → Secrets`, agregar `SMOKE_TEST_EMAIL` y `SMOKE_TEST_PASSWORD` con un usuario de Cognito reservado para pruebas.
6. **Branch protection** (opcional pero recomendado): `Settings → Branches → main`: marcar "Require status checks to pass" y seleccionar `CI / validate`.

A partir del próximo merge a main, deploy y smoke corren solos.

## 4. Key decisions

| Decisión | Elegido | Alternativa | Razón |
|---|---|---|---|
| Mecanismo de credenciales | GitHub OIDC | Access keys long-lived | Práctica estándar AWS 2022+. Sin secrets que filtrar. |
| Permisos IAM iniciales | `AdministratorAccess` | Least-privilege custom | El least-privilege de serverless deploy son ~30 actions distintas. Hacerlo bien es otro SDD. La trust policy ya acota el blast radius a este repo+branch. |
| Trust condition | `ref:refs/heads/main` | Cualquier ref del repo | Solo deploys desde main pueden asumir el role. PRs no necesitan asumir. |
| Source de env vars | SSM | GitHub secrets | SSM es la fuente única de verdad (CDK las crea). Cero duplicación. |
| Deploy frontend | OUT | Incluido | Task #16 es un SDD aparte con CDK changes (CloudFront + S3). |
| Smoke post-deploy | Incluido | Out | Vale el job extra: detecta drift inmediato (e.g. JWT roto, env var faltante). El secret SMOKE_TEST_* es una sola configuración inicial. |
| `pnpm lint` en CI | NO | SÍ | No hay scripts `lint` configurados en los paquetes (turbo run lint = no-op). Si después se agrega ESLint, se enchufa. |
| Concurrency en deploy | `cancel-in-progress: false` | true | Un deploy en curso NO debe cancelarse — riesgo de medio-deploy. PRs sí pueden cancelarse. |
| Frequency de validación | Cada PR + cada push a main | Solo PRs | Push a main mantiene el badge verde y atrapa hot-fixes que esquiven la PR. |

## 5. Risks

- **OIDC provider ya existe en la cuenta**: Si otro stack ya creó el provider para GitHub, CDK falla. Solución en design.md: `try` import existente con `OpenIdConnectProvider.fromOpenIdConnectProviderArn`. Para este repo no aplica (cuenta vacía), pero documentado.
- **Deploy a mano sigue funcionando**: el role asumible localmente no cambia. El usuario puede seguir corriendo `npx serverless deploy --stage prod` desde su máquina si necesita override.
- **Branch protection no se configura automático**: GitHub no soporta CDK/Terraform para esto desde la cuenta personal (solo Enterprise via API). El usuario lo activa una vez a mano. Documentado en rollout.
- **`AdministratorAccess` es amplio**: pero acotado por trust policy. Mitigación a futuro: SDD aparte para least-privilege policy. Aceptable para una app personal.
- **Smoke depende de un usuario Cognito**: si ese usuario se elimina o cambia su contraseña, el smoke falla. Aceptable: alerta clara, el usuario lo restaura.

## 6. LOC estimate

| Área | LOC |
|---|---|
| `.github/workflows/ci.yml` | ~50 |
| `.github/workflows/deploy-backend.yml` | ~85 |
| `packages/infra-cdk/src/constructs/GithubOidcRole.ts` | ~70 |
| `packages/infra-cdk/src/stacks/SmartWalletStack.ts` | +10 |
| Total | **~215** |

Single PR. Bajo budget.

## 7. Open questions (none)

Todas las decisiones de scope/credenciales/permisos cerradas en §4.
