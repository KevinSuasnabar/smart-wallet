# Smart Wallet

Personal expense and budget tracking — Clean Architecture + DDD on AWS serverless.

App web mobile-first para llevar control personal de ingresos y gastos, con la capacidad de crear sub-presupuestos por proyecto (ej: "Remodelar cocina") y trackear gastos contra ese presupuesto.

## Stack

- **Frontend**: React + Vite + TypeScript + Tailwind v3 + shadcn/ui
- **Backend**: AWS Lambda (Node.js + TypeScript) + API Gateway HTTP API + DynamoDB single-table
- **Auth**: AWS Cognito User Pool
- **IaC**: AWS CDK (TypeScript) — recursos no-Lambda
- **Lambdas**: Serverless Framework — coordina con CDK vía SSM
- **CI/CD**: GitHub Actions con OIDC → AWS
- **Repo**: monorepo pnpm + Turborepo

## Estructura

```
packages/
  domain/         # Entidades, value objects, casos de uso (puro DDD)
  api/            # Lambda handlers (Serverless Framework)
  web/            # React app (Vite)
  infra-cdk/      # CDK stacks (recursos no-Lambda)
  infra-sls/      # Serverless Framework config
  shared-types/   # Contratos compartidos front/back (Zod schemas)
```

## Setup

Requiere Node 22, pnpm 10, Docker.

```bash
nvm use                # carga node 22 desde .nvmrc
pnpm install           # instala todas las dependencias
cp .env.example .env.local
pnpm ddb:up            # arranca DynamoDB Local + admin GUI
```

## Comandos

| Comando | Descripción |
|---|---|
| `pnpm build` | Build de todos los packages |
| `pnpm dev` | Modo desarrollo (todos los servicios) |
| `pnpm test` | Tests de todos los packages |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | TypeScript check |
| `pnpm format` | Prettier write |
| `pnpm ddb:up` | DynamoDB Local + admin en `localhost:8001` |
| `pnpm ddb:down` | Para los contenedores |

## Workflow

Spec-Driven Development (SDD) interactivo. Issues y milestones en [Linear](https://linear.app/projects-tomoshiro/project/smart-wallet-mvp-20e6e3ef7ee1).

## Estándares

- **Clean Architecture** + **Hexagonal (Ports & Adapters)** con dependency rule estricta
- **DDD**: agregados, entidades, value objects, domain events
- **SOLID** + Clean Code
- **Conventional commits** (validados por commitlint en pre-commit hook)
- **Lighthouse mobile ≥ 90** como meta
- **Free tier AWS** + Budget alarm

## Ambientes

Solo **prod**. Desarrollo local con DynamoDB Local (Docker) — no se prueba en la nube hasta deploy.
