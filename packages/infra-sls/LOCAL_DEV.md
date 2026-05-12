# Smart Wallet — Development & Testing Guide

> Guía para probar el **backend** de tres formas:
> - **Local** (sin AWS, sin Cognito) → secciones 1-5
> - **Contra producción con smoke automatizado** (usuario efímero) → [Probar contra producción](#probar-contra-producción)
> - **Contra producción manual** (Postman/curl con usuario real) → [Probar contra producción](#probar-contra-producción)
>
> Para el frontend (`packages/web`), mirá la sección [Frontend local](#frontend-local).

---

## TL;DR — ¿Qué usuario uso?

| Forma de probar | ¿Crear usuario en AWS? |
|---|---|
| Smoke test **local** (`pnpm smoke`) | ❌ NO — header `X-Mock-User-Id` con cualquier UUID v4 |
| Curl/Postman **local** | ❌ NO — header `X-Mock-User-Id` con cualquier UUID v4 |
| Smoke test **contra prod** (`pnpm smoke:prod`) | ❌ NO — el script crea uno efímero y lo borra al final |
| Curl/Postman **contra prod** | ✅ SÍ — necesitás un usuario real en Cognito |
| Frontend (`pnpm dev` en web) | ✅ SÍ — el SDK Cognito exige credenciales reales |

**Para local:** el authorizer de Cognito está **deshabilitado** (`stage: local`). La API identifica al usuario por el header `X-Mock-User-Id`. Usás cualquier UUID v4 — el backend lo trata como si fuera el `sub` claim de un JWT real.

**UUID por defecto del smoke test:**
```
11111111-1111-4111-8111-111111111111
```

Si querés simular un segundo usuario, usá otro UUID v4 cualquiera (ej: `22222222-2222-4222-8222-222222222222`). Cada UUID tiene su propio espacio de wallets/transacciones.

---

## Prerrequisitos

- **Node 22** (`nvm use` si tenés `.nvmrc`)
- **pnpm 10** (`npm i -g pnpm@10`)
- **Docker** (para DynamoDB Local — solo el daemon corriendo)
- **python3** (para parseo JSON del smoke test — viene preinstalado en Linux/macOS)

> ⚠️ **NO necesitás `jq`**. El smoke test usa `python3 -m json.tool` y `python3 -c "import json..."` — cero dependencias adicionales.

---

## Flujo completo en 5 pasos

### 1️⃣ Instalar dependencias (solo la primera vez)
```bash
pnpm install
```

### 2️⃣ Levantar DynamoDB Local

Desde la raíz del repo:
```bash
pnpm ddb:up
```

Verificás que esté arriba con:
```bash
docker ps --filter name=smart-wallet-ddb
```

Servicios disponibles:
- **DynamoDB Local** → `http://localhost:8000`
- **Admin UI** (opcional, para inspeccionar la tabla) → `http://localhost:8001`

> ℹ️ **Modo `-inMemory`**: la base corre 100% en RAM. Cada vez que **bajás y volvés a levantar el contenedor** (`pnpm ddb:down` + `pnpm ddb:up`, o reinicio de Docker), **se pierden los datos**. Por eso el paso 3 hay que repetirlo después de cada restart.

### 3️⃣ Crear la tabla DynamoDB

```bash
pnpm ddb:init
```

Crea la tabla `smart-wallet-local` con:
- `PK` / `SK` (compound key)
- `GSI1` (consulta por categoría)
- TTL en atributo `ttl` (para idempotency records)

> 🔁 **Repetí este paso después de cada `pnpm ddb:down`** (in-memory wipe).

### 4️⃣ Levantar serverless-offline (en otra terminal)

```bash
cd packages/infra-sls
pnpm dev
```

Cuando veas esto, está listo:
```
Server ready: http://localhost:3000 🚀
```

Endpoints disponibles:
- `POST /wallets`
- `GET /wallets`
- `GET /wallets/{walletId}`
- `POST /wallets/{walletId}/transactions`
- `GET /wallets/{walletId}/transactions`
- `GET /transactions?categoryId=...`
- `GET /categories`
- `POST /categories`
- `DELETE /categories/{categoryId}`

### 5️⃣ Probar la API

#### Opción A — Smoke test automático (recomendado)

Desde la raíz, en otra terminal:
```bash
pnpm smoke
```

Corre 12 escenarios en cadena y valida que el balance final sea consistente (`94.50 USD` después de `+100.00 − 5.50` con un replay de idempotency-key que NO debe duplicar).

Si todo funciona:
```
============================================
 Results: 12 passed, 0 failed
============================================
```

#### Opción B — Curl manual

```bash
# Crear una wallet
curl -s -X POST http://localhost:3000/wallets \
  -H "X-Mock-User-Id: 11111111-1111-4111-8111-111111111111" \
  -H "Content-Type: application/json" \
  -d '{"name":"Cash","currency":"USD"}' \
  | python3 -m json.tool

# Listar wallets
curl -s http://localhost:3000/wallets \
  -H "X-Mock-User-Id: 11111111-1111-4111-8111-111111111111" \
  | python3 -m json.tool
```

#### Opción C — Postman

Importá `packages/infra-sls/postman/smart-wallet-mvp.postman_collection.json`. Configurá las variables de colección:
- `baseUrl` → `http://localhost:3000`
- `userId` → `11111111-1111-4111-8111-111111111111`

(Las variables de Cognito quedan vacías en local — la colección está pensada también para correr contra prod.)

---

## Cómo bajar todo

```bash
# Parar serverless-offline → Ctrl+C en la terminal donde corre

# Parar Docker (DDB Local + Admin UI)
pnpm ddb:down
```

---

## Auth en modo local — cómo funciona por dentro

`serverless-offline` **NO** ejecuta el authorizer JWT de Cognito configurado en `serverless.yml`. Todas las requests pasan derecho.

El middleware `withAuth` detecta `IS_OFFLINE=true` y:
1. Lee el header `X-Mock-User-Id`
2. Si no viene → responde `401 Unauthorized`
3. Si viene → trata ese UUID como el `sub` del usuario

En **producción**, el mismo middleware lee `event.requestContext.authorizer.jwt.claims.sub` (provisto por el authorizer real).

Por eso podés desarrollar el backend sin tocar Cognito jamás.

---

## Variables de entorno (local)

Las setea automáticamente el script `pnpm dev`:

| Variable | Valor local |
|---|---|
| `IS_OFFLINE` | `true` |
| `DYNAMODB_ENDPOINT` | `http://localhost:8000` |
| `TABLE_NAME` | `smart-wallet-local` |
| `GSI1_NAME` | `GSI1` |
| `MOCK_USER_ID` (smoke test) | `11111111-1111-4111-8111-111111111111` |

Si necesitás overridear algo, podés crear `packages/infra-sls/.env.local` (está en `.gitignore`).

---

## Referencia de endpoints

Todos los endpoints requieren el header `X-Mock-User-Id` en modo local.

### Wallets

#### `POST /wallets` — Crear wallet
```bash
curl -s -X POST http://localhost:3000/wallets \
  -H "X-Mock-User-Id: 11111111-1111-4111-8111-111111111111" \
  -H "Content-Type: application/json" \
  -d '{"name":"Cash","currency":"USD"}' \
  | python3 -m json.tool
# → 201 { walletId, name, currency, balance, createdAt, updatedAt }
```

#### `GET /wallets` — Listar wallets
```bash
curl -s http://localhost:3000/wallets \
  -H "X-Mock-User-Id: 11111111-1111-4111-8111-111111111111" \
  | python3 -m json.tool
# → 200 { items: [...], nextCursor? }
```

#### `GET /wallets/{walletId}` — Detalle wallet
```bash
curl -s http://localhost:3000/wallets/<walletId> \
  -H "X-Mock-User-Id: 11111111-1111-4111-8111-111111111111" \
  | python3 -m json.tool
# → 200 wallet | 404
```

### Transacciones

#### `POST /wallets/{walletId}/transactions` — Crear transacción
```bash
curl -s -X POST http://localhost:3000/wallets/<walletId>/transactions \
  -H "X-Mock-User-Id: 11111111-1111-4111-8111-111111111111" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "expense",
    "amount": "5.50",
    "currency": "USD",
    "categoryId": "expense:food",
    "description": "lunch",
    "occurredAt": "2026-05-12T12:00:00Z"
  }' \
  | python3 -m json.tool
```

Con `Idempotency-Key` (replay-safe):
```bash
curl -s -X POST http://localhost:3000/wallets/<walletId>/transactions \
  -H "X-Mock-User-Id: 11111111-1111-4111-8111-111111111111" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: my-unique-key-123" \
  -d '{
    "type": "income",
    "amount": "100.00",
    "currency": "USD",
    "categoryId": "income:salary",
    "occurredAt": "2026-05-12T12:00:00Z"
  }' \
  | python3 -m json.tool
# Primera vez → 201. Misma key repetida → 200 con body idéntico.
```

#### `GET /wallets/{walletId}/transactions` — Listar por wallet
```bash
curl -s "http://localhost:3000/wallets/<walletId>/transactions?limit=20" \
  -H "X-Mock-User-Id: 11111111-1111-4111-8111-111111111111" \
  | python3 -m json.tool
# Filtros opcionales: type=expense|income, categoryId=..., from=ISO, to=ISO
```

#### `GET /transactions?categoryId=...` — Listar por categoría
```bash
curl -s "http://localhost:3000/transactions?categoryId=expense:food" \
  -H "X-Mock-User-Id: 11111111-1111-4111-8111-111111111111" \
  | python3 -m json.tool
```

### Categorías

#### `GET /categories` — Listar categorías
```bash
curl -s http://localhost:3000/categories \
  -H "X-Mock-User-Id: 11111111-1111-4111-8111-111111111111" \
  | python3 -m json.tool
# → 200 { predefined: [...], custom: [...] }
```

#### `POST /categories` — Crear categoría custom
```bash
curl -s -X POST http://localhost:3000/categories \
  -H "X-Mock-User-Id: 11111111-1111-4111-8111-111111111111" \
  -H "Content-Type: application/json" \
  -d '{"name":"Coffee","type":"expense"}' \
  | python3 -m json.tool
```

#### `DELETE /categories/{categoryId}` — Eliminar categoría custom
```bash
curl -s -X DELETE http://localhost:3000/categories/<categoryId> \
  -H "X-Mock-User-Id: 11111111-1111-4111-8111-111111111111" \
  -w "HTTP %{http_code}\n"
# → 204 ok | 404 not found | 409 si es predefinida
```

---

## Monedas soportadas

`USD` y `PEN` solamente. Cualquier otro valor en `currency` devuelve `400`.

## Categorías predefinidas

**Income:**
- `income:salary`
- `income:freelance`
- `income:investment`
- `income:gift`
- `income:other`

**Expense:**
- `expense:food`
- `expense:transport`
- `expense:housing`
- `expense:utilities`
- `expense:health`
- `expense:entertainment`
- `expense:education`
- `expense:clothing`
- `expense:other`

---

## Frontend local

> ⚠️ El frontend `packages/web` actualmente está configurado para autenticarse contra el **User Pool de Cognito en producción**. Esto es así porque no tenemos un Cognito mock — el SDK `amazon-cognito-identity-js` exige un User Pool real.

**Implicancia:** para probar el frontend en local **necesitás un usuario real de Cognito**.

Dos opciones:

### Frontend → Backend en prod (más simple)
1. `cd packages/web && pnpm dev` → abre `http://localhost:5173`
2. Login con un usuario real de Cognito
3. El SPA pega contra la API en AWS (configurada via `VITE_API_BASE_URL` en `packages/web/.env.local`)

### Frontend → Backend local (más raro, no recomendado todavía)
Requiere parchear el `ApiClient` para que mande `X-Mock-User-Id` en lugar de `Authorization: Bearer ...`, o desactivar el `withAuth` local para que también acepte JWT real. **No está soportado out-of-the-box** — abrir un issue si lo necesitás.

### Crear un usuario de prueba en Cognito (cuando lo necesites)

Requiere credenciales AWS válidas de tu cuenta:
```bash
aws cognito-idp admin-create-user \
  --user-pool-id us-east-1_XXXX \
  --username test@example.com \
  --user-attributes Name=email,Value=test@example.com Name=email_verified,Value=true \
  --temporary-password 'TempPass123!' \
  --region us-east-1
```

> 🔐 El comando `admin-create-user` requiere permisos IAM válidos sobre tu User Pool. Sin credenciales AWS de tu cuenta, no podés crear usuarios. **No es público.**

---

## Probar contra producción

> Producción ya está deployada en AWS us-east-1 (cuenta tomishi-account). La API tiene authorizer JWT de Cognito **real** — todas las requests necesitan un `Authorization: Bearer <JWT>` válido.

### Opción A — Smoke test automatizado (`pnpm smoke:prod`)

**Sin necesidad de crear usuario manualmente.** El script `smoke-prod.sh` genera un usuario efímero, corre los 12 tests, y lo borra al final.

#### Prerrequisitos

- **AWS CLI** instalada (`aws --version` ≥ 2.x)
- **AWS_PROFILE** configurado con credenciales válidas de tu cuenta y permisos sobre:
  - `ssm:GetParameter` sobre `/smart-wallet/prod/*`
  - `cognito-idp:AdminCreateUser`
  - `cognito-idp:AdminSetUserPassword`
  - `cognito-idp:AdminInitiateAuth`
  - `cognito-idp:AdminDeleteUser`
- `python3` + `curl` (ya los usás para `pnpm smoke`)

#### Cómo correrlo

```bash
AWS_PROFILE=tomishi-account pnpm smoke:prod
```

#### Qué hace, paso a paso

1. **Lee config de SSM** — `USER_POOL_ID` y `CLIENT_ID` de `/smart-wallet/prod/cognito/*` (escritos por el stack CDK al deploy)
2. **Genera credenciales efímeras**:
   - Email: `smoke-<uuid>@smart-wallet.test`
   - Password: `Smoke-<random_token>!`
3. **`admin-create-user`** → crea el usuario (auto-confirmado, sin email de bienvenida)
4. **`admin-set-user-password`** → password permanente
5. **`initiate-auth USER_PASSWORD_AUTH`** → obtiene `IdToken` JWT
6. **Corre los 12 smoke steps** con `Authorization: Bearer <IdToken>` (mismo flujo que `smoke.sh` local, pero contra prod)
7. **`trap cleanup EXIT`** → `admin-delete-user` siempre (incluso si un test falla)

#### Resultado esperado

Idéntico al smoke local:
```
============================================
 Results: 12 passed, 0 failed
============================================
→ Cleanup: deleting test user smoke-xxx@smart-wallet.test...
  ✓ user deleted
```

#### Exit codes

| Code | Significado |
|---|---|
| `0` | Los 12 tests pasaron |
| `1` | Falló un test (HTTP status o body inesperado) |
| `2` | Falló el setup (no pudo leer SSM, crear usuario, autenticar) |

### Opción B — Probar manualmente con Postman / curl

Si querés inspeccionar requests/responses manualmente, **sí necesitás un usuario real** en el User Pool de prod. El authorizer no acepta UUIDs mock — solo JWTs firmados por Cognito.

#### Paso 1 — Crear un usuario (una sola vez)

```bash
# Obtener los IDs de Cognito desde SSM
USER_POOL_ID=$(aws ssm get-parameter \
  --name /smart-wallet/prod/cognito/user-pool-id \
  --query 'Parameter.Value' --output text \
  --region us-east-1 --profile tomishi-account)

CLIENT_ID=$(aws ssm get-parameter \
  --name /smart-wallet/prod/cognito/user-pool-client-id \
  --query 'Parameter.Value' --output text \
  --region us-east-1 --profile tomishi-account)

# Crear el usuario
aws cognito-idp admin-create-user \
  --user-pool-id "$USER_POOL_ID" \
  --username test@example.com \
  --user-attributes Name=email,Value=test@example.com Name=email_verified,Value=true \
  --message-action SUPPRESS \
  --region us-east-1 --profile tomishi-account

# Setear password permanente
aws cognito-idp admin-set-user-password \
  --user-pool-id "$USER_POOL_ID" \
  --username test@example.com \
  --password 'TuPasswordSeguro123!' \
  --permanent \
  --region us-east-1 --profile tomishi-account
```

> ⚠️ **Importante:** `admin-create-user` solo funciona con credenciales AWS válidas de **tu** cuenta. No es un endpoint público — nadie externo puede crear usuarios sin tu profile IAM.

#### Paso 2 — Obtener un JWT

```bash
aws cognito-idp initiate-auth \
  --client-id "$CLIENT_ID" \
  --auth-flow USER_PASSWORD_AUTH \
  --auth-parameters USERNAME=test@example.com,PASSWORD='TuPasswordSeguro123!' \
  --region us-east-1 --profile tomishi-account \
  --query 'AuthenticationResult.IdToken' --output text
```

Eso te devuelve un JWT largo. Copialo.

#### Paso 3 — Llamar a la API

```bash
JWT='eyJraWQiOi...'  # el token del paso 2
API_URL='https://f4vv2f72ua.execute-api.us-east-1.amazonaws.com'

curl -s -X POST "$API_URL/wallets" \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{"name":"Cash","currency":"USD"}' \
  | python3 -m json.tool
```

Misma estructura que en local, **solo cambia el header**:
- Local: `X-Mock-User-Id: <UUID>`
- Prod: `Authorization: Bearer <JWT>`

#### Postman contra prod

Importá la misma collection (`packages/infra-sls/postman/smart-wallet-mvp.postman_collection.json`) y configurá las variables:
- `baseUrl` → `https://f4vv2f72ua.execute-api.us-east-1.amazonaws.com`
- `cognitoEmail` → tu email
- `cognitoPassword` → tu password

La collection tiene un script de pre-request que hace el `initiate-auth` automáticamente y popula el JWT antes de cada call.

### Cuándo usar qué

| Caso | Usar |
|---|---|
| Validar que un deploy a prod funciona end-to-end | `pnpm smoke:prod` |
| Pre-commit: confirmar que tu cambio no rompe nada en prod | `pnpm smoke:prod` |
| Debuguear un bug en prod (inspección manual) | Postman / curl con usuario real |
| Demo a alguien | Frontend apuntando a prod |
| Desarrollo rápido (cambio de código backend) | `pnpm smoke` (local) — no toca AWS |

> 💡 **Regla general:** usá `pnpm smoke` para todo lo que puedas (rápido, sin costo, sin contaminar AWS). Usá `pnpm smoke:prod` solo después de un deploy o cuando sospechás de diferencias entre local y prod (ej: timeouts de Lambda, problemas con el authorizer Cognito, throttling de DynamoDB).

---

## Troubleshooting

### "attempt to write a readonly database" al inicializar la tabla
Significa que el contenedor DDB Local no tiene permisos de escritura sobre el volumen. La solución que aplicamos: corre en `-inMemory` (sin volumen). Si volvés a ver este error, revisá `docker-compose.yml` y confirmá que NO haya `user: '1000'` ni `volumes:` definidos sobre el servicio `dynamodb`.

### `curl: (7) Failed to connect to localhost port 3000`
serverless-offline no está corriendo. Volvé al paso 4️⃣.

### "Missing X-Mock-User-Id header" → 401
Te olvidaste de mandar el header. Agregalo a tu curl/Postman.

### Smoke test falla en paso 1 con "Missing user header"
Verificá que tu shell no tenga `MOCK_USER_ID=""` exportada. Reseteala con `unset MOCK_USER_ID` y volvé a correr `pnpm smoke`.

### Después de reiniciar Docker, ningún endpoint funciona
El contenedor DDB Local arrancó vacío (modo in-memory). Volvé a correr `pnpm ddb:init`.

### `pnpm smoke:prod` → "Set AWS_PROFILE"
El script exige que setees el profile explícitamente. Corré `AWS_PROFILE=tomishi-account pnpm smoke:prod`.

### `pnpm smoke:prod` → "Unable to retrieve credentials"
Tu AWS CLI no tiene credenciales válidas para ese profile. Verificá con `aws sts get-caller-identity --profile tomishi-account`. Si falla, configurá el profile (`aws configure --profile tomishi-account`) o renová tus credenciales SSO (`aws sso login --profile tomishi-account`).

### `pnpm smoke:prod` → "ParameterNotFound" al leer SSM
El stack CDK de prod no está deployado o lo está en otra cuenta/region. Verificá:
```bash
aws ssm get-parameter --name /smart-wallet/prod/cognito/user-pool-id \
  --region us-east-1 --profile tomishi-account
```

### `pnpm smoke:prod` → cleanup falló (`could not delete`)
El cleanup corre siempre via `trap EXIT`. Si dice "could not delete" suele ser porque la creación del usuario falló antes (no hay nada que borrar). Si la creación funcionó pero la borrada falló, borralo manualmente:
```bash
aws cognito-idp admin-delete-user \
  --user-pool-id <USER_POOL_ID> \
  --username smoke-<uuid>@smart-wallet.test \
  --region us-east-1 --profile tomishi-account
```

### Postman contra prod → 401 Unauthorized
El JWT expiró (vida útil 1h por defecto). Re-ejecutá el pre-request script de la collection, o repetí el `initiate-auth` y pegá el nuevo `IdToken`.
