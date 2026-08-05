import type { Branch } from '../domain/fleet/Branch.ts';
import type { Vehicle } from '../domain/fleet/Vehicle.ts';
import type { Driver } from '../domain/people/Driver.ts';
import type { Customer } from '../domain/people/Customer.ts';
import type { ShipmentOrder } from '../domain/ordering/ShipmentOrder.ts';
import { OrderLifecycle } from '../domain/ordering/OrderStatus.ts';
import type { CapacityHold } from '../domain/ordering/CapacityHold.ts';
import type { Itinerary } from '../domain/dispatch/Itinerary.ts';
import type { Route } from '../domain/dispatch/Route.ts';
import type { Invoice } from '../domain/billing/Invoice.ts';
import type { Payment } from '../domain/billing/Payment.ts';
import type { Receipt } from '../domain/billing/Receipt.ts';
import type { ShipmentStatisticsReport } from '../domain/reporting/ShipmentStatisticsReport.ts';
import type { ResourceUtilisationReport } from '../domain/reporting/ResourceUtilisationReport.ts';
import type { Address } from '../domain/shared/Address.ts';
import type { Money } from '../domain/shared/Money.ts';

/**
 * Projects domain objects onto the JSON the browser receives.
 *
 * Assignment 3 change C9. Serialising entities directly would have three costs:
 * private state would leak (a password digest, a payment strategy's internals),
 * the wire format would silently become part of the domain's public contract,
 * and any refactor of a domain class would break the client.
 *
 * Presenting explicitly keeps the boundary one-way — the domain never knows the
 * browser exists — and lets each view receive exactly the fields it renders,
 * already formatted for display (`priceFormatted`, `statusLabel`).
 */
export class Presenter {
  private constructor() {
    // Static projector; never instantiated.
  }

  static address(address: Address): Record<string, unknown> {
    return { street: address.street, district: address.district, city: address.city, formatted: address.format() };
  }

  static money(amount: Money): Record<string, unknown> {
    return { amount: amount.amount, formatted: amount.format() };
  }

  static branch(branch: Branch): Record<string, unknown> {
    return {
      id: branch.id,
      name: branch.name,
      code: branch.code,
      label: branch.label(),
      address: Presenter.address(branch.address),
      contact: { email: branch.contact.email, phone: branch.contact.phone },
      isActive: branch.isActive,
    };
  }

  static vehicle(vehicle: Vehicle): Record<string, unknown> {
    return {
      id: vehicle.id,
      registration: vehicle.registration,
      type: vehicle.type,
      label: vehicle.label(),
      branchId: vehicle.branchId,
      status: vehicle.status,
      odometerKm: vehicle.odometerKm,
      maxWeightKg: vehicle.maxWeightKg,
      maxVolumeM3: vehicle.maxVolumeM3,
      isRefrigerated: vehicle.isRefrigerated,
      requiredLicenceClass: vehicle.requiredLicenceClass(),
      availableFrom: vehicle.availableFrom?.toISOString() ?? null,
      activeItineraryId: vehicle.activeItineraryId ?? null,
      maintenanceLog: vehicle.maintenanceLog.map((entry) => ({
        recordedAt: entry.recordedAt.toISOString(),
        description: entry.description,
        isOpen: entry.isOpen(),
        returnedToServiceAt: entry.returnedToServiceAt?.toISOString() ?? null,
      })),
    };
  }

  static driver(driver: Driver): Record<string, unknown> {
    return {
      id: driver.id,
      fullName: driver.fullName,
      contact: { email: driver.contact.email, phone: driver.contact.phone },
      branchId: driver.branchId,
      licenceNumber: driver.licenceNumber,
      licenceClass: driver.licenceClass,
      availability: driver.availability,
      isActive: driver.isActive,
      activeItineraryId: driver.activeItineraryId ?? null,
      leave:
        driver.leave === undefined
          ? null
          : { start: driver.leave.start.toISOString(), end: driver.leave.end.toISOString() },
    };
  }

  static customer(customer: Customer): Record<string, unknown> {
    return {
      id: customer.id,
      fullName: customer.fullName,
      companyName: customer.companyName ?? null,
      contact: { email: customer.contact.email, phone: customer.contact.phone },
      billingAddress: Presenter.address(customer.billingAddress),
      accountStatus: customer.accountStatus,
      notificationsEnabled: customer.notificationsEnabled,
      isActive: customer.isActive,
      registeredAt: customer.registeredAt.toISOString(),
    };
  }

  static order(order: ShipmentOrder): Record<string, unknown> {
    return {
      id: order.id,
      reference: order.reference,
      customerId: order.customerId,
      branchId: order.branchId,
      status: order.status,
      statusLabel: OrderLifecycle.describe(order.status),
      permittedNextStates: order.permittedNextStates(),
      isModifiable: order.isModifiable(),
      isOpen: order.isOpen(),
      isSplitShipment: order.isSplitShipment,
      placedAt: order.placedAt.toISOString(),
      quotedPrice: Presenter.money(order.quotedPrice),
      rejectionReason: order.rejectionReason ?? null,
      invoiceId: order.invoiceId ?? null,
      itineraryIds: [...order.itineraryIds],
      currentEta: order.currentEta().toISOString(),
      cargo: {
        description: order.cargo.description,
        unitCount: order.cargo.unitCount,
        unitWeightKg: order.cargo.unitWeightKg,
        totalWeightKg: order.cargo.totalWeightKg,
        totalVolumeM3: order.cargo.totalVolumeM3,
        handling: order.cargo.handling,
        declaredValue: order.cargo.declaredValue,
        summary: order.cargo.summary(),
      },
      delivery: {
        pickupAddress: Presenter.address(order.delivery.pickupAddress),
        deliveryAddress: Presenter.address(order.delivery.deliveryAddress),
        requestedPickupAt: order.delivery.requestedPickupAt.toISOString(),
        requiredDeliveryBy: order.delivery.requiredDeliveryBy.toISOString(),
        serviceLevel: order.delivery.serviceLevel,
        recipientName: order.delivery.recipientName,
        recipientPhone: order.delivery.recipientPhone,
        summary: order.delivery.summary(),
      },
      tracking: order.trackingHistory.map((update) => ({
        id: update.id,
        recordedAt: update.recordedAt.toISOString(),
        state: update.state,
        locationLabel: update.locationLabel,
        description: update.describe(),
        estimatedArrival: update.estimatedArrival?.toISOString() ?? null,
        note: update.note ?? null,
      })),
      history: order.changeHistory.map((change) => ({
        recordedAt: change.recordedAt.toISOString(),
        actor: change.actor,
        summary: change.summary,
        fromStatus: change.fromStatus ?? null,
        toStatus: change.toStatus ?? null,
        formatted: change.format(),
      })),
    };
  }

  static hold(hold: CapacityHold, now: Date): Record<string, unknown> {
    return {
      id: hold.id,
      vehicleId: hold.vehicleId,
      orderId: hold.orderId ?? null,
      expiresAt: hold.expiresAt.toISOString(),
      minutesRemaining: hold.minutesRemaining(now),
      isActive: hold.isActive(now),
    };
  }

  static itinerary(itinerary: Itinerary): Record<string, unknown> {
    return {
      id: itinerary.id,
      orderId: itinerary.orderId,
      branchId: itinerary.branchId,
      vehicleId: itinerary.vehicleId,
      driverId: itinerary.driverId,
      routeId: itinerary.routeId,
      legNumber: itinerary.legNumber,
      assignedWeightKg: itinerary.assignedWeightKg,
      status: itinerary.status,
      label: itinerary.label(),
      committedHours: itinerary.committedHours(),
      window: { start: itinerary.window.start.toISOString(), end: itinerary.window.end.toISOString() },
      completedAt: itinerary.completedAt?.toISOString() ?? null,
    };
  }

  static route(route: Route): Record<string, unknown> {
    return {
      id: route.id,
      origin: route.origin,
      destination: route.destination,
      label: route.label(),
      totalDistanceKm: route.totalDistanceKm(),
      estimatedHours: route.estimatedDurationHours(),
      legs: route.legs.map((leg) => ({
        from: leg.from.format(),
        to: leg.to.format(),
        distanceKm: leg.distanceKm,
        estimatedMinutes: leg.estimatedMinutes,
        formatted: leg.format(),
      })),
    };
  }

  static invoice(invoice: Invoice, now: Date): Record<string, unknown> {
    return {
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      orderId: invoice.orderId,
      customerId: invoice.customerId,
      status: invoice.status,
      isOutstanding: invoice.isOutstanding(),
      isOverdue: invoice.isOverdue(now),
      issuedAt: invoice.issuedAt.toISOString(),
      dueAt: invoice.dueAt.toISOString(),
      total: Presenter.money(invoice.total()),
      attemptCount: invoice.paymentAttemptIds.length,
      lines: invoice.lines.map((line) => ({
        description: line.description,
        quantity: line.quantity,
        unitPrice: Presenter.money(line.unitPrice),
        lineTotal: Presenter.money(line.lineTotal()),
      })),
      rendered: invoice.render(),
    };
  }

  static payment(payment: Payment): Record<string, unknown> {
    return {
      id: payment.id,
      invoiceId: payment.invoiceId,
      orderId: payment.orderId,
      amount: Presenter.money(payment.amount),
      attemptedAt: payment.attemptedAt.toISOString(),
      methodKind: payment.method.kind(),
      methodDescription: payment.method.describe(),
      succeeded: payment.isSuccessful(),
      outcome: payment.result?.outcome ?? 'PENDING',
      message: payment.result?.message ?? null,
      retryable: payment.result?.retryable ?? false,
      receiptId: payment.receiptId ?? null,
    };
  }

  static receipt(receipt: Receipt): Record<string, unknown> {
    return {
      id: receipt.id,
      receiptNumber: receipt.receiptNumber,
      paymentId: receipt.paymentId,
      invoiceId: receipt.invoiceId,
      orderId: receipt.orderId,
      amount: Presenter.money(receipt.amount),
      paidAt: receipt.paidAt.toISOString(),
      methodDescription: receipt.methodDescription,
      gatewayReference: receipt.gatewayReference ?? null,
      rendered: receipt.render(),
    };
  }

  static shipmentStatistics(report: ShipmentStatisticsReport): Record<string, unknown> {
    return {
      kind: 'SHIPMENT_STATISTICS',
      periodLabel: report.period.label,
      scopeLabel: report.scopeLabel,
      generatedAt: report.generatedAt.toISOString(),
      isEmpty: report.isEmpty(),
      headline: report.headline(),
      totalOrders: report.totalOrders,
      countsByStatus: report.countsByStatus,
      deliveredCount: report.deliveredCount,
      onTimeCount: report.onTimeCount,
      cancelledCount: report.cancelledCount,
      rejectedCount: report.rejectedCount,
      splitShipmentCount: report.splitShipmentCount,
      totalCargoWeightKg: report.totalCargoWeightKg,
      onTimeDeliveryRate: report.onTimeDeliveryRate(),
      completionRate: report.completionRate(),
      collectionRate: report.collectionRate(),
      revenueInvoiced: Presenter.money(report.revenueInvoiced),
      revenueCollected: Presenter.money(report.revenueCollected),
      busiestLanes: report.busiestLanes,
    };
  }

  static resourceUtilisation(report: ResourceUtilisationReport): Record<string, unknown> {
    return {
      kind: 'RESOURCE_UTILISATION',
      periodLabel: report.period.label,
      scopeLabel: report.scopeLabel,
      generatedAt: report.generatedAt.toISOString(),
      isEmpty: report.isEmpty(),
      headline: report.headline(),
      totalItineraries: report.totalItineraries,
      averageVehicleUtilisation: report.averageVehicleUtilisation(),
      averageDriverUtilisation: report.averageDriverUtilisation(),
      vehicleRows: report.vehicleRows,
      driverRows: report.driverRows,
      idleVehicleCount: report.idleVehicles().length,
      idleDriverCount: report.idleDrivers().length,
    };
  }
}
