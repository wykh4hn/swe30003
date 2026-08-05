import { Entity } from '../shared/Entity.ts';
import { RuleViolationError } from '../shared/DomainError.ts';
import type { ServicedCity } from '../shared/Address.ts';
import { RouteLeg } from './RouteLeg.ts';
import { Waypoint } from './Waypoint.ts';

/**
 * A planned path between two cities in the ABC-Trans network.
 *
 * Assignment 3 change C4 — the correction the marker asked for on
 * `(ShipmentOrder, Route)`. Assignment 2 drew composition, meaning each order
 * owned a private route. That is wrong on two counts:
 *
 *   1. A route is a *lane*, not an order-specific fact. Ha Noi to Da Nang is the
 *      same path whoever ships along it, so routes are reusable and are cached
 *      by the `RoutePlanner` rather than rebuilt per order.
 *   2. A route must outlive any single order for utilisation reporting.
 *
 * `ShipmentOrder` therefore holds no reference to a route at all; the route is
 * reached through the `Itinerary` that schedules it.
 *
 * Change C6 also applies: a route is now composed of `RouteLeg`s over
 * `Waypoint`s, and its distance and duration are derived from them.
 */
export class Route extends Entity {
  readonly origin: ServicedCity;
  readonly destination: ServicedCity;
  private readonly routeLegs: RouteLeg[];

  constructor(params: { id: string; origin: ServicedCity; destination: ServicedCity; legs: RouteLeg[] }) {
    super(params.id);
    if (params.legs.length === 0) {
      throw new RuleViolationError('A route must contain at least one leg.');
    }
    this.origin = params.origin;
    this.destination = params.destination;
    this.routeLegs = params.legs;
  }

  get legs(): readonly RouteLeg[] {
    return this.routeLegs;
  }

  /** Derived, never stored — a route cannot contradict its own legs. */
  totalDistanceKm(): number {
    return Math.round(this.routeLegs.reduce((total, leg) => total + leg.distanceKm, 0));
  }

  estimatedDurationMinutes(): number {
    return Math.round(this.routeLegs.reduce((total, leg) => total + leg.estimatedMinutes, 0));
  }

  estimatedDurationHours(): number {
    return Math.round((this.estimatedDurationMinutes() / 60) * 10) / 10;
  }

  waypoints(): readonly Waypoint[] {
    const points: Waypoint[] = [];
    const firstLeg = this.routeLegs[0];
    if (firstLeg !== undefined) {
      points.push(firstLeg.from);
    }
    for (const leg of this.routeLegs) {
      points.push(leg.to);
    }
    return points;
  }

  /** True when this cached route already serves the requested lane. */
  serves(origin: ServicedCity, destination: ServicedCity): boolean {
    return this.origin === origin && this.destination === destination;
  }

  /** Is the lane feasible inside the customer's delivery window? */
  fitsWithin(availableMinutes: number): boolean {
    return this.estimatedDurationMinutes() <= availableMinutes;
  }

  format(): string {
    return this.routeLegs.map((leg) => leg.format()).join(' | ');
  }

  label(): string {
    return `${this.origin} -> ${this.destination} (${this.totalDistanceKm()} km, ~${this.estimatedDurationHours()} h)`;
  }
}
