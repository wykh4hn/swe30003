import { Guard } from '../shared/Guard.ts';
import { Money } from '../shared/Money.ts';

/**
 * One entry in a vehicle's maintenance history.
 *
 * Assignment 3 change C6/C11. Assignment 1 Task 1 subtask 2 asked the system to
 * keep "a full historical record" of vehicle changes, and Assignment 2 listed
 * "maintenance history" as something `Vehicle` knows — but no class existed to
 * hold it, so the requirement could not be implemented. This immutable record
 * is that missing associated class.
 */
export class MaintenanceRecord {
  readonly recordedAt: Date;
  readonly description: string;
  readonly cost: Money;
  readonly returnedToServiceAt: Date | undefined;

  private constructor(recordedAt: Date, description: string, cost: Money, returnedToServiceAt: Date | undefined) {
    this.recordedAt = recordedAt;
    this.description = description;
    this.cost = cost;
    this.returnedToServiceAt = returnedToServiceAt;
  }

  static create(params: {
    recordedAt: Date;
    description: unknown;
    cost?: unknown;
    returnedToServiceAt?: Date | undefined;
  }): MaintenanceRecord {
    return new MaintenanceRecord(
      params.recordedAt,
      Guard.text('maintenance.description', params.description, 3, 200),
      Money.of(Number(params.cost ?? 0), 'maintenance.cost'),
      params.returnedToServiceAt,
    );
  }

  /** A record stays open until the vehicle is signed back into service. */
  isOpen(): boolean {
    return this.returnedToServiceAt === undefined;
  }

  closedAt(moment: Date): MaintenanceRecord {
    return new MaintenanceRecord(this.recordedAt, this.description, this.cost, moment);
  }
}
