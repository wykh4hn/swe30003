import { Money } from '../shared/Money.ts';
import type { ShipmentOrder } from '../ordering/ShipmentOrder.ts';
import type { OrderStatus } from '../ordering/OrderStatus.ts';
import { ORDER_STATUSES } from '../ordering/OrderStatus.ts';
import type { Invoice } from '../billing/Invoice.ts';
import type { ReportPeriod } from './ReportPeriod.ts';

/** One shipping lane and how much traffic it carried. */
export interface LaneVolume {
  readonly lane: string;
  readonly orderCount: number;
}

/**
 * Shipment volume, outcome and revenue for a period.
 *
 * Assignment 3 change C2, first half. The marker's note on Assignment 2 was
 * blunt: "Report: too generic". One class was expected to compile shipment
 * statistics, calculate resource utilisation, handle empty periods and stay
 * read-only — four unrelated reasons to change, and no way to know what it
 * actually produced.
 *
 * `Report` is therefore replaced by two focused classes. This one answers "how
 * much did we ship, how well, and what did it earn?"; `ResourceUtilisationReport`
 * answers "how hard did the fleet work?". Each has a single key abstraction.
 *
 * The class remains strictly read-only (non-change N8): it is constructed from
 * domain objects and never writes to them.
 */
export class ShipmentStatisticsReport {
  readonly period: ReportPeriod;
  readonly scopeLabel: string;
  readonly totalOrders: number;
  readonly countsByStatus: Readonly<Record<OrderStatus, number>>;
  readonly deliveredCount: number;
  readonly onTimeCount: number;
  readonly cancelledCount: number;
  readonly rejectedCount: number;
  readonly splitShipmentCount: number;
  readonly totalCargoWeightKg: number;
  readonly revenueInvoiced: Money;
  readonly revenueCollected: Money;
  readonly busiestLanes: readonly LaneVolume[];
  readonly generatedAt: Date;

  private constructor(params: {
    period: ReportPeriod;
    scopeLabel: string;
    orders: readonly ShipmentOrder[];
    invoices: readonly Invoice[];
    generatedAt: Date;
  }) {
    const { orders, invoices } = params;

    this.period = params.period;
    this.scopeLabel = params.scopeLabel;
    this.generatedAt = params.generatedAt;
    this.totalOrders = orders.length;

    const counts = {} as Record<OrderStatus, number>;
    for (const status of ORDER_STATUSES) {
      counts[status] = 0;
    }
    let onTime = 0;
    let weight = 0;
    let split = 0;
    const laneTally = new Map<string, number>();

    for (const order of orders) {
      counts[order.status] += 1;
      weight += order.cargo.totalWeightKg;
      if (order.isSplitShipment) {
        split += 1;
      }
      if (order.wasDeliveredOnTime() === true) {
        onTime += 1;
      }
      const lane = `${order.delivery.pickupAddress.city} -> ${order.delivery.deliveryAddress.city}`;
      laneTally.set(lane, (laneTally.get(lane) ?? 0) + 1);
    }

    this.countsByStatus = Object.freeze(counts);
    this.deliveredCount = counts.DELIVERED;
    this.cancelledCount = counts.CANCELLED;
    this.rejectedCount = counts.REJECTED;
    this.onTimeCount = onTime;
    this.splitShipmentCount = split;
    this.totalCargoWeightKg = Math.round(weight);

    this.revenueInvoiced = Money.sum(invoices.map((invoice) => invoice.total()));
    this.revenueCollected = Money.sum(
      invoices.filter((invoice) => invoice.status === 'SETTLED').map((invoice) => invoice.total()),
    );

    this.busiestLanes = [...laneTally.entries()]
      .map(([lane, orderCount]) => ({ lane, orderCount }))
      .sort((left, right) => right.orderCount - left.orderCount)
      .slice(0, 5);

    Object.freeze(this);
  }

  static compile(params: {
    period: ReportPeriod;
    scopeLabel: string;
    orders: readonly ShipmentOrder[];
    invoices: readonly Invoice[];
    generatedAt: Date;
  }): ShipmentStatisticsReport {
    return new ShipmentStatisticsReport(params);
  }

  /** Assignment 1 Task 10 variant 1b: an empty period is a valid result, not an error. */
  isEmpty(): boolean {
    return this.totalOrders === 0;
  }

  onTimeDeliveryRate(): number {
    return this.deliveredCount === 0 ? 0 : Math.round((this.onTimeCount / this.deliveredCount) * 1000) / 10;
  }

  completionRate(): number {
    return this.totalOrders === 0 ? 0 : Math.round((this.deliveredCount / this.totalOrders) * 1000) / 10;
  }

  collectionRate(): number {
    const invoiced = this.revenueInvoiced.amount;
    return invoiced === 0 ? 0 : Math.round((this.revenueCollected.amount / invoiced) * 1000) / 10;
  }

  /** A one-line summary for the console log and the dashboard header. */
  headline(): string {
    if (this.isEmpty()) {
      return `No shipment activity for ${this.period.label} (${this.scopeLabel}).`;
    }
    return `${this.totalOrders} orders, ${this.deliveredCount} delivered (${this.onTimeDeliveryRate()}% on time), ${this.revenueCollected.format()} collected.`;
  }
}
