/**
 * Domain-owned Currency type. Declared here so the domain package has zero
 * runtime dependencies. Structurally identical to shared-types' Currency —
 * TypeScript's structural type system means the two types are interchangeable
 * at compile time. If the currency set ever diverges, the domain type wins.
 */
export type Currency = 'USD' | 'PEN';
