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
