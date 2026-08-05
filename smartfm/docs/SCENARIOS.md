# SmartFM — Execution and Operation Walkthrough

**SWE30003 Assignment 3, Group 1 — evidence of correct execution**

Eight scenarios covering all seven implemented business areas. Every step says what to type, what to
click, and what you should see — so each screenshot the marking sheet asks for has a numbered step
that produces it.

## Before you start

```bash
npm install
npm run seed:reset      # known starting state
npm run build
npm run server
```

Open **<http://localhost:4000>**. Every account's password is **`smartfm2026`**.

> **Screenshot checklist.** Steps marked 📷 produce a screenshot the mark sheet explicitly asks for:
> 📷**H** home screen · 📷**E** empty UI · 📷**I** correct input · 📷**V** validation of incorrect
> input · 📷**C** change of mind · 📷**O** sample output · 📷**X** exit/test screens.

---

## Scenario 0 — Home screen

*Business area: none (entry point). Assignment 1: all actors.*

| # | Do this | Expect |
| --- | --- | --- |
| 1 | Open <http://localhost:4000>. | 📷**H** 📷**E** The sign-in screen. The left panel states what SmartFM is and lists all six demonstration accounts; the right panel shows an **empty** sign-in form. |
| 2 | Click **Sign in** without typing anything. | 📷**V** Two inline errors: *"Enter the email address for your account."* and *"Enter your password."* |
| 3 | Type `not-an-email` in the email field and click **Sign in**. | 📷**V** *"That does not look like an email address."* |
| 4 | Type `hoa.nguyen@hoaphat.example` with the password `wrong-password`, click **Sign in**. | 📷**V** A red banner: *"The email address or password is incorrect."* — the same message an unknown user gets, so the screen never reveals which accounts exist. |

---

## Scenario 1 — Register a new customer account

*Business area 1 — Customer account management. Assignment 1 Task 3, subtasks 1–3 and variant 1a.*

| # | Do this | Expect |
| --- | --- | --- |
| 1 | On the sign-in screen click **Create a customer account**. | 📷**E** An empty registration form. |
| 2 | Click **Create account** immediately. | 📷**V** Eight inline errors at once — name, email, phone, password, confirmation, street, district, city — each beneath its own field. |
| 3 | Fill in: name `Pham Thi Ngoc`, company `Ngoc Trading Co`, email `ngoc.pham@ngoctrading.example`, phone `12`, password `short`, confirm `different`. | |
| 4 | Click **Create account**. | 📷**V** *"Enter 8-15 digits, optionally starting with +."*, *"Choose a password of at least 8 characters."*, *"The two passwords do not match."* |
| 5 | Correct to phone `0977888999`, password `ngoc-password-2026` in both boxes; street `12 Hai Ba Trung`, district `District 1`, city `Ho Chi Minh City`. | 📷**I** A fully valid form with no error messages. |
| 6 | Click **Create account**. | 📷**O** Back at sign-in with a green banner: *"Your account is ready. Sign in with the password you chose."* |
| 7 | **Variant 1a — duplicate registration.** Click **Create a customer account** again and register with the *same* email. | 📷**V** *"An account already exists for this email address. Please sign in or recover your password instead."* Only the server can detect this, so it proves server-side validation is active. |
| 8 | Sign in as `ngoc.pham@ngoctrading.example`. | The customer portal opens with four tabs. |
| 9 | Sign out and sign back in as `hoa.nguyen@hoaphat.example` for the remaining scenarios. | |

---

## Scenario 2 — Check availability and place an order

*Business area 3 — Order placement. Assignment 1 Tasks 4 and 5, including Task 4 variant 5a and Task 5 variant 5a.*

Signed in as **`hoa.nguyen@hoaphat.example`**.

| # | Do this | Expect |
| --- | --- | --- |
| 1 | The **Place an order** tab is open by default. | 📷**H** 📷**E** A four-step progress bar with step 1 active, and two empty cards: *What are you shipping?* and *Where and when?* |
| 2 | Click **Check availability** with the form untouched. | 📷**V** Nine inline errors at once — description, both streets, both districts, both cities, recipient name and phone. |
| 3 | **Same-city rejection.** Set both cities to `Ho Chi Minh City` and click **Check availability**. | 📷**V** *"SmartFM handles inter-city freight. Choose a different delivery city."* |
| 4 | Fill in the shipment: description `Packaged retail goods for Da Nang stores`, 10 items, 200 kg each, 12 m³, handling `Standard`. | The live total under the volume field reads **2,000 kg**. |
| 5 | Pickup `210 Le Van Sy`, `Phu Nhuan`, `Ho Chi Minh City`. Delivery `15 Ngo Quyen`, `Son Tra`, `Da Nang`. Recipient `Tran Thi Bich`, `0909123456`. Leave the dates as offered. | 📷**I** A complete, valid form. |
| 6 | **Impossible deadline.** Set *Required delivery by* to two hours after the pickup time, then click **Check availability**. | 📷**V** *"The Ho Chi Minh City → Da Nang (960 km, ~18.2 h) run needs about 18.2 hours, but your delivery window is only 2 hours. Choose a later delivery deadline."* The route is planned *before* any order exists. |
| 7 | Restore the deadline to three days after pickup and click **Check availability**. | 📷**O** Step 2. Banner *"3 option(s) available."* and three branch cards, each showing the vehicle, its capacity, the load percentage, the route (`960 km, ~18.2 h`) and the price **12,610,000 VND**. |
| 8 | On the **ABC-Trans Ho Chi Minh Central (HCM)** card, click **Choose and hold**. | 📷**O** Step 3, with a blue banner *"Held for you until …"* stating that 1 vehicle is reserved and no other customer can take it. |
| 9 | **Change of mind.** Click **I have changed my mind — release the hold**. | 📷**C** Back to step 2. The capacity is released immediately rather than waiting fifteen minutes for expiry. |
| 10 | **Concurrent booking (Task 4 variant 5a).** In a second browser (or a private window) sign in as `khanh.do@klp.example`, run the same search, and choose the *same* vehicle. Then, as Hoa, try to choose it too. | 📷**V** *"51C-123.45 (TRUCK 10T) was just reserved by another customer. Please choose an alternative option."* |
| 11 | Choose the HCM option again and review the summary. | 📷**I** Goods, both addresses, both dates, recipient and the reserved vehicle with minutes remaining. |
| 12 | Click **Confirm and place the order**. | 📷**O** Step 4: *"Reference SFM-2026-000001"*, status **Awaiting branch review**, quoted price, delivery deadline. |
| 13 | Open **My orders & tracking**. | 📷**O** The order in the table with its status badge. Selecting it shows the audit trail: *"Order SFM-2026-000001 received…"* |

> **Task 5 variant 5b — split shipment.** Repeat step 4 with **10 items of 1,200 kg** (12 tonnes) and
> 30 m³. The HCM option now shows *two* vehicles and an amber banner: *"This load is too large for one
> vehicle, so it will be split across 2 vehicles under a single order."* 📷**O**

---

## Scenario 3 — Process and dispatch the order

*Business area 4 — Order processing and dispatch. Assignment 1 Task 7, subtasks 1–5 and variants 3b, 3c.*

Sign out and sign in as **`staff.hcm@abctrans.example`**.

| # | Do this | Expect |
| --- | --- | --- |
| 1 | The **Order queue** tab opens. | 📷**H** *Pending review (1)* with `SFM-2026-000001`, plus a second table of all branch orders. |
| 2 | Click **Review**. | 📷**O** The verification report: customer, cargo, both addresses, the planned route (`960 km, ~18.2 h`), the quote, and a green banner *"All checks passed. This order can be accepted."* |
| 3 | **Wrong branch (queue isolation).** Sign in as `staff.han@abctrans.example` (or `staff.dad@abctrans.example`) in another window and try to open the same order. | 📷**V** *"Order SFM-2026-000001 belongs to another branch and cannot be processed here."* Their **Fleet** and **Drivers** tabs also show only their own resources — Da Nang sees `43C-119.87` and `43D-402.31` and one driver, never Ho Chi Minh's. |
| 4 | Back as HCM staff, click **Accept order**. | 📷**O** Green banner *"Order SFM-2026-000001 accepted. Assign a vehicle and driver below."* The assignment table appears. |
| 5 | Inspect the assignment table. | 📷**O** Only *legal* pairings: the driver's licence covers the vehicle and neither is committed during the window. `51C-123.45` (class C) is offered with a class C or FC driver; `29LD-990.22` (class FC) never appears with a class C driver. |
| 6 | Tick one pairing. | The line beneath reads *"Selected capacity: 10,000 kg of 2,000 kg required."* |
| 7 | Click **Assign 1 vehicle(s)**. | 📷**O** *"1 itinerary/itineraries created. The order is ready to dispatch."* |
| 8 | Click **Dispatch and issue the invoice**. | 📷**O** *"Order SFM-2026-000001 dispatched and invoiced."* and the rendered invoice: base handling fee, line haul 960 × 11,000, weight handling 2,000 × 900, **TOTAL 12,610,000 VND** — identical to the quote the customer agreed. |
| 9 | Read the audit trail at the bottom. | 📷**O** Every step with its timestamp and the staff member who performed it. |

> **Variant 3b — duplicate detection.** Before accepting, have the customer place a second identical
> order. The review then shows an amber warning: *"Possible duplicate of order SFM-2026-000001, placed
> by the same customer for the same lane within an hour. Re-check before accepting."* — a warning, not
> a block. 📷**V**
>
> **Rejection with a reason.** On a pending order click **Reject order**, leave the reason blank and
> submit: *"Give a reason of at least 5 characters — it is sent to the customer and kept on the
> record."* 📷**V** Supply a reason and confirm; the customer sees it on their order. 📷**O**

---

## Scenario 4 — Amend and cancel an order

*Business area 3. Assignment 1 Task 6, subtasks 1–6 and variant 5a.*

Sign in as **`hoa.nguyen@hoaphat.example`**. Place a *second* order first (Scenario 2, steps 4–12) so
there is a pending order to work with.

| # | Do this | Expect |
| --- | --- | --- |
| 1 | Open **My orders & tracking** and select the new pending order. | 📷**O** Two buttons: **Change delivery details** and **Cancel this order**. |
| 2 | Select the *dispatched* order (`SFM-2026-000001`) instead. | 📷**O** No action buttons. Instead: *"This order is picked up and can no longer be changed or cancelled online. Contact your branch if you need help."* — the interface offers only what the lifecycle table permits. |
| 3 | Back on the pending order, click **Change delivery details**. | 📷**E** A form pre-filled with the current values. |
| 4 | Clear the recipient phone and enter `12`, then **Save changes**. | 📷**V** *"Enter a valid phone number (8-15 digits)."* |
| 5 | Restore the phone, change the city to `Nha Trang`, click **Save changes**. | 📷**O** *"Your delivery details were updated and the order was re-priced where the route changed."* The quoted price changes, because the lane is shorter. |
| 6 | Click **Change delivery details** again, edit a field, then click **Discard changes**. | 📷**C** The form closes with nothing saved. |
| 7 | Click **Cancel this order**, leave the reason blank, submit. | 📷**V** *"Tell us briefly why you are cancelling (at least 3 characters)."* |
| 8 | Enter `Customer no longer needs the shipment` and confirm. | 📷**O** Status becomes **Cancelled**; the reserved vehicle returns to the pool immediately. |
| 9 | **Variant 5a.** Try to cancel the dispatched order. | 📷**V** *"Order SFM-2026-000001 is already picked up and can no longer be cancelled online. Please contact your branch."* |

---

## Scenario 5 — Fleet and driver management

*Business area 2. Assignment 1 Tasks 1 and 2, including Task 1 variants 2a, 5a and Task 2 variants 1a, 3a.*

Sign in as **`staff.hcm@abctrans.example`**.

| # | Do this | Expect |
| --- | --- | --- |
| 1 | Open the **Fleet** tab. | 📷**H** 📷**O** Four Ho Chi Minh vehicles with type, capacity, required licence, status, odometer. The vehicle on the dispatched itinerary shows **ASSIGNED**. |
| 2 | Type `51C` into the search box, then select status `AVAILABLE`. | 📷**O** The list filters live (Task 1 subtask 4). |
| 3 | Click **Add a vehicle**, then **Add vehicle** with the form empty. | 📷**V** *"Use a Vietnamese plate format, for example 51C-123.45."* and *"Choose the vehicle type."* |
| 4 | **Duplicate plate.** Enter `51C-123.45` (already on file), type `TRUCK_5T`, and submit. | 📷**V** *"A vehicle with registration 51C-123.45 is already on file."* |
| 5 | Enter `51C-999.11`, type `TRUCK_5T`, odometer `1000`, and submit. | 📷**I** 📷**O** *"Vehicle 51C-999.11 was added to the fleet."* |
| 6 | **Variant 5a — retire while assigned.** Click **Retire** on the **ASSIGNED** vehicle. | 📷**V** *"Vehicle 51C-123.45 is on an active itinerary and cannot be retired. Complete the delivery first."* |
| 7 | Click **Add a vehicle**, type something, then click **Discard**. | 📷**C** The form clears and closes. |
| 8 | **Variant 2a — maintenance.** Click **Maintenance** on an available vehicle, enter `Scheduled brake service` and an expected return date. | 📷**O** Status becomes **IN MAINTENANCE** with the return date shown. As a customer, re-run the availability search — that vehicle is no longer offered. |
| 9 | Click **Return to service**. | 📷**O** Back to **AVAILABLE**; the maintenance record is closed, not deleted. |
| 10 | Click **Retire** on an available vehicle. | 📷**O** Status **RETIRED** — a soft delete. The record and its history remain. |
| 11 | Open the **Drivers** tab. | 📷**O** Three Ho Chi Minh drivers with licence class and availability. The assigned driver shows **ASSIGNED**. |
| 12 | Click **Add a driver** and submit empty. | 📷**V** Five inline errors. |
| 13 | Add `Nguyen Van Sang`, `sang.nguyen@abctrans.example`, `0903999888`, licence `B0799999`, class `C`. | 📷**I** 📷**O** *"Nguyen Van Sang was added and can sign in as sang.nguyen@abctrans.example …"* — the account is created too, so the new driver can use the driver view immediately. |
| 14 | **Variant 3a.** Click **Deactivate** on the **ASSIGNED** driver. | 📷**V** *"Driver … still has an active itinerary (itn_000001). Complete or reassign it first."* |
| 15 | **Variant 1a — leave.** Click **Record leave** on an available driver, choose a range, submit. | 📷**O** Availability becomes **ON LEAVE**; they no longer appear in assignment suggestions. |
| 16 | Click **End leave**. | 📷**O** Back to **AVAILABLE**. |

---

## Scenario 6 — Pay an invoice and receive a receipt

*Business area 5. Assignment 1 Task 9, including variants 1a, 1b, 3a and the "simultaneous payment" critical case.*

Sign in as **`hoa.nguyen@hoaphat.example`**. Order `SFM-2026-000001` was invoiced in Scenario 3.

| # | Do this | Expect |
| --- | --- | --- |
| 1 | Open the **Billing** tab. | 📷**H** 📷**O** A blue banner stating that payment is simulated, then the invoice `INV-2026-000001` — issued, due, total `12,610,000 VND`, status **OUTSTANDING**, 0 attempts. |
| 2 | Click **Pay**. | 📷**E** The itemised breakdown on the left and an empty payment form on the right. |
| 3 | Choose **Card (online)** and click **Pay** with the form empty. | 📷**V** *"Enter the name printed on the card."* and *"Enter exactly the last 4 digits of the card."* |
| 4 | **Variant 3a — decline.** Enter holder `NGUYEN THI HOA`, last four `0000`, expiry `12/2030`. Pay. | 📷**V** 📷**O** *"SIMULATED: the card issuer declined the transaction (insufficient funds). Try another card or pay cash at a branch."* plus *"You can try again below."* The invoice is still **OUTSTANDING** and the attempt count is now 1. |
| 5 | **Gateway timeout.** Change the last four to `9999` and pay. | 📷**V** *"SIMULATED: the payment gateway did not respond in time. The invoice is unchanged — please try again."* Attempts: 2. |
| 6 | **Expired card.** Change the expiry year to the current year and the month to `1`. Pay. | 📷**V** *"This card has expired. Use a different card."* — refused before any attempt is even recorded. |
| 7 | **Variant 1b — short cash.** Switch to **Cash at a branch counter**, choose the HCM branch, cashier `Le Van Minh`, amount tendered `1000`. Pay. | 📷**V** *"SIMULATED: cash tendered (1,000 VND) is less than the amount due (12,610,000 VND). Collect the balance and record the payment again."* |
| 8 | **Variant 1a — successful card payment.** Switch back to card, last four `4242`, expiry `12/2030`. Pay. | 📷**O** Green: *"SIMULATED: card ending 4242 authorised for 12,610,000 VND. No real funds were transferred."* |
| 9 | Read the receipt panel. | 📷**O** The rendered receipt: `RCP-2026-000001`, amount, method, invoice, gateway reference, and the note that this is a simulated settlement. |
| 10 | Look at the **Payment attempts** table. | 📷**O** All four attempts on record — DECLINED, GATEWAY TIMEOUT, INSUFFICIENT AMOUNT, CONFIRMED. Nothing is hidden. |
| 11 | **Critical case — pay twice.** Reload and try to pay the same invoice again. | 📷**V** The **Pay** button is gone and the panel reads *"This invoice has been settled in full. No further payment is required."* Forcing the request returns *"Invoice INV-2026-000001 has already been paid in full."* |
| 12 | Scroll to **Receipts**. | 📷**O** The receipt listed with its number, date, amount and method. |

---

## Scenario 7 — Track a shipment from the road

*Business area 6. Assignment 1 Task 8, subtasks 1–4 and variants 1a, 2a, 2b.*

Sign in as the driver assigned in Scenario 3 — normally **`hung.tran@abctrans.example`**.

| # | Do this | Expect |
| --- | --- | --- |
| 1 | The **My jobs** tab opens. | 📷**H** 📷**O** One job card: reference, vehicle, load, pickup, destination, due-by. |
| 2 | Sign in as `tuan.dang@abctrans.example` (a Da Nang driver) instead. | 📷**E** *"You have no jobs at the moment"* — a driver sees only their own work. |
| 3 | Back as the assigned driver, click **Report on this job**, then **Picked up** without entering a location. | 📷**V** *"Where are you? Enter a city or landmark."* |
| 4 | Enter `Ho Chi Minh City` and click **Picked up**. | 📷**I** 📷**O** *"Checkpoint recorded for SFM-2026-000001. The customer can see it now."* The order advances to **In transit**. |
| 5 | **Variant 2a — delay.** Enter location `Nha Trang`, choose event `Delayed`, leave the note blank, submit. | 📷**V** *"Explain briefly what happened — this is shown to the customer."* |
| 6 | Add the note `Highway closure on QL1A`, set a revised arrival time, submit. | 📷**O** The checkpoint is **appended** — the earlier one is untouched, because tracking history is immutable. |
| 7 | Sign in as `hoa.nguyen@hoaphat.example`, open **My orders & tracking**, select the order. | 📷**O** The timeline newest-first, an amber **Running late** badge, the revised ETA, and *"Your shipment is on the road."* |
| 8 | **Variant 1a.** Sign in as `khanh.do@klp.example` and try to open Hoa's order. | 📷**V** It is not in their list at all; requesting it directly returns *"No matching shipment was found for your account."* |
| 9 | Back as the driver, enter `Da Nang` and click **Confirm delivery**. | 📷**O** *"Delivery of SFM-2026-000001 confirmed. Your vehicle is back in the pool."* |
| 10 | As branch staff, open **Fleet** and **Drivers**. | 📷**O** The vehicle is **AVAILABLE** again with the 960 km added to its odometer; the driver is **AVAILABLE**. |
| 11 | As the customer, reopen the order. | 📷**O** Status **Delivered**, the full timeline, and *"Delivered. Your receipt is available in Billing."* |
| 12 | Open **My account**. | 📷**O** The notification panel lists every event raised — order placed, accepted, dispatched, tracking updated, invoice issued, payment confirmed, delivered — which is the Observer pattern firing. |

---

## Scenario 8 — Management reporting, and exit

*Business area 7. Assignment 1 Task 10, subtasks 1–4 and variant 1b.*

Sign in as **`staff.hcm@abctrans.example`**.

| # | Do this | Expect |
| --- | --- | --- |
| 1 | Open the **Reports** tab. | 📷**H** The report is generated for *This month* on *My branch only*. |
| 2 | Read the shipment statistics. | 📷**O** Six stat tiles — orders, delivered, on-time %, cargo moved, revenue invoiced, revenue collected — plus orders-by-status and busiest lanes. |
| 3 | **Variant 1b — empty period.** Change the period to **Today** and generate. | 📷**O** *"No data available for this period"* with the message *"No shipment activity for Day — …"*. A readable result, not an error. |
| 4 | Switch to **Resource utilisation**, period *This month*. | 📷**O** Average vehicle and driver utilisation, the number idle, and per-resource rows showing trips, committed hours and utilisation percentage — computable only because a completed itinerary survives its order. |
| 5 | **Subtask 3 — cross-branch.** Change the scope to **All branches** and regenerate. | 📷**O** Every branch's vehicles and drivers, with the scope label *"All branches"*. |
| 5a | Sign in as `staff.dad@abctrans.example` and generate the same report on **My branch only**. | 📷**O** *"No data available for this period"* — Da Nang has had no traffic. Switching that same account to **All branches** shows the national figures, which is exactly the fragmentation Assignment 1 identified as a pain point: one branch can now see the whole picture without leaving its own console. |
| 6 | Choose **Custom range**, pick a from/to, generate. | 📷**I** 📷**O** The report for exactly that window. |
| 7 | Click **Sign out**. | 📷**X** Back to the sign-in screen with an empty form. The session is destroyed server-side; the browser's stored token is cleared. |
| 8 | Press `Ctrl+C` in the server terminal. | 📷**X** *"[SmartFM] Shutting down. All data is already persisted under data/."* |
| 9 | Restart with `npm run server` and sign in again. | 📷**O** *"Seeded this run: no (existing data reused)"*. Every order, invoice and receipt survives; the next order gets a fresh reference, never a reused one. |

### Test and compile screens

| # | Command | Expect |
| --- | --- | --- |
| 10 | `npm run compile` | 📷**X** Clean output from `tsc --noEmit` over both projects — the evidence of compilation. |
| 11 | `npm test` | 📷**X** The full transcript, ending `118 passed, 0 failed, 118 total` and `RESULT: ALL TESTS PASSED`. |
| 12 | `npm run build` | 📷**X** Compilation followed by the production bundle sizes. |

---

## Coverage summary

| Business area | Assignment 1 tasks | Scenarios |
| --- | --- | --- |
| 1 — Customer account management | Task 3 | 1, 7 (step 12) |
| 2 — Fleet and driver management | Tasks 1, 2 | 5 |
| 3 — Order placement, amendment, cancellation | Tasks 4, 5, 6 | 2, 4 |
| 4 — Order processing and dispatch | Task 7 | 3 |
| 5 — Billing and payment | Task 9 | 6 |
| 6 — Shipment tracking | Task 8 | 7 |
| 7 — Management reporting | Task 10 | 8 |

Alternate and error paths demonstrated: Task 1 variants 2a and 5a; Task 2 variants 1a and 3a; Task 3
variants 1a and 5a; Task 4 variants 3a and 5a; Task 5 variants 5a and 5b; Task 6 variant 5a; Task 7
variants 3b and 3c; Task 8 variants 1a and 2a; Task 9 variants 1a, 1b and 3a; Task 10 variant 1b.
