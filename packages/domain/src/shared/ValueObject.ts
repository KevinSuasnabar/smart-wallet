function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== 'object' || typeof b !== 'object') return false;

  const aObj = a as Record<string, unknown>;
  const bObj = b as Record<string, unknown>;

  const aKeys = Object.keys(aObj);
  const bKeys = Object.keys(bObj);
  if (aKeys.length !== bKeys.length) return false;

  for (const key of aKeys) {
    if (!Object.prototype.hasOwnProperty.call(bObj, key)) return false;
    if (!deepEqual(aObj[key], bObj[key])) return false;
  }

  return true;
}

export abstract class ValueObject<TProps extends object> {
  protected constructor(public readonly props: Readonly<TProps>) {
    Object.freeze(this.props);
  }

  equals(other: ValueObject<TProps> | null | undefined): boolean {
    if (other == null) return false;
    return deepEqual(this.props, other.props);
  }
}
