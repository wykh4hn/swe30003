import { Route } from '../domain/dispatch/Route.ts';
import { RouteLeg } from '../domain/dispatch/RouteLeg.ts';
import { Waypoint } from '../domain/dispatch/Waypoint.ts';
import { RuleViolationError } from '../domain/shared/DomainError.ts';
import type { ServicedCity } from '../domain/shared/Address.ts';
import type { RouteRepository } from '../infrastructure/persistence/DispatchRepositories.ts';
import type { IdGenerator } from '../infrastructure/IdGenerator.ts';

/** Published road distances between the cities ABC-Trans serves, in kilometres. */
const LANE_DISTANCE_KM: Readonly<Record<string, number>> = {
  'Ha Noi|Hai Phong': 120,
  'Ha Noi|Da Nang': 770,
  'Ha Noi|Nha Trang': 1_280,
  'Ha Noi|Ho Chi Minh City': 1_730,
  'Ha Noi|Can Tho': 1_900,
  'Hai Phong|Da Nang': 880,
  'Hai Phong|Nha Trang': 1_390,
  'Hai Phong|Ho Chi Minh City': 1_840,
  'Hai Phong|Can Tho': 2_010,
  'Da Nang|Nha Trang': 530,
  'Da Nang|Ho Chi Minh City': 960,
  'Da Nang|Can Tho': 1_130,
  'Nha Trang|Ho Chi Minh City': 430,
  'Nha Trang|Can Tho': 600,
  'Ho Chi Minh City|Can Tho': 170,
};

/** Trunk hubs used to break a long run into legs with a mandatory rest stop. */
const TRUNK_HUBS: readonly ServicedCity[] = ['Da Nang', 'Nha Trang'];

const AVERAGE_SPEED_KPH = 55;
const REST_MINUTES_PER_HUB = 45;
const LONG_HAUL_THRESHOLD_KM = 700;

/**
 * Builds and caches the routes SmartFM plans against.
 *
 * Assignment 3 change C4 depends on this class existing. Because a `Route` is
 * now a reusable lane rather than something each order owns, *something* has to
 * decide what the lane looks like and hand out the shared instance. Assignment 2
 * gave that job to `Branch` ("create compatible route and itinerary
 * assignments"), which cannot be right — a route between Ha Noi and Can Tho is
 * not a fact any single branch owns.
 *
 * Long runs are split at a trunk hub (change C6), which is why `Route` needed
 * `RouteLeg` and `Waypoint` at all: a 1,730 km run is two legs with a rest, not
 * one number.
 */
export class RoutePlanner {
  private readonly routes: RouteRepository;
  private readonly ids: IdGenerator;

  constructor(routes: RouteRepository, ids: IdGenerator) {
    this.routes = routes;
    this.ids = ids;
  }

  /** Returns the cached route for the lane, planning and storing it on first use. */
  async planRoute(origin: ServicedCity, destination: ServicedCity): Promise<Route> {
    if (origin === destination) {
      throw new RuleViolationError(
        'Pickup and delivery are in the same city. SmartFM handles inter-city freight only.',
        { origin, destination },
      );
    }
    const existing = await this.routes.findByLane(origin, destination);
    if (existing !== undefined) {
      return existing;
    }
    const route = new Route({
      id: this.ids.next('rte'),
      origin,
      destination,
      legs: this.buildLegs(origin, destination),
    });
    await this.routes.save(route);
    return route;
  }

  /** Distance for a lane, in either direction. */
  static distanceBetween(origin: ServicedCity, destination: ServicedCity): number {
    const direct = LANE_DISTANCE_KM[`${origin}|${destination}`];
    if (direct !== undefined) {
      return direct;
    }
    const reverse = LANE_DISTANCE_KM[`${destination}|${origin}`];
    if (reverse !== undefined) {
      return reverse;
    }
    throw new RuleViolationError(
      `No published road distance exists between ${origin} and ${destination}.`,
      { origin, destination },
    );
  }

  private buildLegs(origin: ServicedCity, destination: ServicedCity): RouteLeg[] {
    const totalDistance = RoutePlanner.distanceBetween(origin, destination);
    const hub = this.chooseHub(origin, destination, totalDistance);

    const start = Waypoint.create(origin, `${origin} depot`, false);
    const end = Waypoint.create(destination, `${destination} depot`, false);

    if (hub === undefined) {
      return [RouteLeg.create(start, end, totalDistance, RoutePlanner.travelMinutes(totalDistance, 0))];
    }

    const hubPoint = Waypoint.create(hub, `${hub} trunk hub`, true);
    const firstDistance = RoutePlanner.distanceBetween(origin, hub);
    const secondDistance = RoutePlanner.distanceBetween(hub, destination);

    return [
      RouteLeg.create(start, hubPoint, firstDistance, RoutePlanner.travelMinutes(firstDistance, 1)),
      RouteLeg.create(hubPoint, end, secondDistance, RoutePlanner.travelMinutes(secondDistance, 0)),
    ];
  }

  /** Picks the hub that adds least detour, or none for a short run. */
  private chooseHub(origin: ServicedCity, destination: ServicedCity, directDistance: number): ServicedCity | undefined {
    if (directDistance <= LONG_HAUL_THRESHOLD_KM) {
      return undefined;
    }
    let best: ServicedCity | undefined;
    let bestDetour = Number.POSITIVE_INFINITY;

    for (const hub of TRUNK_HUBS) {
      if (hub === origin || hub === destination) {
        continue;
      }
      let viaDistance: number;
      try {
        viaDistance = RoutePlanner.distanceBetween(origin, hub) + RoutePlanner.distanceBetween(hub, destination);
      } catch {
        continue;
      }
      const detour = viaDistance - directDistance;
      if (detour < bestDetour) {
        bestDetour = detour;
        best = hub;
      }
    }
    return best;
  }

  private static travelMinutes(distanceKm: number, restStops: number): number {
    return Math.round((distanceKm / AVERAGE_SPEED_KPH) * 60) + restStops * REST_MINUTES_PER_HUB;
  }
}
