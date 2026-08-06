import type { TestRunner } from './TestRunner.ts';
import { registerBootstrapTests, registerPersistenceTests } from './persistence.test.ts';
import { registerOrderPlacementScenarioTests, registerOrderChangeScenarioTests } from './orders.test.ts';
import { registerDispatchScenarioTests } from './dispatch.test.ts';
import { registerTrackingScenarioTests } from './tracking.test.ts';
import { registerBillingScenarioTests } from './billing.test.ts';
import { registerFleetScenarioTests } from './fleet.test.ts';
import { registerReportingScenarioTests } from './reporting.test.ts';
import { registerAccountScenarioTests } from './accounts.test.ts';

/** Registers the end-to-end suites in their original scenario order. */
export function registerScenarioTests(runner: TestRunner): void {
  registerBootstrapTests(runner);
  registerOrderPlacementScenarioTests(runner);
  registerDispatchScenarioTests(runner);
  registerTrackingScenarioTests(runner);
  registerBillingScenarioTests(runner);
  registerFleetScenarioTests(runner);
  registerOrderChangeScenarioTests(runner);
  registerReportingScenarioTests(runner);
  registerAccountScenarioTests(runner);
  registerPersistenceTests(runner);
}
