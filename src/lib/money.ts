import { z } from 'zod';
import { fieldError } from './http-schemas.js';

const MINOR_UNITS_PER_MAJOR = 100;

/** Largest amount accepted for a single transaction or transfer, in major units (₹). */
export const MAX_TRANSACTION_AMOUNT = 1_000_000_000;

export const toMinorUnits = (amount: number): number => Math.round(amount * MINOR_UNITS_PER_MAJOR);

export const toMajorUnits = (minor: number): number => minor / MINOR_UNITS_PER_MAJOR;

const hasAtMostTwoDecimals = (value: number): boolean => {
  const scaled = value * MINOR_UNITS_PER_MAJOR;
  return Math.abs(scaled - Math.round(scaled)) < 1e-6;
};

/** Request-side amount: a positive number in major units with at most 2 decimal places. */
export const amountSchema = z
  .number({ error: fieldError('amount', 'a number') })
  .positive('amount must be greater than 0')
  .max(MAX_TRANSACTION_AMOUNT, `amount must not exceed ${MAX_TRANSACTION_AMOUNT}`)
  .refine(hasAtMostTwoDecimals, 'amount must have at most 2 decimal places')
  .meta({
    description: 'Amount in major currency units (e.g. 150.75), at most 2 decimal places',
    example: 100,
  });
