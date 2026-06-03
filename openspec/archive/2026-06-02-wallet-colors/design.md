# Design: wallet-colors

> SDD phase: design
> Project: smart-wallet
> Change: wallet-colors
> Date: 2026-05-15
> Engram topic_key: `sdd/wallet-colors/design`

---

## 1. Files affected

### New

```
packages/shared-types/src/wallet-colors.ts        # WALLET_COLORS const + WalletColor type + zWalletColor
packages/web/src/features/wallets/components/ColorPicker.tsx
```

### Modified

```
packages/shared-types/src/index.ts                # re-export new constants
packages/shared-types/src/schemas/wallet.ts       # all three schemas gain `color`

packages/domain/src/wallet/Wallet.ts              # +color in props, factory, applyEdits
packages/domain/src/wallet/WalletError.ts         # +InvalidWalletColor
packages/domain/src/wallet/usecases/CreateWallet.ts  # +color in input
packages/domain/src/wallet/usecases/UpdateWallet.ts  # +color in edits
packages/domain/src/wallet/index.ts               # re-exports

packages/api/src/handlers/wallet/createWallet.ts  # pass color through, return in body
packages/api/src/handlers/wallet/patchWallet.ts   # pass color through edits
packages/api/src/handlers/wallet/getWallet.ts     # return color in body
packages/api/src/handlers/wallet/listWallets.ts   # return color in body
packages/api/src/adapters/dynamodb/mappers/WalletMapper.ts  # +color w/ fallback

packages/web/src/lib/i18n.ts                      # +color labels + colorLabel
packages/web/src/features/wallets/components/WalletCard.tsx
                                                  # drop `index`, use wallet.color
packages/web/src/features/wallets/pages/WalletsListPage.tsx
                                                  # stop passing index to WalletCard
packages/web/src/features/wallets/pages/CreateWalletPage.tsx
                                                  # +ColorPicker, smart default
packages/web/src/features/wallets/pages/EditWalletPage.tsx
                                                  # +ColorPicker
```

Total: 2 new files, 15 modified. Estimated ~400 LOC delta.

---

## 2. Shared types

### 2.1 `wallet-colors.ts` (new file)

```ts
import { z } from 'zod';

/**
 * Fixed palette for wallet visual identity. Order matters — it drives the
 * "first unused color" smart default in the create form.
 */
export const WALLET_COLORS = ['lime', 'lilac', 'cream', 'pink', 'mint', 'coral', 'navy'] as const;

export type WalletColor = (typeof WALLET_COLORS)[number];

export const zWalletColor = z.enum(WALLET_COLORS);

export const isWalletColor = (v: unknown): v is WalletColor =>
  typeof v === 'string' && (WALLET_COLORS as readonly string[]).includes(v);
```

Re-export from `packages/shared-types/src/index.ts` alongside `Currency`.

### 2.2 `schemas/wallet.ts` — add `color` everywhere

```ts
import { zWalletColor } from '../wallet-colors.js';

export const CreateWalletRequestSchema = z.object({
  name: z.string().trim().min(1).max(64),
  currency: zCurrency,
  color: zWalletColor, // NEW, required
});

export const WalletResponseSchema = z.object({
  walletId: z.string(),
  name: z.string(),
  currency: zCurrency,
  color: zWalletColor, // NEW
  balance: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const UpdateWalletRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(64).optional(),
    currency: zCurrency.optional(),
    color: zWalletColor.optional(), // NEW
  })
  .strict()
  .refine(
    (data) => data.name !== undefined || data.currency !== undefined || data.color !== undefined,
    { message: 'At least one mutable field must be provided' },
  );
```

---

## 3. Domain layer

### 3.1 `Wallet.ts` — add `color` to props + factory + applyEdits

```ts
// imports
import { isWalletColor } from '@smart-wallet/shared-types';
import type { WalletColor } from '@smart-wallet/shared-types';
import { InvalidWalletColor } from './WalletError.js';

// props
export interface WalletProps {
  userId: UserId;
  name: string;
  currency: Currency;
  color: WalletColor; // NEW
  balance: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface CreateWalletProps {
  walletId: WalletId;
  userId: UserId;
  name: string;
  currency: string;
  color: string; // NEW (validated below)
  clock: Clock;
}
```

`create()`:

```ts
// inside the factory, AFTER currency validation:
if (!isWalletColor(props.color)) {
  return err(new InvalidWalletColor());
}
// ...
const wallet = new Wallet(props.walletId, {
  // ... existing
  color: props.color,
});
```

`applyEdits` gains a `color?: string` field:

```ts
applyEdits(
  edits: { name?: string; currency?: string; color?: string },
  clock: Clock,
): Result<void, WalletError> {
  const snapshot: WalletProps = { ...this._props };

  // ... existing name + currency validators ...

  if (edits.color !== undefined) {
    if (!isWalletColor(edits.color)) {
      this._props = snapshot;
      return err(new InvalidWalletColor());
    }
    this._props.color = edits.color;
  }

  this._props.updatedAt = clock.now();
  return ok(undefined);
}
```

### 3.2 `WalletError.ts` — add `InvalidWalletColor`

```ts
export class InvalidWalletColor extends DomainError {
  readonly tag = 'domain.wallet.invalid_color' as const;
  readonly httpStatus = 400 as const;
  constructor(message = 'Wallet color must be one of the predefined palette values') {
    super(message);
  }
}

export type WalletError =
  | InvalidWalletId
  | InvalidWalletName
  | InvalidWalletCurrency
  | InvalidWalletColor // NEW
  | WalletAlreadyDeleted
  | WalletNotFound
  | WalletCurrencyLocked;
```

### 3.3 Use cases — pass `color` through

`CreateWallet.ts`:

```ts
export interface CreateWalletInput {
  userId: string;
  name: string;
  currency: Currency;
  color: string;        // NEW (string at this layer; validated in factory)
}

// inside the factory body, pass color to Wallet.create:
const walletResult = Wallet.create({
  walletId: ...,
  userId,
  name: input.name,
  currency: input.currency,
  color: input.color,    // NEW
  clock: deps.clock,
});
```

`UpdateWallet.ts`:

```ts
export interface UpdateWalletInput {
  userId: string;
  walletId: string;
  edits: {
    name?: string;
    currency?: string;
    color?: string; // NEW
  };
}

// applyEdits already accepts color; no further use-case logic needed.
```

---

## 4. Repository layer

### 4.1 `WalletMapper.ts` — add `color` with legacy fallback

```ts
import { isWalletColor } from '@smart-wallet/shared-types';
import type { WalletColor } from '@smart-wallet/shared-types';

export interface WalletItem {
  PK: string;
  SK: string;
  entityType: 'Wallet';
  walletId: string;
  userId: string;
  name: string;
  currency: Currency;
  color: string; // NEW
  balance: number;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

// in walletToItem
const item: WalletItem = {
  // ... existing fields
  color: wallet.color,
};

// in itemToWallet
const color: WalletColor = isWalletColor(item.color) ? item.color : 'lime';
const result = Wallet.rehydrate(walletId, {
  // ... existing
  color,
});
```

Legacy items (no `color` attribute) → `item.color` is `undefined` → `isWalletColor` returns false → fallback `'lime'`.

---

## 5. HTTP handlers

### 5.1 `createWallet.ts` — accept + return color

```ts
const result = await container.createWallet({
  userId: event.userId,
  name: input.name,
  currency: input.currency,
  color: input.color, // NEW
});

// response body
return created({
  walletId: wallet.id.toString(),
  name: wallet.name,
  currency: wallet.currency,
  color: wallet.color, // NEW
  balance: formatCentsForResponse(wallet.balance, wallet.currency),
  createdAt: wallet.createdAt.toISOString(),
  updatedAt: wallet.updatedAt.toISOString(),
});
```

### 5.2 `patchWallet.ts` — accept color in edits

```ts
const edits: { name?: string; currency?: string; color?: string } = {};
if (body.name !== undefined) edits.name = body.name;
if (body.currency !== undefined) edits.currency = body.currency;
if (body.color !== undefined) edits.color = body.color; // NEW

// response body adds `color`
```

### 5.3 `getWallet.ts`, `listWallets.ts` — include color in body

Both response builders gain `color: wallet.color`. Three-line change each.

---

## 6. Frontend

### 6.1 `ColorPicker.tsx` (new component)

```tsx
import { WALLET_COLORS } from '@smart-wallet/shared-types';
import type { WalletColor } from '@smart-wallet/shared-types';
import { cn } from '../../../lib/utils.js';
import { t } from '../../../lib/i18n.js';

interface ColorPickerProps {
  value: WalletColor;
  onChange: (color: WalletColor) => void;
  disabled?: boolean;
}

const SWATCH_BG: Record<WalletColor, string> = {
  lime: 'bg-block-lime',
  lilac: 'bg-block-lilac',
  cream: 'bg-block-cream',
  pink: 'bg-block-pink',
  mint: 'bg-block-mint',
  coral: 'bg-block-coral',
  navy: 'bg-block-navy',
};

export const ColorPicker = ({ value, onChange, disabled = false }: ColorPickerProps) => (
  <div role="radiogroup" aria-label={t.wallets.colorLabel} className="flex flex-wrap gap-2">
    {WALLET_COLORS.map((color) => (
      <button
        key={color}
        type="button"
        role="radio"
        aria-checked={value === color}
        aria-label={t.wallets.colors[color]}
        title={t.wallets.colors[color]}
        disabled={disabled}
        onClick={() => onChange(color)}
        className={cn(
          'size-10 rounded-full border border-border transition',
          SWATCH_BG[color],
          value === color && 'ring-2 ring-offset-2 ring-foreground',
          disabled ? 'opacity-50 cursor-not-allowed' : 'hover:scale-105',
        )}
      />
    ))}
  </div>
);
```

### 6.2 `CreateWalletPage` — picker + smart default

```tsx
// inside the component:
const { data: walletsData } = useWallets();
const defaultColor = useMemo<WalletColor>(() => {
  const used = new Set(walletsData?.items.map((w) => w.color) ?? []);
  return WALLET_COLORS.find((c) => !used.has(c)) ?? 'lime';
}, [walletsData]);

const form = useForm<CreateWalletDTO>({
  resolver: zodResolver(CreateWalletRequestSchema),
  mode: 'onChange',
  defaultValues: {
    name: '',
    currency: preferred ?? 'USD',
    color: defaultColor,
  },
});

// in JSX, after the currency field:
<FormField
  control={form.control}
  name="color"
  render={({ field }) => (
    <FormItem>
      <FormLabel>{t.wallets.colorLabel}</FormLabel>
      <FormControl>
        <ColorPicker value={field.value} onChange={field.onChange} disabled={isPending} />
      </FormControl>
      <FormMessage />
    </FormItem>
  )}
/>;
```

Note: `defaultValues` is computed ONCE at mount. If `useWallets()` is still loading at mount, `defaultColor` falls back to `'lime'`. The form is not reset when the query later resolves. Documented acceptable trade-off — re-resetting form state mid-edit is jarring; `'lime'` is a safe fallback.

### 6.3 `EditWalletPage` — picker pre-selected

```tsx
// FormSchema gains color field:
const FormSchema = z.object({
  name: z.string().trim().min(1).max(64),
  currency: UpdateWalletRequestSchema._def.schema.shape.currency.unwrap(),
  color: zWalletColor,
});

// defaultValues seeded from wallet:
defaultValues: {
  name: wallet.name,
  currency: wallet.currency,
  color: wallet.color,
}

// JSX adds the picker after the currency field. NOT disabled by tx count.

// Diff logic:
if (values.color !== wallet.color) diff.color = values.color;
```

### 6.4 `WalletCard` — drop `index`

```tsx
// before
interface WalletCardProps {
  wallet: WalletResponseDTO;
  index: number;
}
const tone = TONES[index % TONES.length] ?? 'lime';

// after
interface WalletCardProps {
  wallet: WalletResponseDTO;
}
const tone: ColorBlockTone = isWalletColor(wallet.color) ? wallet.color : 'lime';
```

Remove the `TONES` array and the `index` parameter. Update the call site in `WalletsListPage` to stop passing `index`.

### 6.5 i18n additions

```ts
wallets: {
  // ... existing
  colorLabel: 'Color',
  colors: {
    lime: 'Lima',
    lilac: 'Lila',
    cream: 'Crema',
    pink: 'Rosa',
    mint: 'Menta',
    coral: 'Coral',
    navy: 'Azul marino',
  },
},
```

---

## 7. Cross-cutting decisions

### 7.1 Color enum lives in shared-types, NOT in `web/lib/`

The `WALLET_COLORS` palette is part of the API contract (the server validates it; the API response includes it). Putting it in shared-types is the only way to keep frontend + backend in sync without duplication.

### 7.2 Mapping color → Tailwind class uses a `Record<WalletColor, string>`

Not template-string interpolation (`bg-block-${color}`). Tailwind's JIT requires literal class names in source so the compiler can find them. A static record is the only safe approach.

### 7.3 No prop drilling beyond `WalletCard`

The wallet's color reaches `WalletCard` via the wallet object itself. No `color` prop on `WalletCard` — it lives inside `wallet`. Future card variants (e.g., compact list view) read it the same way.

### 7.4 Default-color logic stays in the frontend

Computing "first unused color" requires the list of existing wallets. Doing it server-side would require the create endpoint to take a special "auto-pick" sentinel and read the user's wallets — adds latency + complexity for marginal benefit. Frontend has the list already (TanStack cache).

### 7.5 No optimistic UI

Same as before. Color edit/create flows refetch on success.

### 7.6 Wallet edit page lives at the same route

`/wallets/:walletId/edit` already exists from the previous SDD. The color picker is an additive change inside that page — no routing changes.

---

## 8. Risks (carryover from proposal + new)

| Risk                                                                                                               | Mitigation                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Legacy wallets all default to lime, look like a bug                                                                | Edit page is two clicks away; user re-colors them quickly.                                                                                |
| Tailwind JIT misses a `bg-block-*` class because it's built dynamically                                            | Use the static `SWATCH_BG` record. Class names are literal.                                                                               |
| `defaultValues` on the create form is computed at mount; if wallets load later, the picker doesn't update          | Acceptable — re-resetting form mid-render is bad UX. Lime is a safe fallback.                                                             |
| Adding `color` to `CreateWalletRequestSchema` is a breaking change for any non-frontend client (curl, integration) | Documented. The smoke script will need updating to send a color (~3 LOC each in smoke and smoke-prod).                                    |
| `WalletItem.color` is `string`, not the enum, in the mapper                                                        | Intentional: DynamoDB items can hold anything; the mapper validates and falls back. The domain `WalletColor` is enforced at the boundary. |

---

## 9. Estimated impact

| Surface                                                                | LOC delta |
| ---------------------------------------------------------------------- | --------- |
| Shared types (new file + 3 schema edits + index re-export)             | +60       |
| Domain (Wallet + WalletError + 2 use cases + index)                    | +60       |
| API (4 handler edits + mapper edit)                                    | +30       |
| Web (ColorPicker + 2 page edits + WalletCard + i18n + WalletsListPage) | +220      |
| Smoke scripts (update local + prod with `color` field on POST)         | +10       |
| **Total**                                                              | **~380**  |

Below the 400-line budget. Single PR. No chained-PR decision.
