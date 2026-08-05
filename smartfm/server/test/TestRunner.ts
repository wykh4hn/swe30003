/**
 * A dependency-free test runner.
 *
 * Assignment 3 asks for evidence that the implementation compiles and behaves
 * correctly, and the mark sheet allocates points to "exit and test screens".
 * Rather than add a test framework, SmartFM ships a small runner of its own: the
 * submission stays at zero runtime dependencies, and a marker can read the whole
 * harness in one sitting.
 *
 * The runner prints a readable transcript and exits non-zero on failure, so the
 * console output can be pasted straight into the report as evidence.
 */

export type TestBody = () => void | Promise<void>;

interface TestCase {
  readonly suite: string;
  readonly name: string;
  readonly body: TestBody;
}

interface Failure {
  readonly suite: string;
  readonly name: string;
  readonly error: unknown;
}

export class TestRunner {
  private readonly cases: TestCase[] = [];
  private currentSuite = 'General';

  suite(name: string, register: () => void): void {
    const previous = this.currentSuite;
    this.currentSuite = name;
    register();
    this.currentSuite = previous;
  }

  test(name: string, body: TestBody): void {
    this.cases.push({ suite: this.currentSuite, name, body });
  }

  /** Runs every registered case and returns the number of failures. */
  async run(title: string): Promise<number> {
    const started = Date.now();
    const failures: Failure[] = [];
    let passed = 0;
    let lastSuite = '';

    console.log(`\n${title}`);
    console.log('='.repeat(title.length));

    for (const testCase of this.cases) {
      if (testCase.suite !== lastSuite) {
        console.log(`\n  ${testCase.suite}`);
        lastSuite = testCase.suite;
      }
      try {
        await testCase.body();
        passed += 1;
        console.log(`    PASS  ${testCase.name}`);
      } catch (error) {
        failures.push({ suite: testCase.suite, name: testCase.name, error });
        console.log(`    FAIL  ${testCase.name}`);
      }
    }

    const elapsed = ((Date.now() - started) / 1000).toFixed(2);
    console.log(`\n${'-'.repeat(60)}`);
    console.log(`  ${passed} passed, ${failures.length} failed, ${this.cases.length} total  (${elapsed}s)`);

    if (failures.length > 0) {
      console.log('\n  Failure detail');
      for (const failure of failures) {
        const message = failure.error instanceof Error ? failure.error.message : String(failure.error);
        console.log(`\n    ${failure.suite} > ${failure.name}`);
        console.log(`      ${message}`);
        if (failure.error instanceof Error && failure.error.stack !== undefined) {
          const line = failure.error.stack.split('\n')[1]?.trim();
          if (line !== undefined) {
            console.log(`      ${line}`);
          }
        }
      }
    }
    console.log(`${'-'.repeat(60)}\n`);
    return failures.length;
  }
}

/** Assertions used by the suites. Small and explicit, so failures read clearly. */
export class Expect {
  private constructor() {
    // Static assertions; never instantiated.
  }

  static isTrue(condition: boolean, message: string): void {
    if (!condition) {
      throw new Error(`Expected true: ${message}`);
    }
  }

  static isFalse(condition: boolean, message: string): void {
    if (condition) {
      throw new Error(`Expected false: ${message}`);
    }
  }

  static equals<T>(actual: T, expected: T, message: string): void {
    if (actual !== expected) {
      throw new Error(`${message}\n        expected: ${String(expected)}\n        actual:   ${String(actual)}`);
    }
  }

  static defined<T>(value: T | undefined | null, message: string): T {
    if (value === undefined || value === null) {
      throw new Error(`Expected a value: ${message}`);
    }
    return value;
  }

  /** Asserts that `body` throws, and that the message mentions `expectedFragment`. */
  static async throws(body: () => unknown | Promise<unknown>, expectedFragment: string, message: string): Promise<void> {
    try {
      await body();
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      if (!text.toLowerCase().includes(expectedFragment.toLowerCase())) {
        throw new Error(
          `${message}\n        threw, but the message did not mention "${expectedFragment}"\n        actual: ${text}`,
        );
      }
      return;
    }
    throw new Error(`${message}\n        expected a rejection mentioning "${expectedFragment}", but none was thrown`);
  }
}
