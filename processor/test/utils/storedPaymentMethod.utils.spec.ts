import { describe, test, expect } from '@jest/globals';
import {
  mapBraintreeCreditCardToStoredPaymentMethod,
  mapBraintreePaypalAccountToStoredPaymentMethod,
  mapBraintreeUsBankAccountToStoredPaymentMethod,
} from '../../src/utils/storedPaymentMethod.utils';
import { CreditCard, PayPalAccount } from 'braintree';

describe('storedPaymentMethod.utils', () => {
  describe('mapBraintreeCreditCardToStoredPaymentMethod', () => {
    const baseCreditCard = {
      token: 'cc-token-123',
      bin: '411111',
      last4: '1111',
      cardType: 'Visa',
      expirationMonth: '12',
      expirationYear: '2025',
      default: false,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      imageUrl: 'https://example.com/card.png',
      subscriptions: [],
      maskedNumber: '411111***1111',
      customFields: undefined,
    } as unknown as CreditCard;

    test('maps credit card with all fields', () => {
      const result = mapBraintreeCreditCardToStoredPaymentMethod(baseCreditCard);

      expect(result).toEqual({
        id: 'cc-token-123',
        type: 'card',
        token: 'cc-token-123',
        isDefault: false,
        createdAt: '2024-01-01T00:00:00Z',
        displayOptions: {
          endDigits: '1111',
          brand: { key: 'Visa' },
          expiryMonth: 12,
          expiryYear: 2025,
        },
      });
    });

    test.each([
      { isDefault: undefined, expected: false },
      { isDefault: true, expected: true },
    ])('isDefault $isDefault maps to $expected', ({ isDefault, expected }) => {
      const card = { ...baseCreditCard, default: isDefault } as unknown as CreditCard;
      expect(mapBraintreeCreditCardToStoredPaymentMethod(card).isDefault).toBe(expected);
    });

    test('leaves brand and expiry undefined when card type and expiration are missing', () => {
      const card = {
        ...baseCreditCard,
        cardType: undefined,
        expirationMonth: undefined,
        expirationYear: undefined,
      } as unknown as CreditCard;

      const { displayOptions } = mapBraintreeCreditCardToStoredPaymentMethod(card);

      expect(displayOptions).toEqual({
        endDigits: '1111',
        brand: undefined,
        expiryMonth: undefined,
        expiryYear: undefined,
      });
    });
  });

  describe('mapBraintreePaypalAccountToStoredPaymentMethod', () => {
    const basePayPalAccount = {
      token: 'paypal-token-456',
      email: 'user@example.com',
      default: false,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      subscriptions: [],
      customFields: undefined,
    } as unknown as PayPalAccount;

    test('maps PayPal account with all fields', () => {
      const result = mapBraintreePaypalAccountToStoredPaymentMethod(basePayPalAccount);

      expect(result).toEqual({
        id: 'paypal-token-456',
        type: 'PayPal',
        token: 'paypal-token-456',
        isDefault: false,
        createdAt: '2024-01-01T00:00:00Z',
        displayOptions: {
          email: 'user@example.com',
        },
      });
    });

    test.each([
      { isDefault: undefined, expected: false },
      { isDefault: true, expected: true },
    ])('isDefault $isDefault maps to $expected', ({ isDefault, expected }) => {
      const account = { ...basePayPalAccount, default: isDefault } as unknown as PayPalAccount;
      expect(mapBraintreePaypalAccountToStoredPaymentMethod(account).isDefault).toBe(expected);
    });
  });

  describe('mapBraintreeUsBankAccountToStoredPaymentMethod', () => {
    const baseUsBankAccount = {
      token: 'bank-token-789',
      last4: '4321',
      accountType: 'checking',
      default: false,
      createdAt: '2024-01-01T00:00:00Z',
      subscriptions: [],
    };

    test('maps US Bank Account with all fields', () => {
      const result = mapBraintreeUsBankAccountToStoredPaymentMethod(baseUsBankAccount);

      expect(result).toEqual({
        id: 'bank-token-789',
        type: 'UsBankAccount',
        token: 'bank-token-789',
        isDefault: false,
        createdAt: '2024-01-01T00:00:00Z',
        displayOptions: {
          endDigits: '4321',
          brand: { key: 'checking' },
        },
      });
    });

    test.each([
      { isDefault: undefined, expected: false },
      { isDefault: true, expected: true },
    ])('isDefault $isDefault maps to $expected', ({ isDefault, expected }) => {
      const account = { ...baseUsBankAccount, default: isDefault };
      expect(mapBraintreeUsBankAccountToStoredPaymentMethod(account).isDefault).toBe(expected);
    });

    test('leaves brand undefined when account type is missing', () => {
      const account = { ...baseUsBankAccount, accountType: undefined };
      expect(mapBraintreeUsBankAccountToStoredPaymentMethod(account).displayOptions.brand).toBeUndefined();
    });
  });
});
