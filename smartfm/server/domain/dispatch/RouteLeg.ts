import { Guard } from '../shared/Guard.ts';
import { Waypoint } from './Waypoint.ts';

/**
 * One hop of a route, between two consecutive waypoints.
 *
 * Assignment 3 change C6. Splitting a route into legs is what lets
 * `Route.totalDistanceKm()` and `estimatedDurationMinutes()` be derived rather
 * than stored, so a route can never carry a distance that contradicts its path.
 */
export class RouteLeg {
  readonly from: Waypoint;
  readonly to: Waypoint;
  readonly distanceKm: number;
  readonly estimatedMinutes: number;

  private constructor(from: Waypoint, to: Waypoint, distanceKm: number, estimatedMinutes: number) {
    this.from = from;
    this.to = to;
    this.distanceKm = distanceKm;
    this.estimatedMinutes = estimatedMinutes;
  }

  static create(from: Waypoint, to: Waypoint, distanceKm: unknown, estimatedMinutes: unknown): RouteLeg {
    return new RouteLeg(
      from,
      to,
      Guard.positive('leg.distanceKm', distanceKm, 5_000),
      Guard.positive('leg.estimatedMinutes', estimatedMinutes, 20_000),
    );
  }

  /** Average speed implied by the leg; used when a driver's ETA looks unrealistic. */
  averageSpeedKph(): number {
    return Math.round((this.distanceKm / this.estimatedMinutes) * 60);
  }

  format(): string {
    return `${this.from.format()} -> ${this.to.format()} (${this.distanceKm} km, ${Math.round(this.estimatedMinutes / 60)} h)`;
  }
}
