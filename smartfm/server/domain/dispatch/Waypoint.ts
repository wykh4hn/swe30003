import { Guard } from '../shared/Guard.ts';
import type { ServicedCity } from '../shared/Address.ts';
import { SERVICED_CITIES } from '../shared/Address.ts';

/**
 * A named point a route passes through.
 *
 * Assignment 3 change C6, answering the marker's note that "Route, Itinerary:
 * missing additional associated classes". Assignment 2 modelled `Route` as a
 * single data holder carrying "the planned path and distance", which cannot
 * express a multi-city trunk run — the very thing ABC-Trans does. `Waypoint` and
 * `RouteLeg` give a route internal structure.
 */
export class Waypoint {
  readonly city: ServicedCity;
  readonly label: string;
  readonly isHub: boolean;

  private constructor(city: ServicedCity, label: string, isHub: boolean) {
    this.city = city;
    this.label = label;
    this.isHub = isHub;
  }

  static create(city: unknown, label: unknown, isHub = false): Waypoint {
    return new Waypoint(
      Guard.oneOf('waypoint.city', city, SERVICED_CITIES),
      Guard.text('waypoint.label', label, 2, 100),
      isHub,
    );
  }

  equals(other: Waypoint): boolean {
    return this.city === other.city && this.label === other.label;
  }

  format(): string {
    return this.isHub ? `${this.label} (hub)` : this.label;
  }
}
