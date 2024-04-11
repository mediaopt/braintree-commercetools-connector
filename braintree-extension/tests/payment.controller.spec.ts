import { describe, expect, test } from '@jest/globals';
import { paymentController } from '../src/controllers/payment.controller';
import isBase64 from 'validator/lib/isBase64';
import { PaymentReference } from '@commercetools/platform-sdk';
import { Transaction } from 'braintree';
import { UpdateActions } from '../src/types/index.types';

const getRandomId = (): string => {
  return `test_${Math.floor(Math.random() * Math.pow(2, 10))}`;
};

describe('Testing Braintree GetClient Token', () => {
  test('create client token', async () => {
    const paymentRequest = ({
      obj: {
        custom: {
          fields: {
            getClientTokenRequest: '{}',
          },
        },
      },
    } as unknown) as PaymentReference;
    const paymentResponse = await paymentController('Update', paymentRequest);
    expect(paymentResponse).toBeDefined();
    expect(paymentResponse).toHaveProperty('statusCode', 200);
    const getClientTokenResponse = paymentResponse?.actions.find(
      (action) => action.name === 'getClientTokenResponse'
    );
    expect(getClientTokenResponse).toBeDefined();
    expect(getClientTokenResponse?.name).toBe('getClientTokenResponse');
    const token = getClientTokenResponse?.value;
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
  }, 20000);
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
  ])(
    'create client token with $name',
    async ({ option }) => {
      const paymentRequest = ({
        obj: {
          custom: {
            fields: {
              getClientTokenRequest: JSON.stringify({ options: option }),
            },
          },
        },
      } as unknown) as PaymentReference;
      const paymentResponse = await paymentController('Update', paymentRequest);
      expect(paymentResponse).toBeDefined();
      expect(paymentResponse).toHaveProperty('statusCode', 200);
      const getClientTokenResponse = paymentResponse?.actions.find(
        (action) => action.name === 'getClientTokenResponse'
      );
      expect(getClientTokenResponse).toBeDefined();
      const token = getClientTokenResponse?.value;
      expect(token).toContain('"success":false');
    },
    20000
  );
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
      const paymentRequest = ({
        obj: {
          amountPlanned: {
            centAmount: 100,
            fractionDigits: 0,
          },
          custom: {
            fields: {
              transactionSaleRequest: nonce,
            },
          },
        },
      } as unknown) as PaymentReference;
      const paymentResponse = await paymentController('Update', paymentRequest);
      const payment = expectSuccessfulTransaction(paymentResponse);
      expect(payment).toHaveProperty('status', 'authorized');
      expect(payment).toHaveProperty(
        'paymentInstrumentType',
        expectedPaymentInstrumentType
      );
    },
    20000
  );
});

describe('Testing Braintree Find Transaction', () => {
  test('find transaction by BraintreeOrderId', async () => {
    const orderId = getRandomId();
    const transactionSaleRequest = ({
      obj: {
        amountPlanned: {
          centAmount: 100,
          fractionDigits: 0,
        },
        custom: {
          fields: {
            BraintreeOrderId: orderId,
            transactionSaleRequest: 'fake-visa-checkout-mastercard-nonce',
          },
        },
      },
    } as unknown) as PaymentReference;
    const findTransactionRequest = ({
      obj: {
        amountPlanned: {
          centAmount: 100,
          fractionDigits: 0,
        },
        custom: {
          fields: {
            BraintreeOrderId: orderId,
            findTransactionRequest: '{}',
          },
        },
      },
    } as unknown) as PaymentReference;
    let paymentResponse = await paymentController(
      'Update',
      transactionSaleRequest
    );
    let transaction = expectSuccessfulTransaction(paymentResponse);
    expect(transaction).toHaveProperty('orderId', orderId);
    paymentResponse = await paymentController('Update', findTransactionRequest);
    expect(paymentResponse).toBeDefined();
    expect(paymentResponse).toHaveProperty('statusCode', 200);
    const transactionSaleResponse = paymentResponse?.actions.find(
      (action) => action.name === 'findTransactionResponse'
    );
    expect(transactionSaleResponse).toBeDefined();
    transaction = JSON.parse(transactionSaleResponse?.value)[0] as Transaction;
    expect(transaction).toHaveProperty('orderId', orderId);
  }, 20000);
});

function expectSuccessfulTransaction(
  paymentResponse:
    | {
        actions: UpdateActions;
        statusCode: number;
      }
    | undefined
) {
  expect(paymentResponse).toBeDefined();
  expect(paymentResponse).toHaveProperty('statusCode', 200);
  const transactionSaleResponse = paymentResponse?.actions.find(
    (action) => action.name === 'transactionSaleResponse'
  );
  expect(transactionSaleResponse).toBeDefined();
  return JSON.parse(transactionSaleResponse?.value) as Transaction;
}

describe('Testing Braintree aftersales', () => {
  test('Void an authorization', async () => {
    const paymentRequest = ({
      obj: {
        amountPlanned: {
          centAmount: 100,
          fractionDigits: 0,
        },
        custom: {
          fields: {
            transactionSaleRequest: 'fake-valid-prepaid-nonce',
          },
        },
      },
    } as unknown) as PaymentReference;
    let paymentResponse = await paymentController('Update', paymentRequest);
    let payment = expectSuccessfulTransaction(paymentResponse);
    expect(payment).toHaveProperty('status', 'authorized');

    const voidRequest = ({
      obj: {
        amountPlanned: {
          centAmount: 100,
          fractionDigits: 0,
        },
        interfaceId: payment.id,
        transactions: [
          {
            type: 'Authorization',
            interactionId: payment.id,
          },
        ],
        custom: {
          fields: {
            voidRequest: '{}',
          },
        },
      },
    } as unknown) as PaymentReference;
    paymentResponse = await paymentController('Update', voidRequest);
    expect(paymentResponse).toHaveProperty('statusCode', 200);
    const voidResponse = paymentResponse?.actions.find(
      (action) => action.name === 'voidResponse'
    );
    expect(voidResponse).toBeDefined();
    payment = JSON.parse(voidResponse?.value);
    expect(payment).toHaveProperty('status', 'voided');
  }, 20000);

  test('Settle an authorization', async () => {
    const paymentRequest = ({
      obj: {
        amountPlanned: {
          centAmount: 100,
          fractionDigits: 0,
        },
        custom: {
          fields: {
            transactionSaleRequest: 'fake-visa-checkout-amex-nonce',
          },
        },
      },
    } as unknown) as PaymentReference;
    let paymentResponse = await paymentController('Update', paymentRequest);
    let payment = expectSuccessfulTransaction(paymentResponse);
    expect(payment).toHaveProperty('status', 'authorized');

    const settlementRequest = ({
      obj: {
        amountPlanned: {
          centAmount: 100,
          fractionDigits: 0,
        },
        interfaceId: payment.id,
        transactions: [
          {
            type: 'Authorization',
            interactionId: payment.id,
          },
        ],
        custom: {
          fields: {
            submitForSettlementRequest: '{}',
          },
        },
      },
    } as unknown) as PaymentReference;
    paymentResponse = await paymentController('Update', settlementRequest);
    expect(paymentResponse).toHaveProperty('statusCode', 200);
    const settlementResponse = paymentResponse?.actions.find(
      (action) => action.name === 'submitForSettlementResponse'
    );
    expect(settlementResponse).toBeDefined();
    payment = JSON.parse(settlementResponse?.value);
    expect(payment).toHaveProperty('status', 'submitted_for_settlement');
  }, 20000);

  test('Refund a settlement', async () => {
    process.env.BRAINTREE_AUTOCAPTURE = 'true';
    const paymentRequest = ({
      obj: {
        amountPlanned: {
          centAmount: 100,
          fractionDigits: 0,
        },
        custom: {
          fields: {
            transactionSaleRequest: 'fake-paypal-one-time-nonce',
          },
        },
      },
    } as unknown) as PaymentReference;

    let paymentResponse = await paymentController('Update', paymentRequest);
    let payment = expectSuccessfulTransaction(paymentResponse);
    expect(payment.status).toBe('settling');
    const interfaceId = payment.id;
    const refundRequest = ({
      obj: {
        amountPlanned: {
          centAmount: 100,
          fractionDigits: 0,
        },
        interfaceId: interfaceId,
        transactions: [
          {
            type: 'Charge',
            interactionId: interfaceId,
          },
        ],
        custom: {
          fields: {
            refundRequest: '{}',
          },
        },
      },
    } as unknown) as PaymentReference;
    paymentResponse = await paymentController('Update', refundRequest);
    expect(paymentResponse).toHaveProperty('statusCode', 200);
    const refundResponse = paymentResponse?.actions.find(
      (action) => action.name === 'refundResponse'
    );
    expect(refundResponse).toBeDefined();
    payment = JSON.parse(refundResponse?.value);
    expect(payment).toHaveProperty('status', 'settling');
    expect(payment).toHaveProperty('type', 'credit');
    expect(payment).toHaveProperty('refundedTransactionId', interfaceId);
  }, 20000);
});
