import type { OrderStatus } from './OrderStatus.ts';

/**
 * One immutable entry in a shipment order's change history.
 *
 * Assignment 3 change C6. Assignment 1 Task 6 subtask 6 required the system to
 * "record the change history" and Assignment 1 §9.1 required an auditable log of
 * every order confirmation, yet Assignment 2 had no class that could hold one.
 * `ShipmentOrder` composes these records: they cannot outlive their order.
 */
export class OrderChangeRecord {
  readonly recordedAt: Date;
  readonly actor: string;
  readonly summary: string;
  readonly fromStatus: OrderStatus | undefined;
  readonly toStatus: OrderStatus | undefined;

  constructor(params: {
    recordedAt: Date;
    actor: string;
    summary: string;
    fromStatus?: OrderStatus | undefined;
    toStatus?: OrderStatus | undefined;
  }) {
    this.recordedAt = params.recordedAt;
    this.actor = params.actor;
    this.summary = params.summary;
    this.fromStatus = params.fromStatus;
    this.toStatus = params.toStatus;
  }

  isStatusChange(): boolean {
    return this.toStatus !== undefined;
  }

  format(): string {
    const when = this.recordedAt.toISOString().replace('T', ' ').slice(0, 16);
    return `${when} — ${this.actor}: ${this.summary}`;
  }
}
