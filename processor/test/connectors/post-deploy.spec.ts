import { describe, test, expect, beforeEach, jest } from '@jest/globals';

import { getConfig } from '../../src/config/config';

const paymentTypeKey = getConfig().paymentTypeKey;
const interactionTypeKey = getConfig().interactionTypeKey;
const customerTypeKey = getConfig().customerTypeKey;

const PAYMENT_TYPE_FULL_FIELD_NAMES = [
  'LocalPaymentMethodsPaymentId',
  'BraintreeOrderId',
  'getClientTokenProcessorRequest',
  'getClientTokenResponse',
  'transactionSaleProcessorRequest',
  'transactionSaleResponse',
  'submitForSettlementProcessorRequest',
  'submitForSettlementResponse',
  'refundProcessorRequest',
  'refundResponse',
  'voidProcessorRequest',
  'voidResponse',
  'findTransactionProcessorRequest',
  'findTransactionResponse',
];

const INTERACTION_TYPE_FULL_FIELD_NAMES = ['type', 'data', 'timestamp'];

// post-deploy.ts delegates the actual create-if-missing/add-missing-fields orchestration to
// paymentSDK.ctCustomTypeService.createOrUpdate() (built into @commercetools/connect-payments-sdk)
// — so this only needs to assert post-deploy builds and passes the right TypeDraft per type, not
// simulate the underlying CT HTTP calls itself (that's the SDK's own, separately-tested concern).
describe('connectors/post-deploy', () => {
  const runPostDeploy = async () => {
    jest.resetModules();
    const { paymentSDK } = require('../../src/payment-sdk');
    const createOrUpdate = jest.spyOn(paymentSDK.ctCustomTypeService, 'createOrUpdate').mockResolvedValue({} as never);
    require('../../src/connectors/post-deploy');
    // The module's own runPostDeployScripts() is async but not awaited by require() itself —
    // flush microtasks so its internal awaits have a chance to settle before assertions run.
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
    return createOrUpdate;
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("provisions braintree-payment-type with processor's own endpoint and direct fields", async () => {
    const createOrUpdate = await runPostDeploy();

    expect(createOrUpdate).toHaveBeenCalledWith({
      key: paymentTypeKey,
      name: { en: 'Custom payment type to braintree fields' },
      resourceTypeIds: ['payment'],
      fieldDefinitions: PAYMENT_TYPE_FULL_FIELD_NAMES.map((name) => expect.objectContaining({ name })),
    });
  });

  test('provisions braintree-payment-interaction-type with its 3 fixed fields', async () => {
    const createOrUpdate = await runPostDeploy();

    expect(createOrUpdate).toHaveBeenCalledWith({
      key: interactionTypeKey,
      name: { en: 'Custom payment interaction type to braintree fields' },
      resourceTypeIds: ['payment-interface-interaction'],
      fieldDefinitions: INTERACTION_TYPE_FULL_FIELD_NAMES.map((name) => expect.objectContaining({ name })),
    });
  });

  // the processor writes braintreeCustomerId itself (linkBraintreeCustomerId), so it doesn't rely on
  // braintree-extension's post-deploy for it — and never registers the extension's own customer fields
  test('provisions braintree-customer-type with braintreeCustomerId only', async () => {
    const createOrUpdate = await runPostDeploy();

    expect(createOrUpdate).toHaveBeenCalledWith({
      key: customerTypeKey,
      name: { en: 'Custom customer type to braintree fields' },
      resourceTypeIds: ['customer'],
      fieldDefinitions: [expect.objectContaining({ name: 'braintreeCustomerId' })],
    });
  });

  test('provisions all three types independently, in parallel', async () => {
    const createOrUpdate = await runPostDeploy();

    expect(createOrUpdate).toHaveBeenCalledTimes(3);
  });
});
