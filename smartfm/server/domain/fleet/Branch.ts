import { Entity } from '../shared/Entity.ts';
import { Address } from '../shared/Address.ts';
import { ContactInfo } from '../shared/ContactInfo.ts';
import { Guard } from '../shared/Guard.ts';
import { RuleViolationError } from '../shared/DomainError.ts';

/**
 * Operational hub that manages local resources and processes shipment orders.
 *
 * Assignment 3 change C3 — the largest structural correction in this design.
 * Assignment 2 drew `Branch` as *composing* its vehicles and drivers, which the
 * marker rejected. Two facts make composition wrong:
 *
 *   1. `Vehicle.transferTo()` and `Driver.transferTo()` move a resource between
 *      branches, so a resource's lifetime is not bounded by any one branch.
 *   2. Closing a branch must preserve the resources (and their history) for
 *      redeployment, not destroy them.
 *
 * The relationship is therefore an aggregation, realised in code by resources
 * holding a `branchId` and the repositories answering `findByBranch()`. `Branch`
 * no longer holds collections at all.
 *
 * Assignment 3 change C1 is also visible here. Assignment 2 gave `Branch` five
 * coarse responsibilities including cross-branch resource search and route
 * planning. Searching every branch's fleet is not something one branch can know;
 * that coordination moved to `FleetService` and `DispatchService`. What stays on
 * `Branch` is what a branch genuinely owns: its own identity, contactability,
 * operating state, and the rule about which orders it may process.
 */
export class Branch extends Entity {
  private branchName: string;
  private branchCode: string;
  private branchAddress: Address;
  private branchContact: ContactInfo;
  private branchActive: boolean;

  constructor(params: {
    id: string;
    name: string;
    code: string;
    address: Address;
    contact: ContactInfo;
    active?: boolean;
  }) {
    super(params.id);
    this.branchName = Guard.text('name', params.name, 3, 100);
    this.branchCode = Guard.text('code', params.code, 2, 10).toUpperCase();
    this.branchAddress = params.address;
    this.branchContact = params.contact;
    this.branchActive = params.active ?? true;
  }

  get name(): string {
    return this.branchName;
  }

  get code(): string {
    return this.branchCode;
  }

  get address(): Address {
    return this.branchAddress;
  }

  get contact(): ContactInfo {
    return this.branchContact;
  }

  get isActive(): boolean {
    return this.branchActive;
  }

  isOperational(): boolean {
    return this.branchActive;
  }

  updateDetails(changes: { name?: string; address?: Address; contact?: ContactInfo }): void {
    if (changes.name !== undefined) {
      this.branchName = Guard.text('name', changes.name, 3, 100);
    }
    if (changes.address !== undefined) {
      this.branchAddress = changes.address;
    }
    if (changes.contact !== undefined) {
      this.branchContact = changes.contact;
    }
  }

  /**
   * Assignment 1 Task 7 precondition: a branch only processes its own queue.
   * The rule lives on `Branch` because "which orders are mine" is a branch fact.
   */
  mayProcess(order: { branchId: string }): boolean {
    return this.branchActive && order.branchId === this.id;
  }

  assertMayProcess(order: { branchId: string; reference: string }): void {
    if (!this.branchActive) {
      throw new RuleViolationError(`Branch ${this.branchName} is closed and cannot process orders.`);
    }
    if (order.branchId !== this.id) {
      throw new RuleViolationError(
        `Order ${order.reference} belongs to another branch and cannot be processed here.`,
        { orderReference: order.reference },
      );
    }
  }

  /**
   * A branch is closed only after its resources have been moved elsewhere; the
   * caller supplies the counts because the repositories, not the branch, hold
   * the resource collections (see change C3).
   */
  close(assignedVehicleCount: number, assignedDriverCount: number, openOrderCount: number): void {
    if (openOrderCount > 0) {
      throw new RuleViolationError(
        `Branch ${this.branchName} still has ${openOrderCount} open order(s) and cannot be closed.`,
      );
    }
    if (assignedVehicleCount > 0 || assignedDriverCount > 0) {
      throw new RuleViolationError(
        `Transfer ${assignedVehicleCount} vehicle(s) and ${assignedDriverCount} driver(s) to another branch before closing ${this.branchName}.`,
      );
    }
    this.branchActive = false;
  }

  reopen(): void {
    this.branchActive = true;
  }

  label(): string {
    return `${this.branchName} (${this.branchCode})`;
  }
}
