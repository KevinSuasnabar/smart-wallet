#!/bin/bash

set -e

ROOT=$(pwd)
YELLOW="\033[33m"
GREEN="\033[32m"
RED="\033[31m"
ENDCOLOR="\033[0m"

echo -e "${YELLOW}Initializing Lambda project base...${ENDCOLOR}"

# ─── Validar que se corre desde la raíz del proyecto ───────────────────────
if [[ ! -f "package.json" ]]; then
  echo -e "${RED}Error: debes ejecutar este script desde la raíz del proyecto.${ENDCOLOR}"
  exit 1
fi

# ─── Limpiar archivos por defecto de Serverless ────────────────────────────
rm -f handler.ts handler.js serverless.yml
rm -rf src

read -p "Nombre del proyecto (ej: my-lambda-project): " PROJECT_NAME
read -p "Org de Serverless Dashboard (dejar vacío si no usas): " SLS_ORG
read -p "App de Serverless Dashboard (dejar vacío si no usas): "  SLS_APP

SLS_HEADER=""
if [[ -n "$SLS_ORG" && -n "$SLS_APP" ]]; then
  SLS_HEADER="org: $SLS_ORG\napp: $SLS_APP\n"
fi

# ─── Crear estructura de directorios ───────────────────────────────────────
echo -e "${YELLOW}Creating folder structure...${ENDCOLOR}"

mkdir -p infra/apiGateway
mkdir -p layers/shared/src
mkdir -p stacks
mkdir -p bootstrap-templates
mkdir -p scripts

# ─── serverless-compose.yml ────────────────────────────────────────────────
cat > serverless-compose.yml <<EOF
services:
  sharedLayer:
    path: layers/shared

  apiGateway:
    path: infra/apiGateway
    dependsOn: sharedLayer
EOF

# ─── tsconfig.json ─────────────────────────────────────────────────────────
cat > tsconfig.json <<EOF
{
  "compilerOptions": {
    "target": "ES2024",
    "module": "commonjs",
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "strict": true,
    "skipLibCheck": true,
    "baseUrl": ".",
    "paths": {
      "@lambda-project/shared": ["layers/shared/src"]
    }
  }
}
EOF

# ─── package.json ──────────────────────────────────────────────────────────
node -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
pkg.name = '$PROJECT_NAME';
pkg.description = '';
pkg.workspaces = ['layers/*', 'stacks/*'];
pkg.scripts = pkg.scripts || {};
pkg.scripts['create-stack'] = 'bash scripts/create-stack.sh';
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
"

# ─── infra/apiGateway/serverless.yml ───────────────────────────────────────
cat > infra/apiGateway/serverless.yml <<EOF
${SLS_HEADER}service: $PROJECT_NAME-api-gateway

provider:
  name: aws
  stage: \${opt:stage, "dev"}

resources:
  Resources:
    SharedHttpApi:
      Type: AWS::ApiGatewayV2::Api
      Properties:
        Name: $PROJECT_NAME-\${self:provider.stage}
        ProtocolType: HTTP
        CorsConfiguration:
          AllowOrigins:
            - "*"
          AllowMethods:
            - GET
            - POST
            - PUT
            - DELETE
            - OPTIONS
          AllowHeaders:
            - Content-Type
            - Authorization

    SharedHttpApiStage:
      Type: AWS::ApiGatewayV2::Stage
      Properties:
        ApiId: !Ref SharedHttpApi
        StageName: \$default
        AutoDeploy: true

  Outputs:
    HttpApiId:
      Value: !Ref SharedHttpApi
    HttpApiUrl:
      Value: !Sub "https://\${SharedHttpApi}.execute-api.\${AWS::Region}.amazonaws.com"
EOF

# ─── layers/shared/serverless.yml ──────────────────────────────────────────
cat > layers/shared/serverless.yml <<EOF
${SLS_HEADER}service: $PROJECT_NAME-shared-layer

provider:
  name: aws
  runtime: nodejs20.x
  stage: \${opt:stage, "dev"}

layers:
  shared:
    path: src
    name: shared-layer
    description: Shared utilities across all stacks
    compatibleRuntimes:
      - nodejs20.x
EOF

# ─── layers/shared/package.json ────────────────────────────────────────────
cat > layers/shared/package.json <<EOF
{
  "name": "@lambda-project/shared",
  "version": "1.0.0",
  "main": "src/index.ts"
}
EOF

# ─── layers/shared/src/responseBuilder.ts ──────────────────────────────────
cat > layers/shared/src/responseBuilder.ts <<'EOF'
type ResponseBody = Record<string, unknown> | unknown[];

export const ok = (body: ResponseBody) => ({
  statusCode: 200,
  body: JSON.stringify(body),
});

export const created = (body: ResponseBody) => ({
  statusCode: 201,
  body: JSON.stringify(body),
});

export const badRequest = (message: string) => ({
  statusCode: 400,
  body: JSON.stringify({ error: message }),
});

export const notFound = (message: string) => ({
  statusCode: 404,
  body: JSON.stringify({ error: message }),
});

export const internalError = (message = "Internal server error") => ({
  statusCode: 500,
  body: JSON.stringify({ error: message }),
});
EOF

cat > layers/shared/src/index.ts <<'EOF'
export * from "./responseBuilder";
EOF

# ─── bootstrap-templates ───────────────────────────────────────────────────
cat > bootstrap-templates/serverless-template.txt <<EOF
${SLS_HEADER}service: $PROJECT_NAME-{{STACK_NAME}}

custom:
  env:
    dev:
      LOG_LEVEL: debug
    prod:
      LOG_LEVEL: info

provider:
  name: aws
  runtime: nodejs20.x
  stage: \${opt:stage, "dev"}
  httpApi:
    id: \${cf:$PROJECT_NAME-api-gateway-\${self:provider.stage}.HttpApiId}
  environment:
    NODE_ENV: \${self:provider.stage}
    LOG_LEVEL: \${self:custom.env.\${self:provider.stage}.LOG_LEVEL}

build:
  esbuild:
    bundle: true
    minify: false
    sourcemap: true
    alias:
      "@lambda-project/shared": "./layers/shared/src"

functions:
  hello{{STACK_NAME_UPPERCASE}}:
    handler: ./src/hello{{STACK_NAME_UPPERCASE}}.hello{{STACK_NAME_UPPERCASE}}
    events:
      - httpApi:
          path: /{{STACK_NAME}}
          method: get

plugins:
  - serverless-offline
EOF

cat > bootstrap-templates/handler-template.txt <<'EOF'
import { APIGatewayProxyEvent } from "aws-lambda";
import { ok } from "@lambda-project/shared";

export const hello{{STACK_NAME_UPPERCASE}} = async (event: APIGatewayProxyEvent) => {
  return ok({ message: "Hello from {{STACK_NAME}}" });
};
EOF

cat > bootstrap-templates/package-template.txt <<'EOF'
{
  "name": "@lambda-project/{{STACK_NAME}}",
  "version": "1.0.0",
  "dependencies": {
    "@lambda-project/shared": "*"
  }
}
EOF

# ─── scripts/create-stack.sh ───────────────────────────────────────────────
cat > scripts/create-stack.sh <<'SCRIPT'
#!/bin/bash

set -e

ROOT=$(pwd)
YELLOW="\033[33m"
GREEN="\033[32m"
RED="\033[31m"
ENDCOLOR="\033[0m"

function createStack() {
  cd "$ROOT"

  local dirName=$([ "$1" ] && echo "$1" || echo "default")
  local counter=""

  while [[ -d "stacks/$dirName$counter" ]]; do
    if [[ $counter = "" ]]; then
      counter=1
    fi
    counter=$(( counter + 1 ))
  done

  local stackName="$dirName$counter"
  local stackNameUppercase=$(echo "${stackName:0:1}" | tr '[:lower:]' '[:upper:]')${stackName:1}

  echo -e "${YELLOW}Creating stack $stackName...${ENDCOLOR}"

  mkdir -p "stacks/$stackName/src"
  mkdir -p "stacks/$stackName/layer/$stackName/application/usecases"
  mkdir -p "stacks/$stackName/layer/$stackName/domain/entities"
  mkdir -p "stacks/$stackName/layer/$stackName/domain/exceptions"
  mkdir -p "stacks/$stackName/layer/$stackName/domain/repositories"
  mkdir -p "stacks/$stackName/layer/$stackName/domain/services"
  mkdir -p "stacks/$stackName/layer/$stackName/infrastructure/repositories"
  mkdir -p "stacks/$stackName/layer/$stackName/infrastructure/adapters"
  mkdir -p "stacks/$stackName/layer/$stackName/infrastructure/mappers"
  mkdir -p "stacks/$stackName/tests/integration"

  sed -e "s/{{STACK_NAME}}/$stackName/g" \
      -e "s/{{STACK_NAME_UPPERCASE}}/$stackNameUppercase/g" \
      "./bootstrap-templates/serverless-template.txt" > "stacks/$stackName/serverless.yml"

  sed -e "s/{{STACK_NAME}}/$stackName/g" \
      -e "s/{{STACK_NAME_UPPERCASE}}/$stackNameUppercase/g" \
      "./bootstrap-templates/handler-template.txt" > "stacks/$stackName/src/hello${stackNameUppercase}.ts"

  sed "s/{{STACK_NAME}}/$stackName/g" \
      "./bootstrap-templates/package-template.txt" > "stacks/$stackName/package.json"

  echo "" >> serverless-compose.yml
  echo "  $stackName:" >> serverless-compose.yml
  echo "    path: stacks/$stackName" >> serverless-compose.yml
  echo "    dependsOn:" >> serverless-compose.yml
  echo "      - sharedLayer" >> serverless-compose.yml
  echo "      - apiGateway" >> serverless-compose.yml

  echo -e "${GREEN}Stack \"$stackName\" created successfully.${ENDCOLOR}"
}

if [[ $# -eq 0 ]]; then
  echo -e "${RED}Error: debes proveer al menos un nombre para el stack.${ENDCOLOR}"
  echo "  Uso: npm run create-stack <nombre> [nombre2 nombre3 ...]"
  exit 1
fi

for stackArg in "$@"; do
  createStack "$stackArg"
done
SCRIPT

chmod +x scripts/create-stack.sh
chmod +x scripts/init.sh

# ─── .gitignore ────────────────────────────────────────────────────────────
cat > .gitignore <<'EOF'
node_modules
.serverless
EOF

# ─── Instalar dependencias base ────────────────────────────────────────────
echo -e "${YELLOW}Installing base dependencies...${ENDCOLOR}"
npm install aws-lambda
npm install --save-dev @types/aws-lambda @types/node serverless-offline

echo ""
echo -e "${GREEN}Project initialized successfully!${ENDCOLOR}"
echo ""
echo "Next steps:"
echo "  1. aws configure --profile <nombre-de-tu-perfil>"
echo "  2. npm run create-stack <nombre>"
echo "  3. npm install"
echo "  4. serverless deploy --aws-profile <nombre-de-tu-perfil>"
