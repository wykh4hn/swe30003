import { Repository } from './Repository.ts';
import { RecordMapper } from './RecordMapper.ts';
import type { JsonFileStore, StoredRecord } from './JsonFileStore.ts';
import { Route } from '../../domain/dispatch/Route.ts';
import { RouteLeg } from '../../domain/dispatch/RouteLeg.ts';
import { Waypoint } from '../../domain/dispatch/Waypoint.ts';
import { Itinerary } from '../../domain/dispatch/Itinerary.ts';
import type { ItineraryStatus } from '../../domain/dispatch/Itinerary.ts';
import type { ServicedCity } from '../../domain/shared/Address.ts';

/**
 * Persistence for planned routes.
 *
 * Change C4 is what makes this collection exist at all. Under the Assignment 2
 * design, where `ShipmentOrder` composed its route, a route would have been
 * stored inside each order's row and duplicated for every shipment on the same
 * lane. Because routes are now shared, reusable objects, they are stored once
 * and looked up by lane.
 *
 * Legs and waypoints (change C6) are stored inline: they *are* composed by the
 * route and have no meaning apart from it.
 */
export class RouteRepository extends Repository<Route> {
  constructor(store: JsonFileStore) {
    super(store, 'routes');
  }

  protected override toRecord(entity: Route): StoredRecord {
    return {
      id: entity.id,
      origin: entity.origin,
      destination: entity.destination,
      legs: entity.legs.map((leg) => ({
        from: { city: leg.from.city, label: leg.from.label, isHub: leg.from.isHub },
        to: { city: leg.to.city, label: leg.to.label, isHub: leg.to.isHub },
        distanceKm: leg.distanceKm,
        estimatedMinutes: leg.estimatedMinutes,
      })),
    };
  }

  protected override fromRecord(record: StoredRecord): Route {
    const legs = RecordMapper.nestedList(record, 'legs').map((row) => {
      const from = RecordMapper.nested(row, 'from');
      const to = RecordMapper.nested(row, 'to');
      return RouteLeg.create(
        Waypoint.create(from['city'], from['label'], Boolean(from['isHub'])),
        Waypoint.create(to['city'], to['label'], Boolean(to['isHub'])),
        row['distanceKm'],
        row['estimatedMinutes'],
      );
    });

    return new Route({
      id: String(record['id']),
      origin: String(record['origin']) as ServicedCity,
      destination: String(record['destination']) as ServicedCity,
      legs,
    });
  }

  /** The lane lookup that makes route reuse possible. */
  async findByLane(origin: ServicedCity, destination: ServicedCity): Promise<Route | undefined> {
    return this.findOneWhere((route) => route.serves(origin, destination));
  }
}

/**
 * Persistence for itineraries.
 *
 * Change C5: itineraries are their own collection because they outlive the order
 * they served. `ResourceUtilisationReport` reads completed itineraries months
 * later, which would be impossible had they been composed inside the order.
 */
export class ItineraryRepository extends Repository<Itinerary> {
  constructor(store: JsonFileStore) {
    super(store, 'itineraries');
  }

  protected override toRecord(entity: Itinerary): StoredRecord {
    return {
      id: entity.id,
      orderId: entity.orderId,
      branchId: entity.branchId,
      vehicleId: entity.vehicleId,
      driverId: entity.driverId,
      routeId: entity.routeId,
      legNumber: entity.legNumber,
      assignedWeightKg: entity.assignedWeightKg,
      window: RecordMapper.rangeToRecord(entity.window),
      status: entity.status,
      completedAt: RecordMapper.optionalDateToRecord(entity.completedAt),
    };
  }

  protected override fromRecord(record: StoredRecord): Itinerary {
    return new Itinerary({
      id: String(record['id']),
      orderId: String(record['orderId']),
      branchId: String(record['branchId']),
      vehicleId: String(record['vehicleId']),
      driverId: String(record['driverId']),
      routeId: String(record['routeId']),
      legNumber: Number(record['legNumber']),
      assignedWeightKg: Number(record['assignedWeightKg']),
      window: RecordMapper.rangeFromRecord(record['window']),
      status: String(record['status']) as ItineraryStatus,
      completedAt: RecordMapper.optionalDateFromRecord(record['completedAt']),
    });
  }

  async findByOrder(orderId: string): Promise<Itinerary[]> {
    const found = await this.findWhere((itinerary) => itinerary.orderId === orderId);
    return found.sort((left, right) => left.legNumber - right.legNumber);
  }

  async findByDriver(driverId: string): Promise<Itinerary[]> {
    return this.findWhere((itinerary) => itinerary.driverId === driverId);
  }

  /** Everything a driver still has to do, newest last. */
  async findLiveForDriver(driverId: string): Promise<Itinerary[]> {
    const found = await this.findWhere((itinerary) => itinerary.driverId === driverId && itinerary.isLive());
    return found.sort((left, right) => left.window.start.getTime() - right.window.start.getTime());
  }

  /** Used to guarantee a vehicle or driver is never double-booked. */
  async findLive(): Promise<Itinerary[]> {
    return this.findWhere((itinerary) => itinerary.isLive());
  }

  async findCompletedBetween(start: Date, end: Date, branchId?: string): Promise<Itinerary[]> {
    return this.findWhere(
      (itinerary) =>
        itinerary.window.start.getTime() < end.getTime() &&
        itinerary.window.end.getTime() >= start.getTime() &&
        (branchId === undefined || itinerary.branchId === branchId),
    );
  }
}
