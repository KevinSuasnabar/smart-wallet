export abstract class Entity<TId> {
  protected constructor(public readonly id: TId) {}

  equals(other: Entity<TId> | null | undefined): boolean {
    if (other == null) return false;
    return this.id === other.id;
  }
}
