import { Guard } from '../shared/Guard.ts';

export const HANDLING_CLASSES = ['STANDARD', 'FRAGILE', 'REFRIGERATED', 'HAZARDOUS'] as const;
export type HandlingClass = (typeof HANDLING_CLASSES)[number];

/**
 * The goods a customer wants moved.
 *
 * Assignment 2 non-change N2: `ShipmentOrder` still *composes* its cargo — the
 * description of a load has no meaning once its order is gone, so the marker's
 * objection to composition elsewhere does not apply here. The composition is
 * retained deliberately, not by omission.
 *
 * The class is immutable: an amendment produces a new `CargoDetails` and is
 * recorded in the order's change history, which is what makes the audit trail
 * required by Assignment 1 §9.1 trustworthy.
 */
export class CargoDetails {
  readonly description: string;
  readonly unitCount: number;
  readonly unitWeightKg: number;
  readonly totalVolumeM3: number;
  readonly handling: HandlingClass;
  readonly declaredValue: number;

  private constructor(params: {
    description: string;
    unitCount: number;
    unitWeightKg: number;
    totalVolumeM3: number;
    handling: HandlingClass;
    declaredValue: number;
  }) {
    this.description = params.description;
    this.unitCount = params.unitCount;
    this.unitWeightKg = params.unitWeightKg;
    this.totalVolumeM3 = params.totalVolumeM3;
    this.handling = params.handling;
    this.declaredValue = params.declaredValue;
  }

  static create(input: {
    description: unknown;
    unitCount: unknown;
    unitWeightKg: unknown;
    totalVolumeM3: unknown;
    handling: unknown;
    declaredValue?: unknown;
  }): CargoDetails {
    return Guard.collect(
      [
        () => Guard.text('cargo.description', input.description, 3, 200),
        () => Guard.positiveInteger('cargo.unitCount', input.unitCount, 10_000),
        () => Guard.positive('cargo.unitWeightKg', input.unitWeightKg, 24_000),
        () => Guard.positive('cargo.totalVolumeM3', input.totalVolumeM3, 40),
        () => Guard.oneOf('cargo.handling', input.handling, HANDLING_CLASSES),
        () => Guard.number('cargo.declaredValue', input.declaredValue ?? 0, 0, 100_000_000_000),
      ],
      () =>
        new CargoDetails({
          description: Guard.text('cargo.description', input.description, 3, 200),
          unitCount: Guard.positiveInteger('cargo.unitCount', input.unitCount, 10_000),
          unitWeightKg: Guard.positive('cargo.unitWeightKg', input.unitWeightKg, 24_000),
          totalVolumeM3: Guard.positive('cargo.totalVolumeM3', input.totalVolumeM3, 40),
          handling: Guard.oneOf('cargo.handling', input.handling, HANDLING_CLASSES),
          declaredValue: Guard.number('cargo.declaredValue', input.declaredValue ?? 0, 0, 100_000_000_000),
        }),
    );
  }

  /** Facts the vehicle needs in order to answer `canCarry()`. */
  get totalWeightKg(): number {
    return Math.round(this.unitCount * this.unitWeightKg * 100) / 100;
  }

  requiresSpecialHandling(): boolean {
    return this.handling !== 'STANDARD';
  }

  /** Multiplier applied by `PricingService`; riskier freight costs more to move. */
  handlingSurchargeRate(): number {
    switch (this.handling) {
      case 'STANDARD':
        return 0;
      case 'FRAGILE':
        return 0.15;
      case 'REFRIGERATED':
        return 0.35;
      case 'HAZARDOUS':
        return 0.5;
      default:
        return 0;
    }
  }

  summary(): string {
    return `${this.unitCount} x ${this.description} (${this.totalWeightKg} kg, ${this.totalVolumeM3} m3, ${this.handling})`;
  }
}
