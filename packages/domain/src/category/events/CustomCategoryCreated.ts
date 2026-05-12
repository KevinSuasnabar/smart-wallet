import type { DomainEvent } from '../../shared/DomainEvent.js';
import type { CategoryType } from '../CategoryType.js';

export interface CustomCategoryCreated extends DomainEvent {
  readonly eventName: 'CustomCategoryCreated';
  readonly categoryId: string;
  readonly userId: string;
  readonly name: string;
  readonly type: CategoryType;
}
