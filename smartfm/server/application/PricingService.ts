import { InvoiceLine } from '../domain/billing/InvoiceLine.ts';
import { Money } from '../domain/shared/Money.ts';
import type { CargoDetails } from '../domain/ordering/CargoDetails.ts';
import type { DeliveryDetails } from '../domain/ordering/DeliveryDetails.ts';
import type { Route } from '../domain/dispatch/Route.ts';

/** Published tariff. Kept in one place so a rate change is a single edit. */
const TARIFF = {
  baseHandlingFeeDong: 250_000,
  lineHaulDongPerKm: 11_000,
  weightDongPerKg: 900,
} as const;

/**
 * Works out what a shipment costs, as itemised invoice lines.
 *
 * Assignment 3 change C13 — a responsibility the Assignment 2 design assumed but
 * never assigned. Assignment 2's Scenario 1 step 3 had `Branch` offering vehicles
 * "with price and distance information" and Scenario 1 step 4 had the customer
 * reviewing "the total cost", yet no class owned pricing. An implementer had to
 * decide for themselves whether price belonged to `Branch`, `ShipmentOrder`,
 * `Route` or `Invoice`. It belongs to none of them: a tariff is a *policy* that
 * changes for commercial reasons, independently of any of those objects.
 *
 * Returning `InvoiceLine`s rather than a bare total is the key design point. The
 * quote a customer sees before committing and the invoice they are later billed
 * are produced by the same call, so the two can never disagree — which is what
 * Assignment 1 Task 5 subtask 4 ("an itemised summary and the total cost for a
 * final review") actually requires.
 */
export class PricingService {
  /** The itemisation shown at quote time and re-used verbatim on the invoice. */
  quote(cargo: CargoDetails, delivery: DeliveryDetails, route: Route): InvoiceLine[] {
    const distanceKm = route.totalDistanceKm();
    const weightKg = Math.ceil(cargo.totalWeightKg);

    const lines: InvoiceLine[] = [
      InvoiceLine.create('Base handling fee', 1, Money.of(TARIFF.baseHandlingFeeDong)),
      InvoiceLine.create(
        `Line haul ${route.origin} to ${route.destination}`,
        distanceKm,
        Money.of(TARIFF.lineHaulDongPerKm),
      ),
      InvoiceLine.create('Weight handling', weightKg, Money.of(TARIFF.weightDongPerKg)),
    ];

    const subtotal = Money.sum(lines.map((line) => line.lineTotal()));

    const handlingRate = cargo.handlingSurchargeRate();
    if (handlingRate > 0) {
      lines.push(
        InvoiceLine.create(
          `${PricingService.titleCase(cargo.handling)} handling surcharge (${Math.round(handlingRate * 100)}%)`,
          1,
          subtotal.times(handlingRate),
        ),
      );
    }

    const serviceMultiplier = delivery.serviceLevelMultiplier();
    if (serviceMultiplier > 1) {
      lines.push(
        InvoiceLine.create(
          `${PricingService.titleCase(delivery.serviceLevel)} service uplift (${Math.round((serviceMultiplier - 1) * 100)}%)`,
          1,
          subtotal.times(serviceMultiplier - 1),
        ),
      );
    }

    return lines;
  }

  /** Convenience for the availability screen, which shows a price but no breakdown. */
  quoteTotal(cargo: CargoDetails, delivery: DeliveryDetails, route: Route): Money {
    return Money.sum(this.quote(cargo, delivery, route).map((line) => line.lineTotal()));
  }

  private static titleCase(value: string): string {
    const words = value.toLowerCase().split('_');
    return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  }
}
