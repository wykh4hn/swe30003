/**
 * The shapes the server's `Presenter` sends to the browser.
 *
 * These interfaces are the client's half of the contract described on
 * `Presenter`. Declaring them explicitly — rather than passing `any` around —
 * means a change to a server projection breaks the build rather than a screen at
 * runtime, which is the practical benefit of running one language across both
 * tiers.
 */

export interface MoneyView {
  amount: number;
  formatted: string;
}

export interface AddressView {
  street: string;
  district: string;
  city: string;
  formatted: string;
}

export interface BranchView {
  id: string;
  name: string;
  code: string;
  label: string;
  address: AddressView;
  contact: { email: string; phone: string };
  isActive: boolean;
}

export interface VehicleView {
  id: string;
  registration: string;
  type: string;
  label: string;
  branchId: string;
  status: string;
  odometerKm: number;
  maxWeightKg: number;
  maxVolumeM3: number;
  isRefrigerated: boolean;
  requiredLicenceClass: string;
  availableFrom: string | null;
  activeItineraryId: string | null;
  maintenanceLog: { recordedAt: string; description: string; isOpen: boolean; returnedToServiceAt: string | null }[];
}

export interface DriverView {
  id: string;
  fullName: string;
  contact: { email: string; phone: string };
  branchId: string;
  licenceNumber: string;
  licenceClass: string;
  availability: string;
  isActive: boolean;
  activeItineraryId: string | null;
  leave: { start: string; end: string } | null;
}

export interface CustomerView {
  id: string;
  fullName: string;
  companyName: string | null;
  contact: { email: string; phone: string };
  billingAddress: AddressView;
  accountStatus: string;
  notificationsEnabled: boolean;
  isActive: boolean;
  registeredAt: string;
}

export interface TrackingEntryView {
  id: string;
  recordedAt: string;
  state: string;
  locationLabel: string;
  description: string;
  estimatedArrival: string | null;
  note: string | null;
}

export interface OrderView {
  id: string;
  reference: string;
  customerId: string;
  branchId: string;
  status: string;
  statusLabel: string;
  permittedNextStates: string[];
  isModifiable: boolean;
  isOpen: boolean;
  isSplitShipment: boolean;
  placedAt: string;
  quotedPrice: MoneyView;
  rejectionReason: string | null;
  invoiceId: string | null;
  itineraryIds: string[];
  currentEta: string;
  cargo: {
    description: string;
    unitCount: number;
    unitWeightKg: number;
    totalWeightKg: number;
    totalVolumeM3: number;
    handling: string;
    declaredValue: number;
    summary: string;
  };
  delivery: {
    pickupAddress: AddressView;
    deliveryAddress: AddressView;
    requestedPickupAt: string;
    requiredDeliveryBy: string;
    serviceLevel: string;
    recipientName: string;
    recipientPhone: string;
    summary: string;
  };
  tracking: TrackingEntryView[];
  history: {
    recordedAt: string;
    actor: string;
    summary: string;
    fromStatus: string | null;
    toStatus: string | null;
    formatted: string;
  }[];
}

export interface AvailabilityOptionView {
  branchId: string;
  branchName: string;
  vehicles: { id: string; registration: string; type: string; maxWeightKg: number; loadFactorPercent: number }[];
  isSplitShipment: boolean;
  routeLabel: string;
  distanceKm: number;
  estimatedHours: number;
  priceDong: number;
  priceFormatted: string;
}

export interface AvailabilityResultView {
  options: AvailabilityOptionView[];
  message: string;
  alternativeCities: string[];
}

export interface HoldView {
  id: string;
  vehicleId: string;
  orderId: string | null;
  expiresAt: string;
  minutesRemaining: number;
  isActive: boolean;
}

export interface InvoiceView {
  id: string;
  invoiceNumber: string;
  orderId: string;
  customerId: string;
  status: string;
  isOutstanding: boolean;
  isOverdue: boolean;
  issuedAt: string;
  dueAt: string;
  total: MoneyView;
  attemptCount: number;
  lines: { description: string; quantity: number; unitPrice: MoneyView; lineTotal: MoneyView }[];
  rendered: string;
}

export interface PaymentView {
  id: string;
  invoiceId: string;
  orderId: string;
  amount: MoneyView;
  attemptedAt: string;
  methodKind: string;
  methodDescription: string;
  succeeded: boolean;
  outcome: string;
  message: string | null;
  retryable: boolean;
  receiptId: string | null;
}

export interface ReceiptView {
  id: string;
  receiptNumber: string;
  paymentId: string;
  invoiceId: string;
  orderId: string;
  amount: MoneyView;
  paidAt: string;
  methodDescription: string;
  gatewayReference: string | null;
  rendered: string;
}

export interface PaymentOutcomeView {
  succeeded: boolean;
  message: string;
  retryable: boolean;
  invoiceStatus: string;
  receipt: ReceiptView | null;
}

export interface TimelineView {
  orderReference: string;
  statusLabel: string;
  currentEta: string;
  isDelayed: boolean;
  routeLabel: string | null;
  nextStep: string;
  entries: { recordedAt: string; state: string; description: string; estimatedArrival: string | null }[];
}

export interface DriverJobView {
  itineraryId: string;
  orderId: string;
  orderReference: string;
  status: string;
  vehicleLabel: string;
  cargoSummary: string;
  pickup: string;
  destination: string;
  dueBy: string;
  assignedWeightKg: number;
}

export interface OrderReviewView {
  orderReference: string;
  customerName: string;
  cargoSummary: string;
  deliverySummary: string;
  routeLabel: string;
  quoteFormatted: string;
  problems: string[];
  warnings: string[];
  canAccept: boolean;
}

export interface AssignmentSuggestionView {
  vehicleId: string;
  vehicleLabel: string;
  driverId: string;
  driverName: string;
  driverLicenceClass: string;
  capacityKg: number;
}

export interface ItineraryView {
  id: string;
  orderId: string;
  vehicleId: string;
  driverId: string;
  legNumber: number;
  assignedWeightKg: number;
  status: string;
  label: string;
  committedHours: number;
}

export interface ShipmentReportView {
  kind: 'SHIPMENT_STATISTICS';
  periodLabel: string;
  scopeLabel: string;
  generatedAt: string;
  isEmpty: boolean;
  headline: string;
  totalOrders: number;
  countsByStatus: Record<string, number>;
  deliveredCount: number;
  onTimeCount: number;
  cancelledCount: number;
  rejectedCount: number;
  splitShipmentCount: number;
  totalCargoWeightKg: number;
  onTimeDeliveryRate: number;
  completionRate: number;
  collectionRate: number;
  revenueInvoiced: MoneyView;
  revenueCollected: MoneyView;
  busiestLanes: { lane: string; orderCount: number }[];
}

export interface UtilisationRowView {
  resourceId: string;
  label: string;
  branchId: string;
  itineraryCount: number;
  committedHours: number;
  utilisationPercent: number;
  currentState: string;
}

export interface ResourceReportView {
  kind: 'RESOURCE_UTILISATION';
  periodLabel: string;
  scopeLabel: string;
  generatedAt: string;
  isEmpty: boolean;
  headline: string;
  totalItineraries: number;
  averageVehicleUtilisation: number;
  averageDriverUtilisation: number;
  vehicleRows: UtilisationRowView[];
  driverRows: UtilisationRowView[];
  idleVehicleCount: number;
  idleDriverCount: number;
}

export interface NotificationView {
  orderReference: string;
  event: string;
  message: string;
  raisedAt: string;
}

export interface ReferenceData {
  cities: string[];
  vehicleTypes: string[];
  licenceClasses: string[];
  handlingClasses: string[];
  serviceLevels: string[];
  trackingStates: string[];
  demoAccounts: { role: string; username: string; description: string }[];
  demoPassword: string;
  branches: BranchView[];
}

export interface SessionView {
  token?: string;
  role: 'CUSTOMER' | 'BRANCH_STAFF' | 'DRIVER';
  username: string;
  personId: string;
  branchId: string | null;
  expiresAt: string;
  profile: CustomerView | BranchView | DriverView | null;
}
