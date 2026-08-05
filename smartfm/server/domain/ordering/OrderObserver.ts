import type { ShipmentOrder } from './ShipmentOrder.ts';

/** The order events an observer can be told about. */
export const ORDER_EVENTS = [
  'ORDER_PLACED',
  'ORDER_ACCEPTED',
  'ORDER_REJECTED',
  'ORDER_DISPATCHED',
  'ORDER_AMENDED',
  'ORDER_CANCELLED',
  'TRACKING_UPDATED',
  'DELIVERY_COMPLETED',
  'DELIVERY_FAILED',
  'INVOICE_ISSUED',
  'PAYMENT_CONFIRMED',
] as const;

export type OrderEvent = (typeof ORDER_EVENTS)[number];

/**
 * Observer role for the Observer pattern applied to shipment orders.
 *
 * Assignment 3 change C17. Assignment 2 §5.2 claimed the Observer pattern was
 * applied, with `ShipmentOrder` as subject and `Customer` as observer, but the
 * class diagram and CRC cards contained no observer abstraction — so the pattern
 * existed in the prose only and an implementer had to invent the interface. It
 * is now explicit.
 *
 * `Customer` is deliberately *not* the observer. A customer is a domain fact,
 * not a delivery channel; making it the observer would have forced email/SMS
 * concerns into the domain layer. `NotificationService` implements this role
 * and decides, per customer preference, what to send.
 */
export interface OrderObserver {
  onOrderEvent(order: ShipmentOrder, event: OrderEvent, detail: string): void;
}
