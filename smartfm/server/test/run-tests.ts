import { TestRunner } from './TestRunner.ts';
import { registerDomainTests } from './domain.test.ts';
import { registerScenarioTests } from './scenarios.test.ts';

/**
 * Entry point for `npm test`.
 *
 * Prints a full transcript and exits non-zero on any failure, so the console
 * output is usable directly as the "exit and test screens" evidence the
 * Assignment 3 mark sheet asks for.
 */
async function main(): Promise<void> {
  const runner = new TestRunner();
  registerDomainTests(runner);
  registerScenarioTests(runner);

  const failures = await runner.run('SmartFM — self-test suite (SWE30003 Assignment 3, Group 1)');
  if (failures > 0) {
    console.log('RESULT: FAILED\n');
    process.exit(1);
  }
  console.log('RESULT: ALL TESTS PASSED\n');
  process.exit(0);
}

main().catch((error: unknown) => {
  console.error('[SmartFM] The test suite could not run:', error);
  process.exit(1);
});
