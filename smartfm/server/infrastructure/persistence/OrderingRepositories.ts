import { Repository } from './Repository.ts';
import { RecordMapper } from './RecordMapper.ts';
import type { JsonFileStore, StoredRecord } from './JsonFileStore.ts';
import { ShipmentOrder } from '../../domain/ordering/ShipmentOrder.ts';
import { CargoDetails } from '../../domain/ordering/CargoDetails.ts';
import { DeliveryDetails } from '../../domain/ordering/DeliveryDetails.ts';
import type { ServiceLevel } from '../../domain/ordering/DeliveryDetails.ts';
import { OrderChangeRecord } from '../../domain/ordering/OrderChangeRecord.ts';
import { OrderLifecycle } from '../../domain/ordering/OrderStatus.ts';
import type { OrderStatus } from '../../domain/ordering/OrderStatus.ts';
import { CapacityHold } from '../../domain/ordering/CapacityHold.ts';
import { TrackingUpdate } from '../../domain/tracking/TrackingUpdate.ts';
import type { TrackingState } from '../../domain/tracking/TrackingUpdate.ts';

/**
 * Persistence for shipment orders.
 *
 * The order's *composed* parts — cargo, delivery details, tracking history and
 * change history — are stored inline in the order's row, because that is exactly
 * what composition means: they have no independent lifecycle and are never
 * queried without their order.
 *
 * Its *aggregated* parts — itineraries (change C5) and the invoice — are stored
 * as identifiers, because those objects live in their own collections and
 * outlive the order. The persistence design therefore mirrors the corrected
 * class diagram rather than flattening everything into one shape.
 */
export class ShipmentOrderRepository extends Repository<ShipmentOrder> {
  constructor(store: JsonFileStore) {
    super(store, 'orders');
  }

  protected override toRecord(entity: ShipmentOrder): StoredRecord {
    return {
      id: entity.id,
      reference: entity.reference,
      customerId: entity.customerId,
      branchId: entity.branchId,
      status: entity.status,
      quotedPrice: RecordMapper.moneyToRecord(entity.quotedPrice),
      placedAt: RecordMapper.dateToRecord(entity.placedAt),
      rejectionReason: entity.rejectionReason ?? null,
      invoiceId: entity.invoiceId ?? null,
      itineraryIds: [...entity.itineraryIds],
      cargo: {
        description: entity.cargo.description,
        unitCount: entity.cargo.unitCount,
        unitWeightKg: entity.cargo.unitWeightKg,
        totalVolumeM3: entity.cargo.totalVolumeM3,
        handling: entity.cargo.handling,
        declaredValue: entity.cargo.declaredValue,
      },
      delivery: {
        pickupAddress: RecordMapper.addressToRecord(entity.delivery.pickupAddress),
        deliveryAddress: RecordMapper.addressToRecord(entity.delivery.deliveryAddress),
        requestedPickupAt: RecordMapper.dateToRecord(entity.delivery.requestedPickupAt),
        requiredDeliveryBy: RecordMapper.dateToRecord(entity.delivery.requiredDeliveryBy),
        serviceLevel: entity.delivery.serviceLevel,
        recipientName: entity.delivery.recipientName,
        recipientPhone: entity.delivery.recipientPhone,
      },
      tracking: entity.trackingHistory.map((update) => ({
        id: update.id,
        itineraryId: update.itineraryId,
        recordedByDriverId: update.recordedByDriverId,
        recordedAt: RecordMapper.dateToRecord(update.recordedAt),
        state: update.state,
        locationLabel: update.locationLabel,
        estimatedArrival: RecordMapper.optionalDateToRecord(update.estimatedArrival),
        note: update.note ?? null,
      })),
      history: entity.changeHistory.map((change) => ({
        recordedAt: RecordMapper.dateToRecord(change.recordedAt),
        actor: change.actor,
        summary: change.summary,
        fromStatus: change.fromStatus ?? null,
        toStatus: change.toStatus ?? null,
      })),
    };
  }

  protected override fromRecord(record: StoredRecord): ShipmentOrder {
    const orderId = String(record['id']);
    const cargoRow = RecordMapper.nested(record, 'cargo');
    const deliveryRow = RecordMapper.nested(record, 'delivery');

    const cargo = CargoDetails.create({
      description: cargoRow['description'],
      unitCount: cargoRow['unitCount'],
      unitWeightKg: cargoRow['unitWeightKg'],
      totalVolumeM3: cargoRow['totalVolumeM3'],
      handling: cargoRow['handling'],
      declaredValue: cargoRow['declaredValue'],
    });

    const delivery = DeliveryDetails.rehydrate({
      pickupAddress: RecordMapper.addressFromRecord(deliveryRow['pickupAddress']),
      deliveryAddress: RecordMapper.addressFromRecord(deliveryRow['deliveryAddress']),
      requestedPickupAt: RecordMapper.dateFromRecord(deliveryRow['requestedPickupAt']),
      requiredDeliveryBy: RecordMapper.dateFromRecord(deliveryRow['requiredDeliveryBy']),
      serviceLevel: String(deliveryRow['serviceLevel']) as ServiceLevel,
      recipientName: String(deliveryRow['recipientName']),
      recipientPhone: String(deliveryRow['recipientPhone']),
    });

    const tracking = RecordMapper.nestedList(record, 'tracking').map((row) =>
      TrackingUpdate.rehydrate({
        id: String(row['id']),
        orderId,
        itineraryId: String(row['itineraryId']),
        recordedByDriverId: String(row['recordedByDriverId']),
        recordedAt: RecordMapper.dateFromRecord(row['recordedAt']),
        state: String(row['state']) as TrackingState,
        locationLabel: String(row['locationLabel']),
        estimatedArrival: RecordMapper.optionalDateFromRecord(row['estimatedArrival']),
        note: RecordMapper.optionalTextFromRecord(row['note']),
      }),
    );

    const history = RecordMapper.nestedList(record, 'history').map(
      (row) =>
        new OrderChangeRecord({
          recordedAt: RecordMapper.dateFromRecord(row['recordedAt']),
          actor: String(row['actor']),
          summary: String(row['summary']),
          fromStatus: (RecordMapper.optionalTextFromRecord(row['fromStatus']) as OrderStatus) ?? undefined,
          toStatus: (RecordMapper.optionalTextFromRecord(row['toStatus']) as OrderStatus) ?? undefined,
        }),
    );

    return new ShipmentOrder({
      id: orderId,
      reference: String(record['reference']),
      customerId: String(record['customerId']),
      branchId: String(record['branchId']),
      cargo,
      delivery,
      quotedPrice: RecordMapper.moneyFromRecord(record['quotedPrice']),
      placedAt: RecordMapper.dateFromRecord(record['placedAt']),
      status: String(record['status']) as OrderStatus,
      rejectionReason: RecordMapper.optionalTextFromRecord(record['rejectionReason']),
      invoiceId: RecordMapper.optionalTextFromRecord(record['invoiceId']),
      itineraryIds: RecordMapper.stringList(record, 'itineraryIds'),
      tracking,
      history,
    });
  }

  async findByCustomer(customerId: string): Promise<ShipmentOrder[]> {
    const orders = await this.findWhere((order) => order.isOwnedBy(customerId));
    return orders.sort((left, right) => right.placedAt.getTime() - left.placedAt.getTime());
  }

  async findByReference(reference: string): Promise<ShipmentOrder | undefined> {
    const wanted = reference.trim().toUpperCase();
    return this.findOneWhere((order) => order.reference.toUpperCase() === wanted);
  }

  /** Assignment 1 Task 7 subtask 1: the branch's queue of work waiting for review. */
  async findPendingForBranch(branchId: string): Promise<ShipmentOrder[]> {
    const orders = await this.findWhere((order) => order.branchId === branchId && order.status === 'PENDING');
    return orders.sort((left, right) => left.placedAt.getTime() - right.placedAt.getTime());
  }

  async findOpenForCustomer(customerId: string): Promise<ShipmentOrder[]> {
    return this.findWhere((order) => order.isOwnedBy(customerId) && order.isOpen());
  }

  async findPlacedBetween(start: Date, end: Date, branchId?: string): Promise<ShipmentOrder[]> {
    return this.findWhere(
      (order) =>
        order.placedAt.getTime() >= start.getTime() &&
        order.placedAt.getTime() < end.getTime() &&
        (branchId === undefined || order.branchId === branchId),
    );
  }

  async countOpenForBranch(branchId: string): Promise<number> {
    return this.count((order) => order.branchId === branchId && OrderLifecycle.isOpen(order.status));
  }
}

/** Persistence for temporary capacity reservations (change C14). */
export class CapacityHoldRepository extends Repository<CapacityHold> {
  constructor(store: JsonFileStore) {
    super(store, 'capacity-holds');
  }

  protected override toRecord(entity: CapacityHold): StoredRecord {
    return {
      id: entity.id,
      vehicleId: entity.vehicleId,
      customerId: entity.customerId,
      orderId: entity.orderId ?? null,
      heldFrom: RecordMapper.dateToRecord(entity.heldFrom),
      expiresAt: RecordMapper.dateToRecord(entity.expiresAt),
      released: entity.isReleased,
    };
  }

  protected override fromRecord(record: StoredRecord): CapacityHold {
    return new CapacityHold({
      id: String(record['id']),
      vehicleId: String(record['vehicleId']),
      customerId: String(record['customerId']),
      orderId: RecordMapper.optionalTextFromRecord(record['orderId']),
      heldFrom: RecordMapper.dateFromRecord(record['heldFrom']),
      expiresAt: RecordMapper.dateFromRecord(record['expiresAt']),
      released: Boolean(record['released']),
    });
  }

  /** Holds that still block another customer from taking the same vehicle. */
  async findActive(now: Date): Promise<CapacityHold[]> {
    return this.findWhere((hold) => hold.isActive(now));
  }

  async findActiveForVehicle(vehicleId: string, now: Date): Promise<CapacityHold | undefined> {
    return this.findOneWhere((hold) => hold.vehicleId === vehicleId && hold.isActive(now));
  }

  async findActiveForCustomer(customerId: string, now: Date): Promise<CapacityHold[]> {
    return this.findWhere((hold) => hold.isHeldBy(customerId) && hold.isActive(now) && hold.orderId === undefined);
  }

  async findForOrder(orderId: string): Promise<CapacityHold[]> {
    return this.findWhere((hold) => hold.orderId === orderId);
  }
}
