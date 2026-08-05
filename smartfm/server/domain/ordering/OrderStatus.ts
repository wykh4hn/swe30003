export const ORDER_STATUSES = [
  'PENDING',
  'ACCEPTED',
  'REJECTED',
  'DISPATCHED',
  'IN_TRANSIT',
  'DELIVERED',
  'FAILED_DELIVERY',
  'CANCELLED',
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

/**
 * The permitted lifecycle of a shipment order, as an explicit transition table.
 *
 * Assignment 3 change C15. Assignment 2 stated in prose that `ShipmentOrder`
 * "controls permitted lifecycle transitions" but never said what they were, so
 * an implementer had to invent them — this was one of the clearest cases where
 * the initial design required interpretation (see the reflection, §II).
 * Publishing the table makes the rule reviewable and testable, and keeps
 * `ShipmentOrder` free of a long chain of conditionals.
 *
 * Assignment 2 non-change N5 stands: no state *subclasses* were introduced. The
 * lifecycle is small and every state shares the same behaviour, so a class per
 * state would add eight types without adding polymorphic behaviour.
 */
const ALLOWED_TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  PENDING: ['ACCEPTED', 'REJECTED', 'CANCELLED'],
  ACCEPTED: ['DISPATCHED', 'CANCELLED'],
  REJECTED: [],
  // DISPATCHED -> DELIVERED is permitted directly: a same-city express run can
  // be completed before the driver has cause to post an in-transit checkpoint.
  DISPATCHED: ['IN_TRANSIT', 'DELIVERED', 'FAILED_DELIVERY'],
  IN_TRANSIT: ['DELIVERED', 'FAILED_DELIVERY'],
  DELIVERED: [],
  FAILED_DELIVERY: ['IN_TRANSIT', 'CANCELLED'],
  CANCELLED: [],
};

/** Statuses after which the customer may no longer amend or self-cancel. */
const CUSTOMER_MODIFIABLE: readonly OrderStatus[] = ['PENDING', 'ACCEPTED'];

/** Statuses that still consume a vehicle and a driver. */
const RESOURCE_HOLDING: readonly OrderStatus[] = ['ACCEPTED', 'DISPATCHED', 'IN_TRANSIT', 'FAILED_DELIVERY'];

/** Statuses that count as "open" when deciding whether an account may close. */
const OPEN_STATUSES: readonly OrderStatus[] = ['PENDING', 'ACCEPTED', 'DISPATCHED', 'IN_TRANSIT', 'FAILED_DELIVERY'];

export class OrderLifecycle {
  private constructor() {
    // Static policy holder; never instantiated.
  }

  static permittedNextStates(current: OrderStatus): readonly OrderStatus[] {
    return ALLOWED_TRANSITIONS[current];
  }

  static canTransition(current: OrderStatus, next: OrderStatus): boolean {
    return ALLOWED_TRANSITIONS[current].includes(next);
  }

  /** Assignment 1 Task 6 precondition: amendment and self-cancellation windows. */
  static isCustomerModifiable(current: OrderStatus): boolean {
    return CUSTOMER_MODIFIABLE.includes(current);
  }

  static holdsResources(current: OrderStatus): boolean {
    return RESOURCE_HOLDING.includes(current);
  }

  static isOpen(current: OrderStatus): boolean {
    return OPEN_STATUSES.includes(current);
  }

  static isTerminal(current: OrderStatus): boolean {
    return ALLOWED_TRANSITIONS[current].length === 0;
  }

  /** Plain-language wording for the customer tracking view (Assignment 1 Task 8, subtask 2). */
  static describe(current: OrderStatus): string {
    switch (current) {
      case 'PENDING':
        return 'Awaiting branch review';
      case 'ACCEPTED':
        return 'Accepted, awaiting dispatch';
      case 'REJECTED':
        return 'Rejected by branch';
      case 'DISPATCHED':
        return 'Picked up';
      case 'IN_TRANSIT':
        return 'In transit';
      case 'DELIVERED':
        return 'Delivered';
      case 'FAILED_DELIVERY':
        return 'Delivery attempt failed';
      case 'CANCELLED':
        return 'Cancelled';
      default:
        return current;
    }
  }
}
