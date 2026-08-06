import type { TestRunner } from './TestRunner.ts';
import { registerSharedDomainTests } from './shared.test.ts';
import { registerVehicleDomainTests, registerDriverDomainTests, registerBranchDomainTests } from './fleet.test.ts';
import { registerOrderDomainTests, registerCapacityHoldDomainTests } from './orders.test.ts';
import { registerTrackingDomainTests } from './tracking.test.ts';
import { registerBillingDomainTests } from './billing.test.ts';
import { registerDispatchDomainTests } from './dispatch.test.ts';
import { registerCustomerDomainTests } from './accounts.test.ts';
import { registerReportingDomainTests } from './reporting.test.ts';

/** Registers the pure domain suites in their original transcript order. */
export function registerDomainTests(runner: TestRunner): void {
  registerSharedDomainTests(runner);
  registerVehicleDomainTests(runner);
  registerDriverDomainTests(runner);
  registerOrderDomainTests(runner);
  registerTrackingDomainTests(runner);
  registerBillingDomainTests(runner);
  registerDispatchDomainTests(runner);
  registerCapacityHoldDomainTests(runner);
  registerCustomerDomainTests(runner);
  registerBranchDomainTests(runner);
  registerReportingDomainTests(runner);
}
