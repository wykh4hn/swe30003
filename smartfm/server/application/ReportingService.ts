import { ReportPeriod } from '../domain/reporting/ReportPeriod.ts';
import { ShipmentStatisticsReport } from '../domain/reporting/ShipmentStatisticsReport.ts';
import { ResourceUtilisationReport } from '../domain/reporting/ResourceUtilisationReport.ts';
import type { BranchRepository, VehicleRepository } from '../infrastructure/persistence/FleetRepositories.ts';
import type { DriverRepository } from '../infrastructure/persistence/PeopleRepositories.ts';
import type { ShipmentOrderRepository } from '../infrastructure/persistence/OrderingRepositories.ts';
import type { ItineraryRepository } from '../infrastructure/persistence/DispatchRepositories.ts';
import type { InvoiceRepository } from '../infrastructure/persistence/BillingRepositories.ts';
import type { Clock } from '../infrastructure/Clock.ts';

/**
 * Business area 7 — Management Reporting (Assignment 1 Task 10).
 *
 * Part of change C1 and the delivery vehicle for change C2. Assignment 2 had one
 * `Report` class that the marker judged "too generic"; it is now a service that
 * *assembles the inputs* plus two focused, immutable report objects that own
 * their own arithmetic.
 *
 * The split matters for more than tidiness. Gathering data requires repositories
 * (an infrastructure dependency); computing an on-time rate does not. Keeping the
 * calculation inside the report objects means the statistics can be unit-tested
 * from plain domain objects with no storage at all — which is exactly what the
 * reporting tests in `server/test` do.
 */
export class ReportingService {
  private readonly orders: ShipmentOrderRepository;
  private readonly invoices: InvoiceRepository;
  private readonly itineraries: ItineraryRepository;
  private readonly vehicles: VehicleRepository;
  private readonly drivers: DriverRepository;
  private readonly branches: BranchRepository;
  private readonly clock: Clock;

  constructor(dependencies: {
    orders: ShipmentOrderRepository;
    invoices: InvoiceRepository;
    itineraries: ItineraryRepository;
    vehicles: VehicleRepository;
    drivers: DriverRepository;
    branches: BranchRepository;
    clock: Clock;
  }) {
    this.orders = dependencies.orders;
    this.invoices = dependencies.invoices;
    this.itineraries = dependencies.itineraries;
    this.vehicles = dependencies.vehicles;
    this.drivers = dependencies.drivers;
    this.branches = dependencies.branches;
    this.clock = dependencies.clock;
  }

  /** Assignment 1 Task 10, "shipment statistics" metric category. */
  async shipmentStatistics(request: {
    preset?: unknown;
    start?: unknown;
    end?: unknown;
    branchId?: string | undefined;
  }): Promise<ShipmentStatisticsReport> {
    const now = this.clock.now();
    const period = ReportPeriod.resolve(request.preset, now, request.start, request.end);
    const scopeLabel = await this.describeScope(request.branchId);

    const orders = await this.orders.findPlacedBetween(period.range.start, period.range.end, request.branchId);
    const orderIds = new Set(orders.map((order) => order.id));
    const invoices = (await this.invoices.findIssuedBetween(period.range.start, period.range.end)).filter((invoice) =>
      orderIds.has(invoice.orderId),
    );

    return ShipmentStatisticsReport.compile({ period, scopeLabel, orders, invoices, generatedAt: now });
  }

  /** Assignment 1 Task 10, "resource utilization" metric category. */
  async resourceUtilisation(request: {
    preset?: unknown;
    start?: unknown;
    end?: unknown;
    branchId?: string | undefined;
  }): Promise<ResourceUtilisationReport> {
    const now = this.clock.now();
    const period = ReportPeriod.resolve(request.preset, now, request.start, request.end);
    const scopeLabel = await this.describeScope(request.branchId);

    const vehicles =
      request.branchId === undefined ? await this.vehicles.findAll() : await this.vehicles.findByBranch(request.branchId);
    const drivers =
      request.branchId === undefined ? await this.drivers.findAll() : await this.drivers.findByBranch(request.branchId);
    const itineraries = await this.itineraries.findCompletedBetween(
      period.range.start,
      period.range.end,
      request.branchId,
    );

    return ResourceUtilisationReport.compile({
      period,
      scopeLabel,
      vehicles,
      drivers,
      itineraries,
      generatedAt: now,
    });
  }

  /** Assignment 1 Task 10 subtask 3: cross-branch by default. */
  private async describeScope(branchId: string | undefined): Promise<string> {
    if (branchId === undefined) {
      return 'All branches';
    }
    const branch = await this.branches.findById(branchId);
    return branch?.label() ?? branchId;
  }
}
