// Signed decimal strings (e.g. "100.00", "-50.25") manipulated as BigInt
// cents internally to avoid float drift when summing transaction amounts in
// the dashboard. Accepts inputs with 0, 1, or 2 decimal places. Outputs
// always have exactly 2 decimal places.

const DECIMAL_RE = /^(-?)(\d+)(?:\.(\d{1,2}))?$/;

const toCents = (s: string): bigint => {
  const m = DECIMAL_RE.exec(s);
  if (m === null) throw new Error(`Invalid decimal string: ${s}`);
  const sign = m[1] ?? '';
  const intPart = m[2] ?? '0';
  const decPart = m[3] ?? '';
  const decPadded = decPart.padEnd(2, '0');
  const magnitude = BigInt(intPart) * 100n + BigInt(decPadded);
  return sign === '-' ? -magnitude : magnitude;
};

const fromCents = (c: bigint): string => {
  const sign = c < 0n ? '-' : '';
  const absC = c < 0n ? -c : c;
  const intPart = absC / 100n;
  const decPart = absC % 100n;
  return `${sign}${intPart.toString()}.${decPart.toString().padStart(2, '0')}`;
};

export const add = (a: string, b: string): string =>
  fromCents(toCents(a) + toCents(b));

export const sub = (a: string, b: string): string =>
  fromCents(toCents(a) - toCents(b));

export const abs = (a: string): string => {
  const c = toCents(a);
  return fromCents(c < 0n ? -c : c);
};

export const cmp = (a: string, b: string): number => {
  const ca = toCents(a);
  const cb = toCents(b);
  return ca < cb ? -1 : ca > cb ? 1 : 0;
};

export const isZero = (a: string): boolean => toCents(a) === 0n;

// Used for percentage share. Returns 0 when b is zero.
export const ratio = (a: string, b: string): number => {
  const cb = toCents(b);
  if (cb === 0n) return 0;
  return Number(toCents(a)) / Number(cb);
};
