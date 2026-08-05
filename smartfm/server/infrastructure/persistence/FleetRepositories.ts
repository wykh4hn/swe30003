import { Repository } from './Repository.ts';
import { RecordMapper } from './RecordMapper.ts';
import type { JsonFileStore, StoredRecord } from './JsonFileStore.ts';
import { Branch } from '../../domain/fleet/Branch.ts';
import { Vehicle } from '../../domain/fleet/Vehicle.ts';
import type { VehicleStatus, VehicleType } from '../../domain/fleet/Vehicle.ts';
import { MaintenanceRecord } from '../../domain/fleet/MaintenanceRecord.ts';

/** Persistence for branches. */
export class BranchRepository extends Repository<Branch> {
  constructor(store: JsonFileStore) {
    super(store, 'branches');
  }

  protected override toRecord(entity: Branch): StoredRecord {
    return {
      id: entity.id,
      name: entity.name,
      code: entity.code,
      address: RecordMapper.addressToRecord(entity.address),
      contact: RecordMapper.contactToRecord(entity.contact),
      active: entity.isActive,
    };
  }

  protected override fromRecord(record: StoredRecord): Branch {
    return new Branch({
      id: String(record['id']),
      name: String(record['name']),
      code: String(record['code']),
      address: RecordMapper.addressFromRecord(record['address']),
      contact: RecordMapper.contactFromRecord(record['contact']),
      active: Boolean(record['active']),
    });
  }

  async findOperational(): Promise<Branch[]> {
    return this.findWhere((branch) => branch.isOperational());
  }

  async findByCity(city: string): Promise<Branch[]> {
    return this.findWhere((branch) => branch.isOperational() && branch.address.city === city);
  }
}

/**
 * Persistence for vehicles.
 *
 * The maintenance log is stored inline: a `MaintenanceRecord` belongs to exactly
 * one vehicle and is never queried independently, so it is part of the vehicle's
 * row rather than a collection of its own.
 */
export class VehicleRepository extends Repository<Vehicle> {
  constructor(store: JsonFileStore) {
    super(store, 'vehicles');
  }

  protected override toRecord(entity: Vehicle): StoredRecord {
    return {
      id: entity.id,
      registration: entity.registration,
      type: entity.type,
      branchId: entity.branchId,
      status: entity.status,
      odometerKm: entity.odometerKm,
      availableFrom: RecordMapper.optionalDateToRecord(entity.availableFrom),
      activeItineraryId: entity.activeItineraryId ?? null,
      maintenanceLog: entity.maintenanceLog.map((entry) => ({
        recordedAt: RecordMapper.dateToRecord(entry.recordedAt),
        description: entry.description,
        cost: RecordMapper.moneyToRecord(entry.cost),
        returnedToServiceAt: RecordMapper.optionalDateToRecord(entry.returnedToServiceAt),
      })),
    };
  }

  protected override fromRecord(record: StoredRecord): Vehicle {
    const maintenanceLog = RecordMapper.nestedList(record, 'maintenanceLog').map((entry) =>
      MaintenanceRecord.create({
        recordedAt: RecordMapper.dateFromRecord(entry['recordedAt']),
        description: entry['description'],
        cost: entry['cost'],
        returnedToServiceAt: RecordMapper.optionalDateFromRecord(entry['returnedToServiceAt']),
      }),
    );

    return new Vehicle({
      id: String(record['id']),
      registration: String(record['registration']),
      type: String(record['type']) as VehicleType,
      branchId: String(record['branchId']),
      status: String(record['status']) as VehicleStatus,
      odometerKm: Number(record['odometerKm'] ?? 0),
      availableFrom: RecordMapper.optionalDateFromRecord(record['availableFrom']),
      activeItineraryId: RecordMapper.optionalTextFromRecord(record['activeItineraryId']),
      maintenanceLog,
    });
  }

  /** Change C3: the aggregation is realised as a query, not a contained collection. */
  async findByBranch(branchId: string): Promise<Vehicle[]> {
    return this.findWhere((vehicle) => vehicle.branchId === branchId);
  }

  async findByRegistration(registration: string): Promise<Vehicle | undefined> {
    const wanted = registration.trim().toUpperCase().replace(/\s+/g, '');
    return this.findOneWhere((vehicle) => vehicle.registration === wanted);
  }

  async findAssignable(): Promise<Vehicle[]> {
    return this.findWhere((vehicle) => vehicle.status === 'AVAILABLE');
  }
}
