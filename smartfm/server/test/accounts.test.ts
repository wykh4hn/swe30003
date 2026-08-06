import { Expect } from './TestRunner.ts';
import type { TestRunner } from './TestRunner.ts';
import * as D from './DomainTestFixtures.ts';
import * as S from './ScenarioTestFixtures.ts';

/** Executable tests grouped by SmartFM business area. */
export function registerCustomerDomainTests(runner: TestRunner): void {
  runner.suite('Customer — account lifecycle (A1 Task 3)', () => {
    const makeCustomer = (): D.Customer =>
      new D.Customer({
        id: 'cus_test',
        fullName: 'Nguyen Thi Hoa',
        contact: D.ContactInfo.create({ email: 'hoa@example.com', phone: '0987111222' }),
        billingAddress: D.hcmAddress(),
        accountStatus: 'ACTIVE',
        registeredAt: D.NOW,
      });

    runner.test('an unverified account cannot transact', async () => {
      const customer = new D.Customer({
        id: 'cus_test',
        fullName: 'Nguyen Thi Hoa',
        contact: D.ContactInfo.create({ email: 'hoa@example.com', phone: '0987111222' }),
        billingAddress: D.hcmAddress(),
        registeredAt: D.NOW,
      });
      await Expect.throws(() => customer.assertUsable(), 'awaiting verification', 'pending account blocked');
      customer.verifyContactDetails();
      customer.assertUsable();
    });

    runner.test('closure is refused while orders are open (variant 5a)', async () => {
      await Expect.throws(() => makeCustomer().requestClosure(2, 0), 'still active', 'open orders block closure');
    });

    runner.test('closure is refused while invoices are unpaid', async () => {
      await Expect.throws(() => makeCustomer().requestClosure(0, 1), 'remain unpaid', 'unpaid invoices block closure');
    });

    runner.test('a clean account closes and is deactivated, not deleted', () => {
      const customer = makeCustomer();
      customer.requestClosure(0, 0);
      Expect.equals(customer.accountStatus, 'CLOSED', 'status recorded');
      Expect.isFalse(customer.isActive, 'deactivated');
      Expect.equals(customer.fullName, 'Nguyen Thi Hoa', 'history preserved');
    });
  });

}

export function registerAccountScenarioTests(runner: TestRunner): void {
  runner.suite('Scenario 8 — Customer account management (A1 Task 3)', () => {
    runner.test('a new customer registers and can immediately sign in', async () => {
      const { app, dispose } = await S.freshApplication();
      try {
        const customer = await app.services.accounts.register({
          fullName: 'Pham Thi Ngoc',
          companyName: 'Ngoc Trading Co',
          email: 'ngoc.pham@ngoctrading.example',
          phone: '0977888999',
          password: 'ngoc-password-2026',
          billingAddress: { street: '12 Hai Ba Trung', district: 'District 1', city: 'Ho Chi Minh City' },
        });
        Expect.equals(customer.accountStatus, 'ACTIVE', 'verified and active');

        const session = await app.services.auth.signIn('ngoc.pham@ngoctrading.example', 'ngoc-password-2026');
        Expect.equals(session.role, 'CUSTOMER', 'signed in as a customer');
      } finally {
        await dispose();
      }
    });

    runner.test('registering twice with the same email is refused (variant 1a)', async () => {
      const { app, dispose } = await S.freshApplication();
      try {
        await Expect.throws(
          () =>
            app.services.accounts.register({
              fullName: 'Someone Else',
              email: 'hoa.nguyen@hoaphat.example',
              phone: '0977000111',
              password: 'another-password',
              billingAddress: { street: '1 Some Street', district: 'District 1', city: 'Ho Chi Minh City' },
            }),
          'already exists',
          'duplicate registration redirected to sign-in',
        );
      } finally {
        await dispose();
      }
    });

    runner.test('a wrong password is refused without revealing whether the user exists', async () => {
      const { app, dispose } = await S.freshApplication();
      try {
        await Expect.throws(
          () => app.services.auth.signIn('hoa.nguyen@hoaphat.example', 'wrong-password'),
          'email address or password is incorrect',
          'no user enumeration',
        );
        await Expect.throws(
          () => app.services.auth.signIn('nobody@nowhere.example', 'wrong-password'),
          'email address or password is incorrect',
          'identical message for an unknown user',
        );
      } finally {
        await dispose();
      }
    });

    runner.test('an account cannot be closed while an order is open (variant 5a)', async () => {
      const { app, clock, dispose } = await S.freshApplication();
      try {
        await S.placeOrder(app, clock);
        await Expect.throws(
          () => app.services.accounts.closeAccount(S.CUSTOMER_ONE),
          'still active',
          'closure blocked while work is outstanding',
        );
      } finally {
        await dispose();
      }
    });

    runner.test('a clean account closes and its history is preserved', async () => {
      const { app, dispose } = await S.freshApplication();
      try {
        const customer = await app.services.accounts.closeAccount(S.CUSTOMER_TWO);
        Expect.equals(customer.accountStatus, 'CLOSED', 'closed');
        Expect.defined(await app.repositories.customers.findById(S.CUSTOMER_TWO), 'the record still exists');
      } finally {
        await dispose();
      }
    });
  });
}
