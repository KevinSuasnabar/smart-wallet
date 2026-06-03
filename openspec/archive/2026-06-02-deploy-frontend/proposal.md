# Deploy frontend — Proposal

## 1. Intent

Servir el web package en una URL pública usando S3 + CloudFront, con deploy automático en cada merge a main (segundo workflow que se suma al backend que ya tenemos en CI). Cierra Task #16 del web-mvp original. Cero costo recurrente (todo cae en el free tier permanente de AWS para tu volumen).

## 2. Scope

### In

- **CDK construct nuevo `WebDistribution`** que crea:
  - S3 bucket privado (`smart-wallet-web-prod-{accountId}`) con acceso bloqueado a internet directo.
  - CloudFront distribution con OAC (Origin Access Control — el reemplazo moderno de OAI) apuntando al bucket.
  - **Cache policies**:
    - `index.html` → `Cache-Control: no-cache, must-revalidate, max-age=0` (vía CloudFront response headers o invalidación tras cada deploy).
    - Assets con hash (`*-{hash}.js`, `*-{hash}.css`) → `max-age=31536000, immutable` (1 año).
  - **Error responses para SPA**: 403 y 404 → respuesta 200 con body de `/index.html`. Sin esto, refrescar en `/dashboard` o `/recurring` devuelve 403 (S3 no encuentra el path como objeto).
  - **HTTPS forzado**: `viewerProtocolPolicy: REDIRECT_TO_HTTPS`.
  - SSM parameters publicados: `/smart-wallet/prod/web/bucket-name`, `/smart-wallet/prod/web/distribution-id`, `/smart-wallet/prod/web/distribution-domain`.
  - CfnOutput con la URL final.

- **Modificación a `SmartWalletStack`**: instanciar `WebDistribution`.

- **SSM parameter manual `/smart-wallet/prod/api/url`**: la URL del API Gateway hoy NO está en SSM (Serverless owns it). Como rollout step manual, el usuario la crea una vez con `aws ssm put-parameter` (la URL es estable; no cambia entre deploys). El workflow del frontend la lee de ahí para inyectarla en build.

- **Workflow nuevo `.github/workflows/deploy-frontend.yml`** que en `push: [main]` corre en paralelo al backend:
  - Checkout, setup pnpm + node, install
  - Configure AWS credentials via OIDC (mismo role que el backend)
  - Lee SSM: bucket name, distribution id, api url, cognito user pool id + client id + region
  - Inyecta como `VITE_API_BASE_URL` + `VITE_COGNITO_*` antes de `pnpm build`
  - `aws s3 sync packages/web/dist/ s3://${bucket}/ --delete`
  - `aws cloudfront create-invalidation --distribution-id ${id} --paths "/*"`

- **Documentación de rollout** al final del proposal: 4 pasos one-time (deploy CDK, crear el SSM param de API URL, validar URL final, opcionalmente agregar branch protection check).

### Out

- **Custom domain** (Route 53 + ACM certificate): out por ahorro y simplicidad. CloudFront default `*.cloudfront.net` es suficiente. Cuando lo quieras es ~20 LOC de CDK + registro DNS — SDD aparte.
- **Geographic restrictions / WAF**: out. App personal, no necesita.
- **Logging de CloudFront a S3**: out (cobra storage adicional, no aporta valor a app personal).
- **CI invalidation por path** (en lugar de `/*`): out. `/*` es $0 (1000 invalidaciones path/mes free permanente; deploys/mes están muy por debajo).
- **Tests de smoke del frontend**: out de v1. Un futuro paso podría ser `curl ${url}/ && grep "Smart Wallet"` para detectar deploys rotos. Por ahora la inspección visual del usuario es suficiente.
- **Preview deploys por PR**: out. Cada PR no genera su propio CloudFront — costoso (necesita su propia distribution) y no aporta para uso solo personal.
- **Compresión Brotli explícita**: CloudFront ya comprime Gzip + Brotli automático.

## 3. Approach

### Decisión clave: build-time env vars

Vite hace **static replacement** de `import.meta.env.VITE_*` en build time — no hay configuración runtime. Eso significa que cada build es específico al stage (prod en nuestro caso).

El workflow:

1. Configura credenciales OIDC.
2. Lee SSM:
   ```
   /smart-wallet/prod/api/url                    → VITE_API_BASE_URL
   /smart-wallet/prod/cognito/user-pool-id       → VITE_COGNITO_USER_POOL_ID
   /smart-wallet/prod/cognito/user-pool-client-id → VITE_COGNITO_CLIENT_ID
   /smart-wallet/prod/region                     → VITE_COGNITO_REGION
   ```
3. Exporta esos valores como env vars en el step de build.
4. `pnpm build` produce `packages/web/dist/` con esos valores inlinados.
5. Sync a S3 + invalidate.

### Por qué el API URL queda fuera del CDK

El API Gateway lo crea **Serverless Framework**, no CDK. Es decir, CDK construye Cognito + DynamoDB y publica sus identificadores en SSM. Después serverless deploy crea el HTTP API y le asigna una URL, pero esa URL no llega a SSM hoy.

Opciones evaluadas:

- **A (elegida)**: Manual one-time `aws ssm put-parameter --name /smart-wallet/prod/api/url --value "https://f4vv2f72ua.execute-api.us-east-1.amazonaws.com" --type String`. Pros: zero dependencies. Cons: si alguna vez la URL cambia, hay que actualizar manualmente.
- **B**: Plugin `serverless-ssm-publish` que escribe outputs a SSM en cada deploy. Pros: automático. Cons: agrega dependencia, otro punto de configuración. Vale la pena en un próximo SDD si el URL cambia con frecuencia (no es el caso).
- **C**: Hardcodear la URL en el workflow. Cons: lugar adicional donde se duplica el valor.

A gana para MVP.

### Cache strategy detail

CloudFront Distribution con TWO behaviors:

1. **Default** (catch-all): TTL 1 año, sirve assets con hash. Vite garantiza que cada deploy cambia el hash, así que cache-busting es automático sin invalidación necesaria.

2. **Explicit `/index.html`** path pattern: usa `CachePolicy.CACHING_DISABLED` (TTL 0). Esto asegura que el archivo HTML se sirva fresco siempre. Combinado con la invalidación `/*` post-deploy, los usuarios ven el nuevo HTML al instante.

Alternativa más simple: solo invalidación `/*` y dejar default cache. Funciona pero implica TTL alto para HTML hasta que la invalidación se procesa (~3-5 min). El path-specific behavior elimina ese delay.

### Rollout (one-time post-merge)

1. **Mergear el PR**.
2. **Deploy CDK** desde local (crea bucket + distribution + SSM params):
   ```bash
   AWS_PROFILE=tomishi-account pnpm --filter @smart-wallet/infra-cdk run deploy
   ```
3. **Crear el SSM param de API URL** (one-time, no cambia entre re-deploys):
   ```bash
   aws ssm put-parameter \
     --name /smart-wallet/prod/api/url \
     --value "https://f4vv2f72ua.execute-api.us-east-1.amazonaws.com" \
     --type String \
     --region us-east-1 --profile tomishi-account
   ```
   (Si tu URL es distinta — sucede si alguna vez recreaste el stack — la leés de `serverless info --stage prod` o del CloudFormation output del stack `smart-wallet-api-prod`.)
4. **Leer la URL final**:
   ```bash
   aws ssm get-parameter \
     --name /smart-wallet/prod/web/distribution-domain \
     --query Parameter.Value --output text \
     --region us-east-1 --profile tomishi-account
   ```
   Te devuelve algo como `d3xy7abc123.cloudfront.net`. Abrila en el browser después del primer deploy.
5. **Push a main** (puede ser un cambio trivial) → `Deploy frontend / deploy` corre, syncea, invalida, y el frontend queda live.

### Cognito callback URLs

El user pool tiene callbacks configurados — necesitamos verificar que la CloudFront URL esté allowed. Si Cognito está usando `USER_PASSWORD_AUTH` (no OAuth2 hosted UI), los callback URLs son irrelevantes y no hay que tocar nada. Si está usando OAuth/SAML/hosted UI, hay que agregar `https://d3xy7abc123.cloudfront.net` a los callback URLs.

Pendiente de verificar en CDK actual; el design.md lo confirma.

## 4. Key decisions

| Decisión                 | Elegido                                | Alternativa            | Razón                                                                                                                                                  |
| ------------------------ | -------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Origen S3→CloudFront     | OAC (Origin Access Control)            | OAI (legacy)           | AWS recomienda OAC desde 2022. CDK lo soporta nativo.                                                                                                  |
| HTTPS                    | Redirect HTTP→HTTPS                    | HTTPS only             | Redirect es UX-friendly (mistype en browser → carga, no error).                                                                                        |
| SPA fallback             | CloudFront 403/404 → 200 + /index.html | Lambda@Edge            | Cero costo, simple. Lambda@Edge sería overkill.                                                                                                        |
| Cache HTML               | Path behavior con CACHING_DISABLED     | Solo invalidación /\*  | UX inmediata post-deploy. Costo cero.                                                                                                                  |
| API URL discovery        | SSM manual one-time                    | serverless-ssm-publish | Cero dependencias, URL es estable.                                                                                                                     |
| Distribution price class | `PRICE_CLASS_100` (US, Canada, Europe) | `PRICE_CLASS_ALL`      | Coverage suficiente, ahorra latencia/cost en edge locations que no necesitamos.                                                                        |
| Domain                   | Default `*.cloudfront.net`             | Custom domain          | Cero costo, cero config DNS. Custom queda como SDD aparte.                                                                                             |
| Workflow split           | Separado de deploy-backend             | Mismo workflow         | Independent failures (backend OK, frontend roto, o viceversa). Paralelo en push a main.                                                                |
| Invalidation scope       | `/*` siempre                           | Por path               | $0 con 1000 paths/mes free. La invalidación lleva ~3 min pero la combinamos con el cache behavior, así que cache-bust de HTML es efectivo en segundos. |

## 5. Risks

- **API URL stale en SSM**: si el stack de serverless se recrea desde cero (improbable pero posible), la URL cambia. Mitigación: documentar en rollout cómo obtener la nueva y re-correr `ssm put-parameter`. Alternativa futura: serverless-ssm-publish plugin.
- **Cognito callback URLs**: si la app usa OAuth flow, el dominio nuevo de CloudFront tiene que estar permitido. Verificado en design — la app actual usa USER_PASSWORD_AUTH direct, no callback URLs.
- **CORS**: el backend ya permite `allowedOrigins: '*'` en serverless.yml. Funcionará desde CloudFront. Si en futuro queremos tightning, se restringe al dominio CloudFront concreto.
- **Bucket public access bloqueado**: si por error el bucket queda público, hay riesgo de exposición de assets (no contienen secretos, pero igual). El construct fuerza `blockPublicAccess: BLOCK_ALL`. OAC habilita la comunicación CloudFront→S3 sin abrir el bucket.
- **CloudFront warmup**: la primera invocación post-deploy puede ser lenta (~2-3s) mientras se hidratan edge caches. Aceptable para una app personal.
- **CDK destroy elimina el bucket**: si alguien corre `cdk destroy` por error, el bucket con los assets se borra. Mitigación: `RemovalPolicy.RETAIN` en el bucket. Documentado en construct.

## 6. LOC estimate

| Área                                                         | LOC      |
| ------------------------------------------------------------ | -------- |
| `packages/infra-cdk/src/constructs/WebDistribution.ts`       | ~130     |
| `packages/infra-cdk/src/stacks/SmartWalletStack.ts` (modify) | +10      |
| `.github/workflows/deploy-frontend.yml`                      | ~90      |
| Total                                                        | **~230** |

Single PR. Bajo budget.

## 7. Open questions

Ninguna. API URL discovery elegido como manual one-time. Custom domain explícitamente out. Workflow split confirmado.
