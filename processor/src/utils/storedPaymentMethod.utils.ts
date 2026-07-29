import { CreditCard, PayPalAccount } from 'braintree';
import { StoredPaymentMethod } from '../dtos/stored-payment-methods.dto';

export const mapBraintreeCreditCardToStoredPaymentMethod = (cc: CreditCard): StoredPaymentMethod => ({
  id: cc.token,
  type: 'CreditCard',
  token: cc.token,
  isDefault: cc.default ?? false,
  createdAt: cc.createdAt,
  displayOptions: {
    endDigits: cc.last4,
    brand: cc.cardType ? { key: cc.cardType } : undefined,
    expiryMonth: cc.expirationMonth ? parseInt(cc.expirationMonth, 10) : undefined,
    expiryYear: cc.expirationYear ? parseInt(cc.expirationYear, 10) : undefined,
  },
});

export const mapBraintreePaypalAccountToStoredPaymentMethod = (pp: PayPalAccount): StoredPaymentMethod => ({
  id: pp.token,
  type: 'PayPal',
  token: pp.token,
  isDefault: pp.default ?? false,
  createdAt: pp.createdAt,
  displayOptions: { email: pp.email },
});

// `ba` is typed as `any` because the Braintree Node SDK returns usBankAccounts at runtime
// but @types/braintree does not declare the type — there is no UsBankAccount interface to import.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const mapBraintreeUsBankAccountToStoredPaymentMethod = (ba: any): StoredPaymentMethod => ({
  id: ba.token,
  type: 'UsBankAccount',
  token: ba.token,
  isDefault: ba.default ?? false,
  createdAt: ba.createdAt,
  displayOptions: {
    endDigits: ba.last4,
    brand: ba.accountType ? { key: ba.accountType } : undefined,
  },
});
