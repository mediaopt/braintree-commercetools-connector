import { describe, expect, test } from '@jest/globals';
import {
  getClientToken,
  transactionSale,
} from '../src/service/braintree.service';
import validator from 'validator';
import isBase64 = validator.isBase64;

describe('Testing Braintree GetClient Token', () => {
  test('create client token', async () => {
    const token = await getClientToken({});
    expect(isBase64(token)).toBeTruthy();
    const data = JSON.parse(Buffer.from(token, 'base64').toString());
    expect(data).toBeDefined();
    expect(data).toHaveProperty(
      'environment',
      process.env.BRAINTREE_ENVIRONMENT
    );
    expect(data).toHaveProperty(
      'merchantId',
      process.env.BRAINTREE_MERCHANT_ID
    );
  });
  test.each([
    {
      name: 'makeDefault',
      option: { makeDefault: true },
    },
    {
      name: 'verifyCard',
      option: { verifyCard: true },
    },
    {
      name: 'failOnDuplicatePaymentMethod',
      option: { failOnDuplicatePaymentMethod: true },
    },
    {
      name: 'unknown user',
      option: { customerId: '123' },
    },
  ])('create client token with $name', async ({ option }) => {
    await expect(getClientToken({ options: option })).rejects.toBeInstanceOf(
      Error
    );
  });
});

describe('Testing Braintree Transaction Sale', () => {
  test.each([
    {
      name: 'credit card',
      nonce: 'fake-valid-nonce',
      expectedPaymentInstrumentType: 'credit_card',
    },
    {
      name: 'paypal',
      nonce: 'fake-paypal-billing-agreement-nonce',
      expectedPaymentInstrumentType: 'paypal_account',
    },
    {
      name: 'google pay',
      nonce: 'fake-android-pay-nonce',
      expectedPaymentInstrumentType: 'android_pay_card',
    },
    {
      name: 'venmo',
      nonce: 'fake-venmo-account-nonce',
      expectedPaymentInstrumentType: 'venmo_account',
    },
    {
      name: 'apple_pay',
      nonce: 'fake-apple-pay-visa-nonce',
      expectedPaymentInstrumentType: 'apple_pay_card',
    },
  ])(
    '$name transaction',
    async ({ nonce, expectedPaymentInstrumentType }) => {
      const response = expect(
        transactionSale({
          amount: '100',
          paymentMethodNonce: nonce,
        })
      ).resolves;
      await response.toHaveProperty('status', 'authorized');
      await response.toHaveProperty(
        'paymentInstrumentType',
        expectedPaymentInstrumentType
      );
    },
    10000
  );
});
