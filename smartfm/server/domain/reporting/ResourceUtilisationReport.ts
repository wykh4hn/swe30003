import type { Vehicle } from '../fleet/Vehicle.ts';
import type { Driver } from '../people/Driver.ts';
import type { Itinerary } from '../dispatch/Itinerary.ts';
import type { ReportPeriod } from './ReportPeriod.ts';

/** Utilisation of one resource over the reporting period. */
export interface UtilisationRow {
  readonly resourceId: string;
  readonly label: string;
  readonly branchId: string;
  readonly itineraryCount: number;
  readonly committedHours: number;
  readonly utilisationPercent: number;
  readonly currentState: string;
}

/**
 * How hard the fleet and the drivers worked over a period.
 *
 * Assignment 3 change C2, second half — the other class Assignment 2's generic
 * `Report` was silently doing. This one is what Assignment 1's pain point
 * "inefficient allocation of resources results in underutilised vehicles and
 * drivers" actually asks for, and it is only computable because change C5 made
 * `Itinerary` survive its order: a completed itinerary still records which
 * vehicle and driver were committed, and for how long.
 *
 * Read-only (non-change N8): it reads vehicles, drivers and itineraries and
 * changes none of them.
 */
export class ResourceUtilisationReport {
  readonly period: ReportPeriod;
  readonly scopeLabel: string;
  readonly vehicleRows: readonly UtilisationRow[];
  readonly driverRows: readonly UtilisationRow[];
  readonly totalItineraries: number;
  readonly generatedAt: Date;

  private constructor(params: {
    period: ReportPeriod;
    scopeLabel: string;
    vehicles: readonly Vehicle[];
    drivers: readonly Driver[];
    itineraries: readonly Itinerary[];
    generatedAt: Date;
  }) {
    const { period, vehicles, drivers, itineraries } = params;
    const capacityHours = period.capacityHours();

    this.period = period;
    this.scopeLabel = params.scopeLabel;
    this.generatedAt = params.generatedAt;
    this.totalItineraries = itineraries.length;

    this.vehicleRows = vehicles
      .map((vehicle) => {
        const worked = itineraries.filter((itinerary) => itinerary.vehicleId === vehicle.id);
        return ResourceUtilisationReport.buildRow(
          vehicle.id,
          vehicle.label(),
          vehicle.branchId,
          worked,
          capacityHours,
          vehicle.status,
        );
      })
      .sort((left, right) => right.utilisationPercent - left.utilisationPercent);

    this.driverRows = drivers
      .map((driver) => {
        const worked = itineraries.filter((itinerary) => itinerary.driverId === driver.id);
        return ResourceUtilisationReport.buildRow(
          driver.id,
          driver.fullName,
          driver.branchId,
          worked,
          capacityHours,
          driver.availability,
        );
      })
      .sort((left, right) => right.utilisationPercent - left.utilisationPercent);

    Object.freeze(this);
  }

  private static buildRow(
    resourceId: string,
    label: string,
    branchId: string,
    worked: readonly Itinerary[],
    capacityHours: number,
    currentState: string,
  ): UtilisationRow {
    const committedHours = Math.round(worked.reduce((total, item) => total + item.committedHours(), 0) * 10) / 10;
    const utilisationPercent =
      capacityHours === 0 ? 0 : Math.min(100, Math.round((committedHours / capacityHours) * 1000) / 10);
    return {
      resourceId,
      label,
      branchId,
      itineraryCount: worked.length,
      committedHours,
      utilisationPercent,
      currentState,
    };
  }

  static compile(params: {
    period: ReportPeriod;
    scopeLabel: string;
    vehicles: readonly Vehicle[];
    drivers: readonly Driver[];
    itineraries: readonly Itinerary[];
    generatedAt: Date;
  }): ResourceUtilisationReport {
    return new ResourceUtilisationReport(params);
  }

  /** Assignment 1 Task 10 variant 1b. */
  isEmpty(): boolean {
    return this.totalItineraries === 0;
  }

  averageVehicleUtilisation(): number {
    return ResourceUtilisationReport.average(this.vehicleRows);
  }

  averageDriverUtilisation(): number {
    return ResourceUtilisationReport.average(this.driverRows);
  }

  /** The resources management should redeploy: active but never used in the period. */
  idleVehicles(): readonly UtilisationRow[] {
    return this.vehicleRows.filter((row) => row.itineraryCount === 0 && row.currentState !== 'RETIRED');
  }

  idleDrivers(): readonly UtilisationRow[] {
    return this.driverRows.filter((row) => row.itineraryCount === 0 && row.currentState !== 'INACTIVE');
  }

  private static average(rows: readonly UtilisationRow[]): number {
    if (rows.length === 0) {
      return 0;
    }
    const total = rows.reduce((sum, row) => sum + row.utilisationPercent, 0);
    return Math.round((total / rows.length) * 10) / 10;
  }

  headline(): string {
    if (this.isEmpty()) {
      return `No resource activity for ${this.period.label} (${this.scopeLabel}).`;
    }
    return `${this.totalItineraries} itineraries — vehicles ${this.averageVehicleUtilisation()}% utilised, drivers ${this.averageDriverUtilisation()}%; ${this.idleVehicles().length} vehicle(s) idle.`;
  }
}
