# SmartFM — Smart Fleet Management System

**SWE30003 Software Architectures and Design — Assignment 3 (Design Implementation), Group 1**
Client: ABC-Trans (via Swinsoft Consulting)

SmartFM replaces ABC-Trans's manual, branch-specific processes with one centralised system covering
customer ordering, fleet and driver management, dispatch, live tracking, billing and management
reporting.

> **The report is in [`docs/A3-REPORT.md`](docs/A3-REPORT.md).** It contains the detailed design, the
> justification of every change and non-change to the Assignment 2 design, the reflection, the
> architecture discussion, and the mapping to the marking sheet.
> The demonstration walkthrough is in [`docs/SCENARIOS.md`](docs/SCENARIOS.md).

---

## 1. Development and test platform

| Item | Value |
| --- | --- |
| Operating system | Windows 11 Home 24H2 (also verified on Node under Linux/macOS — no OS-specific code) |
| Language | TypeScript 5.9 (object-oriented: classes, abstract classes, interfaces, inheritance, polymorphism) |
| Runtime | Node.js 24.11 LTS — executes TypeScript natively, so the server needs no build step |
| Browser client | React 19 + Vite 8 |
| Editor / IDE | Visual Studio Code 1.9x with the built-in TypeScript language service |
| Persistence | JSON files under `data/` (the specification permits files instead of a database) |
| Server dependencies | **None.** The application server uses only Node's built-in `node:http`. |
| Coding standard | [Google TypeScript Style Guide](https://google.github.io/styleguide/tsguide.html) — see §5 |

## 2. Getting started

```bash
npm install
```

### Run the whole system (simplest — one port)

```bash
npm run build && npm run server
```

Then open **<http://localhost:4000>**. The server serves both the REST API and the built browser
client.

### Run in development mode (two terminals, hot reload)

```bash
npm run server
```

```bash
npm run dev
```

Then open **<http://localhost:5173>**. Vite proxies `/api` to the application server on port 4000.

### Sign in

Every seeded account uses the password **`smartfm2026`**. The accounts are also listed on the sign-in
screen, so no external notes are needed during a demonstration.

| Role | Username | Use for |
| --- | --- | --- |
| Customer | `hoa.nguyen@hoaphat.example` | Placing, tracking and paying for shipments |
| Customer | `khanh.do@klp.example` | Second customer — capacity race, ownership checks |
| Branch staff | `staff.hcm@abctrans.example` | Ho Chi Minh queue, fleet, drivers, reports |
| Branch staff | `staff.han@abctrans.example` | Ha Noi branch console — queue isolation between branches |
| Branch staff | `staff.dad@abctrans.example` | Da Nang hub console — the trunk-route branch |
| Driver | `hung.tran@abctrans.example` | Class FC driver, Ho Chi Minh City |
| Driver | `mai.le@abctrans.example` | Class C driver, Ho Chi Minh City |
| Driver | `tuan.dang@abctrans.example` | Class D driver, Da Nang — a driver sees only their own jobs |

All three branches have a staff account (`staff.<code>@abctrans.example`, where the code is `hcm`,
`han` or `dad`), and all six seeded drivers can sign in with their own email address.

## 3. Every command

| Command | What it does |
| --- | --- |
| `npm run compile` | Type-checks the server and the client. **This is the evidence of compilation.** |
| `npm test` | Runs the 118-case self-test suite and exits non-zero on failure |
| `npm run verify` | `compile` followed by `test` — the single command a marker can run |
| `npm run server` | Starts the application server on port 4000 |
| `npm run dev` | Starts the Vite development server on port 5173 |
| `npm run build` | Compiles both tiers and produces the production bundle in `dist/` |
| `npm run seed:reset` | Rebuilds the demonstration data set from scratch |

## 4. Project structure

```
smartfm/
├── server/
│   ├── domain/            Pure object-oriented domain model — no I/O, no framework
│   │   ├── shared/        Entity, Money, Address, ContactInfo, DateRange, Guard, DomainError
│   │   ├── people/        Person (abstract), Customer, Driver, UserAccount
│   │   ├── fleet/         Branch, Vehicle, MaintenanceRecord
│   │   ├── ordering/      ShipmentOrder, CargoDetails, DeliveryDetails, OrderLifecycle,
│   │   │                  OrderChangeRecord, CapacityHold, OrderObserver
│   │   ├── dispatch/      Route, RouteLeg, Waypoint, Itinerary
│   │   ├── tracking/      TrackingUpdate
│   │   ├── billing/       Invoice, InvoiceLine, Payment, PaymentMethod (abstract),
│   │   │                  CashPayment, CardPayment, PaymentResult, Receipt
│   │   └── reporting/     ReportPeriod, ShipmentStatisticsReport, ResourceUtilisationReport
│   ├── application/       One service per business area + Pricing, RoutePlanner, Notification, Auth
│   ├── infrastructure/    Repositories over a JSON file store, Clock, IdGenerator,
│   │                      ApplicationContext (the bootstrap), SeedData
│   ├── api/               HttpServer, Router, Presenter, HttpError, 8 controllers
│   ├── test/              Zero-dependency test runner, 118 cases
│   └── main.ts            Program entry point
├── web/                   React presentation tier (views, components, ApiClient)
├── docs/                  A3-REPORT.md and SCENARIOS.md
└── data/                  JSON data files, created on first run
```

Roughly **17,500 lines** across 95 source files: 3,900 lines of domain model, 2,500 of application
services, 2,000 of infrastructure, 1,450 of API, 2,200 of tests and 5,400 of user interface.

## 5. Coding standard

The implementation follows the **[Google TypeScript Style Guide](https://google.github.io/styleguide/tsguide.html)**.
The rules that shaped the code most are:

| Rule | How it is applied |
| --- | --- |
| §Naming | `UpperCamelCase` for classes and types, `lowerCamelCase` for members, `CONSTANT_CASE` for module-level constants. No Hungarian notation, no `I` prefix on interfaces. |
| §Comments | JSDoc (`/** … */`) on every exported class explaining *why* it exists; line comments only where the reason is not obvious from the code. |
| §Visibility | Fields are `private` and exposed through accessors, so no caller can put a domain object into an invalid state. |
| §Immutability | `readonly` on every field that must not change after construction; `Object.freeze` on `TrackingUpdate`, `Receipt` and the report classes. |
| §Type system | No `any`. `unknown` at every trust boundary, narrowed by `Guard` before use. |
| §Equality | `===` throughout; explicit `undefined` checks rather than truthiness. |
| §Control flow | No `switch` fall-through (enforced by `noFallthroughCasesInSwitch`). |

Two project-specific rules go beyond the guide:

1. **The domain layer imports nothing outside itself.** No `node:fs`, no HTTP, no React. This is what
   makes the layering in the architecture discussion verifiable rather than aspirational.
2. **One class per file in `server/domain`,** named after the class, so the class diagram and the
   source tree map onto each other one-to-one.

Compliance is machine-checked. `tsconfig.json` enables `strict`, `noUncheckedIndexedAccess`,
`noImplicitOverride`, `noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax` and
`erasableSyntaxOnly`; `npm run compile` fails on any violation.

## 6. Business areas implemented

The specification requires **at least four** areas of business operation, fully functional including
their dependencies. SmartFM implements **all seven**:

| # | Business area | Assignment 1 tasks | Where |
| --- | --- | --- | --- |
| 1 | Customer account management | Task 3 | `AccountService`, `AuthService` |
| 2 | Fleet and driver resource management | Tasks 1, 2 | `FleetService` |
| 3 | Order placement, amendment and cancellation | Tasks 4, 5, 6 | `OrderService` |
| 4 | Order processing and dispatch | Task 7 | `DispatchService` |
| 5 | Billing and payment (simulated) | Task 9 | `BillingService` |
| 6 | Shipment tracking | Task 8 | `TrackingService` |
| 7 | Management reporting | Task 10 | `ReportingService` |

The areas are genuinely interdependent — an invoice cannot exist without a dispatch, a dispatch
cannot exist without an order, an order cannot exist without an account and an available vehicle —
and every dependency is satisfied by real behaviour, not stubs.

## 7. Simplifications

As permitted by the specification:

- **Payment is simulated.** No banking system is contacted and no funds move. Every payment message
  begins with `SIMULATED`. Only `PaymentMethod.confirm()` is stubbed; the object design around it
  behaves exactly as it would against a real gateway. Only the last four digits of a card are ever
  collected — a full card number is never entered, transmitted or stored.
- **Persistence is JSON files**, not a database server, so the submission runs with nothing to install.
- **Notification delivery** (email/SMS) is outside the boundary. Messages are raised and shown in the
  customer's notification panel, which is enough to demonstrate the Observer pattern is firing.
- **Contact verification** at registration completes immediately rather than by email link.

## 8. Deployment

The two tiers are separately deployable:

- **Application server** — any host with Node.js ≥ 22.6. Copy `server/`, `package.json` and `data/`,
  set `PORT` and `SMARTFM_DATA` if the defaults do not suit, and run `node server/main.ts`.
- **Browser client** — `npm run build` produces static files in `dist/` that can be served by any web
  server or CDN. For the demonstration the application server serves them itself.

Data is written atomically (temp file + rename), so an interrupted write can never corrupt a
collection. Stopping the server with `Ctrl+C` loses nothing.
