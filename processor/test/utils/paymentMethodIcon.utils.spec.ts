import { describe, test, expect } from '@jest/globals';
import { toPaymentMethodIconKey } from '../../src/utils/paymentMethodIcon.utils';
import { PaymentMethodType } from '../../src/dtos/braintree-payment.dto';

describe('paymentMethodIcon.utils', () => {
  describe('toPaymentMethodIconKey', () => {
    test.each<[PaymentMethodType, string]>([
      // Standard payment methods
      [PaymentMethodType.CREDIT_CARD, 'card'],
      [PaymentMethodType.PAYPAL, 'paypal'],
      [PaymentMethodType.GOOGLE_PAY, 'googlepay'],
      [PaymentMethodType.APPLE_PAY, 'applepay'],
      [PaymentMethodType.VENMO, PaymentMethodType.VENMO],
      [PaymentMethodType.ACH, PaymentMethodType.ACH],
      // Stored payment methods
      [PaymentMethodType.CREDIT_CARD_STORED, 'card'],
      // Local payment methods
      [PaymentMethodType.BANCONTACT, 'bancontactcard'],
      [PaymentMethodType.P24, 'przelewy24'],
      [PaymentMethodType.IDEAL, PaymentMethodType.IDEAL],
      [PaymentMethodType.EPS, PaymentMethodType.EPS],
      [PaymentMethodType.BLIK, PaymentMethodType.BLIK],
      [PaymentMethodType.MYBANK, PaymentMethodType.MYBANK],
    ])('maps %s to %s', (methodType, expectedIcon) => {
      expect(toPaymentMethodIconKey(methodType)).toBe(expectedIcon);
    });
  });
});
