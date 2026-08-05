import { Guard } from '../shared/Guard.ts';
import { Money } from '../shared/Money.ts';

/**
 * One itemised charge on an invoice.
 *
 * Assignment 3 change C6. Assignment 1 Task 5 subtask 4 and Task 9 subtask 1
 * both require the customer to see an *itemised* total before committing, and
 * Assignment 2's `Invoice` CRC card promised to "represent the itemized amount
 * due" — but there was no line-item class, so the itemisation could not exist.
 * `Invoice` composes its lines; a line has no meaning apart from its invoice.
 */
export class InvoiceLine {
  readonly description: string;
  readonly quantity: number;
  readonly unitPrice: Money;

  private constructor(description: string, quantity: number, unitPrice: Money) {
    this.description = description;
    this.quantity = quantity;
    this.unitPrice = unitPrice;
  }

  /**
   * The quantity is whatever the line is priced by — a count, a distance in
   * kilometres, or a weight in kilograms — so the upper bound is generous
   * enough for a full 24-tonne load over the longest lane in the network.
   */
  static create(description: unknown, quantity: unknown, unitPrice: Money): InvoiceLine {
    return new InvoiceLine(
      Guard.text('line.description', description, 3, 150),
      Guard.positive('line.quantity', quantity, 1_000_000),
      unitPrice,
    );
  }

  lineTotal(): Money {
    return this.unitPrice.times(this.quantity);
  }

  format(): string {
    return `${this.description} x${this.quantity} @ ${this.unitPrice.format()} = ${this.lineTotal().format()}`;
  }
}
