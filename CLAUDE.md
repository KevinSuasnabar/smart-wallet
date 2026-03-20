# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install dependencies
npm install

# Create a new function stack
npm run create-stack

# Deploy all services (requires AWS credentials)
serverless deploy

# Deploy a specific service
cd stacks/expenses && serverless deploy

# Local development (from a stack directory)
cd stacks/expenses && serverless offline

# Full local dev with compose
serverless compose dev
```

There is no test runner configured yet (`npm test` exits with error).

## Architecture

This is a **monorepo serverless backend** on AWS Lambda/API Gateway using Serverless Framework v4 and npm workspaces.

### Structure

```
infra/apiGateway/    # Shared HTTP API Gateway (AWS API Gateway V2)
layers/shared/       # Lambda layer with shared utilities (@lambda-project/shared)
stacks/              # Individual function stacks (one per domain/microservice)
scripts/             # create-stack.sh to scaffold new stacks
bootstrap-templates/ # Templates used by create-stack.sh
serverless-compose.yml  # Orchestrates deployment order
```

### Deployment Order (via `serverless-compose.yml`)

1. `layers/shared` — Lambda layer deployed first
2. `infra/apiGateway` — Shared HTTP API Gateway (depends on layer)
3. `stacks/expenses` (and future stacks) — Functions (depends on both above)

### Adding a New Stack

Run `npm run create-stack` which scaffolds from `bootstrap-templates/`. Each stack:
- Has its own `serverless.yml` referencing the shared API Gateway and shared layer
- Uses esbuild to bundle TypeScript
- Imports shared utilities via `@lambda-project/shared` (path alias resolved to `layers/shared/src`)

### Shared Layer (`@lambda-project/shared`)

Provides HTTP response helpers: `ok`, `created`, `badRequest`, `notFound`, `internalError`. Import in handlers:

```typescript
import { ok, badRequest } from "@lambda-project/shared";
```

### TypeScript Path Alias

The root `tsconfig.json` maps `@lambda-project/shared` → `layers/shared/src` for IDE support. The `serverless.yml` in each stack replicates this alias for the esbuild bundler.
