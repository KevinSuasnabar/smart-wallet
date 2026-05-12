import type { DomainEvent } from './DomainEvent.js';
import { Entity } from './Entity.js';

export abstract class AggregateRoot<TId> extends Entity<TId> {
  private readonly _domainEvents: DomainEvent[] = [];

  protected addDomainEvent(event: DomainEvent): void {
    this._domainEvents.push(event);
  }

  pullDomainEvents(): DomainEvent[] {
    const events = [...this._domainEvents];
    this._domainEvents.length = 0;
    return events;
  }
}
