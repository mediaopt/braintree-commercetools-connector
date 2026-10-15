import { describe, test, expect, afterEach, jest, beforeEach } from '@jest/globals';
import { ConfigResponse } from '../../src/services/types/operation.type';
import { paymentSDK } from '../../src/payment-sdk';
import { PaymentMethodType, LocalPaymentMethodType } from '../../src/dtos/braintree-payment.dto';
import { buildCartLineItems, LineItemKind } from '../../src/utils/lineItem.utils';
import { mockGetPaymentResult, mockGetPaymentResultWithoutTransactions } from '../utils/mock-payment-results';
import { buildPlaceholderInteractionId } from '../../src/utils/transaction.utils';
import { PaymentModificationStatus } from '../../src/dtos/operations/payment-intents.dto';
import { ErrorInvalidOperation } from '@commercetools/connect-payments-sdk';
import { mockBraintreeTransaction } from '../utils/mock-payment-data';
import { mockCustomTypeLookup } from '../utils/mock-custom-type-lookup';
import { braintreePaymentCustom, nonBraintreeCustomCases, otherTypeCustom } from '../utils/mock-custom-types';
import { notBraintreePayment } from '../../src/utils/customEntities.utils';
import * as CustomEntities from '../../src/utils/customEntities.utils';

// transactionSale is exported as a non-configurable ES module binding; jest.spyOn cannot
// replace it. We must use jest.mock with a factory so Jest swaps the module before imports run.
jest.mock('common-connect/dist', () => ({
  ...(jest.requireActual('common-connect/dist') as object),
  transactionSale: jest.fn(),
  getBraintreeGateway: jest.fn(),
  submitForSettlement: jest.fn(),
  getClientToken: jest.fn(),
  deletePayment: jest.fn(),
  refund: jest.fn(),
  voidTransaction: jest.fn(),
  getTransaction: jest.fn(),
}));
import * as CommonConnect from 'common-connect/dist';
// import { DefaultPaymentService } from '@commercetools/connect-payments-sdk/dist/commercetools/services/ct-payment.service';
// import { DefaultCartService } from '@commercetools/connect-payments-sdk/dist/commercetools/services/ct-cart.service';
// import {
//   mockGetPaymentResult,
//   mockGetPaymentResultWithoutTransactions,
//   mockUpdatePaymentResult,
//   mockUpdatePaymentResultWithRefundTransaction,
// } from '../utils/mock-payment-results';
// import { mockGetCartResult } from '../utils/mock-cart-data';
import { Cart, Customer, Payment } from '@commercetools/connect-payments-sdk';
import { BraintreeCustomerService } from '../../src/services/braintree-customer.service';
import { log } from '../../src/libs/logger';
import { CentPrecisionMoney, Transaction } from '@commercetools/platform-sdk';
import {
  lineItemWithTotal,
  mockCartForShippingUpdate,
  mockCartWithExternalTax,
  mockGetCartResult,
} from '../utils/mock-cart-data';
import * as Config from '../../src/config/config';
import { BraintreePaymentServiceOptions } from '../../src/services/types/braintree-payment.type';
import { AbstractPaymentService } from '../../src/services/abstract-payment.service';
import {
  BraintreePaymentService,
  CONCURRENT_CANCEL_AND_SALE_ISSUE,
} from '../../src/services/braintree-payment.service';
import * as FastifyContext from '../../src/libs/fastify/context/context';
import * as StoredPaymentMethodsConfig from '../../src/config/stored-payment-methods.config';
// import * as StatusHandler from '@commercetools/connect-payments-sdk/dist/api/handlers/status.handler';
//
// import { HealthCheckResult } from '@commercetools/connect-payments-sdk';
// import { PaymentMethodType, PaymentOutcome } from '../src/dtos/braintree-payment.dto';

interface FlexibleConfig {
  [key: string]: string; // Adjust the type according to your config values
}

// function setupMockConfig(keysAndValues: Record<string, string>) {
//   const mockConfig: FlexibleConfig = {};
//   Object.keys(keysAndValues).forEach((key) => {
//     mockConfig[key] = keysAndValues[key];
//   });
//
//   // eslint-disable-next-line @typescript-eslint/no-explicit-any
//   jest.spyOn(Config, 'getConfig').mockReturnValue(mockConfig as any);
// }

describe('braintree-payment.service', () => {
  const opts: BraintreePaymentServiceOptions = {
    ctCartService: paymentSDK.ctCartService,
    ctPaymentService: paymentSDK.ctPaymentService,
    ctPaymentMethodService: paymentSDK.ctPaymentMethodService,
  };
  const paymentService: AbstractPaymentService = new BraintreePaymentService(opts);
  //const braintreePaymentService: BraintreePaymentService = new BraintreePaymentService(opts);

  // Raw CT client calls (setStatusInterfaceCode etc., placeholder add/overwrite) — CT sync is awaited in the
  // response path, so it's mocked for the whole file instead of letting it reach the real CT API.
  const savedClient = paymentSDK.ctAPI.client;
  type RawPaymentPostArgs = { body: { version: number; actions: Array<Record<string, unknown>> } };
  let rawPaymentPost: jest.Mock<(args: RawPaymentPostArgs) => unknown>;
  let rawPostExecute: jest.Mock<() => Promise<unknown>>;
  // commercetools answers an update with the updated payment; syncPayment returns it (reverse continues from it).
  // Default: no body, so callers continue from their own snapshot — tests that check the continuation set one.
  const rawPostReturns = (payment: unknown) => rawPostExecute.mockResolvedValue({ body: payment });
  const rawActionCalls = () => rawPaymentPost.mock.calls.map(([args]) => args.body.actions);
  const setCtClient = (client: unknown) => ((paymentSDK.ctAPI as { client: unknown }).client = client);

  beforeEach(() => {
    jest.setTimeout(10000);
    jest.resetAllMocks();
    mockCustomTypeLookup();
    rawPostExecute = jest.fn<() => Promise<unknown>>().mockResolvedValue({ body: undefined });
    rawPaymentPost = jest.fn<(args: RawPaymentPostArgs) => unknown>().mockReturnValue({ execute: rawPostExecute });
    const withId = jest.fn().mockReturnValue({ post: rawPaymentPost });
    setCtClient({ payments: jest.fn().mockReturnValue({ withId }) });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    setCtClient(savedClient);
  });

  const transaction = (overrides: Partial<Transaction>): Transaction => ({
    id: 'tx',
    type: 'Authorization',
    state: 'Success',
    amount: mockGetPaymentResult.amountPlanned,
    timestamp: '2024-01-01T00:00:00Z',
    ...overrides,
  });
  const achPlaceholder = transaction({
    id: 'placeholder-1',
    state: 'Pending',
    interactionId: buildPlaceholderInteractionId(mockGetPaymentResult.id),
  });
  // A failed Braintree call is recorded on the payment in one raw CT call — what was sent and what Braintree answered,
  // as both call fields + the interaction pair, never a transaction (handleBraintreeFailure → recordResponse).
  const expectFailureRecorded = (messageName: string, request: object, response: object) => {
    expect(rawActionCalls()).toHaveLength(1);
    expect(setCustomFieldWrites()).toEqual([
      {
        [`${messageName}ProcessorRequest`]: JSON.stringify(request),
        [`${messageName}Response`]: JSON.stringify(response),
      },
    ]);
    expect(rawActions('addInterfaceInteraction')).toHaveLength(2);
    expect(addedTransactions()).toEqual([]);
  };
  // a failed Braintree call as common-connect throws it: Braintree's own response kept on the error
  const braintreeDecline = { success: false, message: 'Declined', errors: {} };
  const braintreeDeclineError = () =>
    CommonConnect.withBraintreeResponse(new CommonConnect.CustomError(500, 'Declined'), braintreeDecline);
  // actions of all raw calls, or of the given ones
  const rawActions = (action: string, calls = rawActionCalls()) => calls.flat().filter((a) => a.action === action);
  const addedTransactions = (calls = rawActionCalls()) => rawActions('addTransaction', calls).map((a) => a.transaction);
  const amountOf = (centAmount: number) => ({ ...mockGetPaymentResult.amountPlanned, centAmount });
  const cancelOf = (interactionId: string) =>
    transaction({ id: `cancel-${interactionId}`, type: 'CancelAuthorization', interactionId });
  const cancelledPlaceholder = cancelOf(buildPlaceholderInteractionId(mockGetPaymentResult.id));
  // every write after createPayment: setCustomField per field, in the raw CT call
  const setCustomFieldWrites = () =>
    rawActionCalls()
      .map((actions) =>
        Object.fromEntries(actions.filter((a) => a.action === 'setCustomField').map((a) => [a.name, a.value])),
      )
      .filter((fields) => Object.keys(fields).length > 0);
  // The request recorded as interface interaction, i.e. what was sent to Braintree
  const recordedRequest = (messageName: string) => {
    const interaction = rawActions('addInterfaceInteraction').find(
      (a) => (a.fields as { type?: string }).type === `${messageName}ProcessorRequest`,
    );
    return JSON.parse((interaction?.fields as { data: string }).data);
  };
  // a commercetools version conflict on the first write; the retry re-fetches
  const firstWriteConflicts = () =>
    rawPostExecute.mockRejectedValueOnce(Object.assign(new Error('version conflict'), { statusCode: 409 }));
  // runs an operation whose first CT write is retried, skipping retryCTSync's real backoff
  const afterRetryBackoff = async <T>(run: () => Promise<T>): Promise<T> => {
    jest.useFakeTimers();
    try {
      const result = run();
      await jest.advanceTimersByTimeAsync(1000);
      return await result;
    } finally {
      jest.useRealTimers();
    }
  };

  // test('getConfig', async () => { //todo - implement proper tests
  //   // Setup mock config for a system using `clientKey`
  //   setupMockConfig({ clientId: '', mockEnvironment: 'test' });
  //
  //   const result: ConfigResponse = await paymentService.config();
  //
  //   // Assertions can remain the same or be adapted based on the abstracted access
  //   expect(result?.clientKey).toStrictEqual('');
  //   expect(result?.environment).toStrictEqual('test');
  // });

  // Helper: mock the chained CT direct-API call used in updateCartShipping
  const mockCtClientCarts = (updatedCart: Cart) => {
    const execute = jest.fn().mockResolvedValue({ body: updatedCart } as never);
    const post = jest.fn().mockReturnValue({ execute });
    const withId = jest.fn().mockReturnValue({ post });
    return jest.fn().mockReturnValue({ withId });
  };

  describe('updateCartShipping', () => {
    const braintreePaymentService = new BraintreePaymentService(opts);

    // paymentSDK.ctAPI.client is a non-configurable getter in the SDK; save/restore manually
    // so repeated tests can each install a fresh mock without jest.spyOn getter conflicts.
    let savedClient: unknown;
    beforeEach(() => {
      savedClient = paymentSDK.ctAPI.client;
    });
    afterEach(() => {
      (paymentSDK.ctAPI as any).client = savedClient;
    });

    type PaymentPostArgs = { body: { version: number; actions: { action: string; amount: CentPrecisionMoney }[] } };
    const paymentPost = jest.fn((args: PaymentPostArgs) => ({ execute: async (): Promise<unknown> => args }));
    const mockClient = (cart: Cart) => {
      // set per test: the top-level beforeEach resets every mock's implementation
      // the payment write (changeAmountPlanned) answers with the payment it was sent the amount for
      paymentPost.mockImplementation((args) => ({
        execute: async () => ({ body: { ...shippingPayment, amountPlanned: args.body.actions[0].amount } }),
      }));
      (paymentSDK.ctAPI as any).client = {
        carts: mockCtClientCarts(cart),
        payments: jest.fn().mockReturnValue({ withId: jest.fn().mockReturnValue({ post: paymentPost }) }),
      };
    };

    const usd = (centAmount: number): CentPrecisionMoney => ({
      type: 'centPrecision',
      currencyCode: 'USD',
      centAmount,
      fractionDigits: 2,
    });

    // the Express payment, created for the cart before the shipping change (amountPlanned $180.00)
    const shippingPayment = {
      ...mockGetPaymentResultWithoutTransactions,
      id: 'express-payment',
      amountPlanned: usd(18000),
    };
    const runUpdateCartShipping = (cart: Cart, paymentCentAmount = 20000) => {
      const cartWithPayment: Cart = {
        ...cart,
        paymentInfo: { payments: [{ typeId: 'payment', id: shippingPayment.id }] },
      };
      jest.spyOn(FastifyContext, 'getCartIdFromContext').mockReturnValue(cart.id);
      jest.spyOn(paymentSDK.ctCartService, 'getCart').mockResolvedValue(cartWithPayment);
      jest.spyOn(paymentSDK.ctPaymentService, 'getPayment').mockResolvedValue(shippingPayment as never);
      jest.spyOn(paymentSDK.ctCartService, 'getPaymentAmount').mockResolvedValue(usd(paymentCentAmount));
      mockClient(cartWithPayment);
      return braintreePaymentService.updateCartShipping({
        ctPaymentId: shippingPayment.id,
        newShippingMethodId: 'method-1',
      });
    };

    // taxTotal is always 0.00 (tax is embedded in the gross line items); itemTotal = total - shipping + discount,
    // and each cart's line items match it, so the breakdown is always sent
    test.each([
      {
        description: 'standard cart (platform tax)',
        cart: mockCartForShippingUpdate,
        shipping: '20.00',
        discount: '0.00',
        itemTotal: '180.00',
      },
      {
        description: 'external tax cart',
        cart: mockCartWithExternalTax,
        shipping: '10.00',
        discount: '5.00',
        itemTotal: '195.00',
      },
      {
        description: 'gross shipping and discount when commercetools provides them',
        cart: (): Cart => {
          const baseCart = mockCartWithExternalTax();
          return {
            ...baseCart,
            lineItems: [lineItemWithTotal(19400)],
            shippingInfo: {
              ...baseCart.shippingInfo!,
              taxedPrice: { totalNet: usd(1000), totalGross: usd(1200), totalTax: usd(200), taxPortions: [] },
            },
            discountOnTotalPrice: { ...baseCart.discountOnTotalPrice!, discountedGrossAmount: usd(600) },
          };
        },
        shipping: '12.00',
        discount: '6.00',
        itemTotal: '194.00',
      },
      {
        description: 'discounted shipping without taxedPrice, discounted to 0',
        cart: (): Cart => {
          const baseCart = mockCartForShippingUpdate();
          return {
            ...baseCart,
            lineItems: [lineItemWithTotal(20000)],
            shippingInfo: {
              ...baseCart.shippingInfo!,
              price: usd(500),
              discountedPrice: { value: usd(0), includedDiscounts: [] },
            },
          };
        },
        shipping: '0.00',
        discount: '0.00',
        itemTotal: '200.00',
      },
      {
        description: 'cart without shippingInfo',
        cart: (): Cart => ({
          ...mockCartForShippingUpdate(),
          lineItems: [lineItemWithTotal(20000)],
          shippingInfo: undefined,
        }),
        shipping: '0.00',
        discount: '0.00',
        itemTotal: '200.00',
      },
    ])('$description: shipping $shipping, discount $discount, itemTotal $itemTotal', async (row) => {
      const result = await runUpdateCartShipping(row.cart());

      expect(result.braintreeAmount).toBe('200.00');
      expect(result.shippingAmount).toBe(row.shipping);
      expect(result.braintreeBreakdown?.amountBreakdown).toEqual({
        itemTotal: row.itemTotal,
        taxTotal: '0.00',
        shipping: row.shipping,
        discount: row.discount,
        handling: '0.00',
        insurance: '0.00',
        shippingDiscount: '0.00',
      });
    });

    test('breakdown line items are the updated cart line items, without a DISCOUNT credit item', async () => {
      const result = await runUpdateCartShipping(mockCartWithExternalTax());

      // the discount is part of amountBreakdown.discount, so no credit item is sent along
      expect(result.braintreeBreakdown?.lineItems).toEqual([
        expect.objectContaining({ kind: 'debit', totalAmount: '195.00', productCode: 'product-id-1' }),
      ]);
    });

    test('line items not matching itemTotal: breakdown is omitted and a warning names both amounts', async () => {
      const warn = jest.spyOn(log, 'warn').mockImplementation(() => log);
      const cart: Cart = { ...mockCartForShippingUpdate(), lineItems: [lineItemWithTotal(18001)] };

      const result = await runUpdateCartShipping(cart);

      expect(result.braintreeBreakdown).toBeUndefined();
      expect(result.braintreeAmount).toBe('200.00');
      expect(result.shippingAmount).toBe('20.00');
      expect(warn).toHaveBeenCalledWith(expect.stringMatching(/\(180\.01\).*\(180\.00\).*cart-shipping-update/));
    });

    // transactionSale charges amountPlanned and compares the cart with it
    test('writes the new amount to amountPlanned before returning it', async () => {
      const result = await runUpdateCartShipping(mockCartForShippingUpdate());

      expect(paymentPost).toHaveBeenCalledWith({
        body: { version: shippingPayment.version, actions: [{ action: 'changeAmountPlanned', amount: usd(20000) }] },
      });
      expect(result.braintreeAmount).toBe('200.00');
    });

    test('amount unchanged: no payment write', async () => {
      const result = await runUpdateCartShipping(mockCartForShippingUpdate(), 18000);

      expect(paymentPost).not.toHaveBeenCalled();
      expect(result.braintreeAmount).toBe('180.00');
    });

    test('payment not on the cart: fails before the cart is updated', async () => {
      const cart = mockCartForShippingUpdate();
      jest.spyOn(FastifyContext, 'getCartIdFromContext').mockReturnValue(cart.id);
      jest.spyOn(paymentSDK.ctCartService, 'getCart').mockResolvedValue({ ...cart, paymentInfo: undefined });
      jest.spyOn(paymentSDK.ctPaymentService, 'getPayment').mockResolvedValue(shippingPayment as never);
      mockClient(cart);
      jest.spyOn(log, 'error').mockImplementation(() => log);

      await expect(
        braintreePaymentService.updateCartShipping({
          ctPaymentId: shippingPayment.id,
          newShippingMethodId: 'method-1',
        }),
      ).rejects.toThrow(`payment ${shippingPayment.id} doesn't belong to cart ${cart.id}`);
      expect((paymentSDK.ctAPI.client as unknown as { carts: jest.Mock }).carts).not.toHaveBeenCalled();
    });

    test('amountPlanned write fails: the shipping change fails', async () => {
      jest.spyOn(log, 'error').mockImplementation(() => log);
      jest.spyOn(log, 'warn').mockImplementation(() => log);
      const run = runUpdateCartShipping(mockCartForShippingUpdate());
      // after mockClient: a 403 ends retryCTSync at once
      paymentPost.mockImplementation(() => ({
        execute: async () => {
          throw { statusCode: 403 };
        },
      }));

      await expect(run).rejects.toThrow(`could not update amountPlanned of payment ${shippingPayment.id}`);
    });
  });

  describe('getSupportedPaymentComponents', () => {
    // Values are commercetools icon keys (see utils/paymentMethodIcon.utils.ts), not our own
    // PaymentMethodType values — ACH/Venmo/mybank have no commercetools equivalent so they're
    // unchanged; bancontact/p24 differ from our own naming (bancontactcard/przelewy24).
    const expectedLocalTypes = ['bancontactcard', 'blik', 'eps', 'ideal', 'mybank', 'przelewy24'];
    // ACH is always included: this discovery endpoint is JWT-authenticated (no cart/customer in
    // context), so it can't gate on login state — merchants restrict ACH to logged-in customers
    // via a `customerId != null` payment integration predicate in the merchant center instead.
    const expectedBaseTypes = ['ACH', 'applepay', 'card', 'googlepay', 'paypal', 'Venmo'];
    const expectedExpressTypes = ['paypal']; // PayPalVault and CreditCardVault are PURE_VAULT_DISABLED

    test('includes ACH unconditionally, with no cart/customer context available', async () => {
      const result: ConfigResponse = await paymentService.getSupportedPaymentComponents();
      const components = result?.components;
      expect((components as { type: string }[])?.map(({ type }) => type)).toEqual(expectedBaseTypes);
      expect(result?.dropins).toHaveLength(0);
      expect((result?.express as { type: string }[]).map(({ type }) => type)).toEqual(expectedExpressTypes);
    });

    test('without merchant account — returns base components only', async () => {
      const result: ConfigResponse = await paymentService.getSupportedPaymentComponents();
      const components = result?.components;
      expect((components as { type: string }[])?.map(({ type }) => type)).toEqual(expectedBaseTypes);
      expect(result?.dropins).toHaveLength(0);
      expect((result?.express as { type: string }[]).map(({ type }) => type)).toEqual(expectedExpressTypes);
    });

    test('with merchant account — returns base + local payment components', async () => {
      jest
        .spyOn(Config, 'getConfig')
        .mockReturnValueOnce({ ...Config.getConfig(), merchantAccountId: 'test-merchant-account' });
      const result: ConfigResponse = await paymentService.getSupportedPaymentComponents();
      const components = result?.components;
      expect((components as { type: string }[])?.map(({ type }) => type)).toEqual([
        ...expectedBaseTypes,
        ...expectedLocalTypes,
      ]);
      expect(result?.dropins).toHaveLength(0);
      expect((result?.express as { type: string }[]).map(({ type }) => type)).toEqual(expectedExpressTypes);
    });
  });

  const ctCustomerWith = (braintreeCustomerId?: string) =>
    ({ id: 'ct-customer-1', custom: { fields: { braintreeCustomerId } } }) as unknown as Customer;

  describe('getStoredPaymentMethods', () => {
    const braintreePaymentService = new BraintreePaymentService(opts);
    const storedCustomer = ctCustomerWith('bt-customer-1');

    test('only returns CreditCard entries, even when Braintree also has PayPal/ACH accounts vaulted', async () => {
      const cart = { ...mockCartForShippingUpdate(), customerId: 'ct-customer-123' };
      jest.spyOn(FastifyContext, 'getCartIdFromContext').mockReturnValue(cart.id);
      jest.spyOn(paymentSDK.ctCartService, 'getCart').mockResolvedValue(cart);
      const getCtCustomer = jest
        .spyOn(BraintreeCustomerService.prototype, 'getCtCustomer')
        .mockResolvedValue(storedCustomer);
      jest.spyOn(paymentSDK.ctPaymentMethodService, 'find').mockResolvedValue({ results: [] } as never);
      (CommonConnect.getBraintreeGateway as jest.Mock).mockResolvedValue({
        customer: {
          find: jest.fn().mockResolvedValue({
            creditCards: [
              {
                token: 'cc-1',
                default: true,
                createdAt: '2024-01-01',
                last4: '1234',
                cardType: 'Visa',
                expirationMonth: '01',
                expirationYear: '2030',
              },
            ],
            paypalAccounts: [{ token: 'pp-1', default: false, createdAt: '2024-01-01', email: 'buyer@example.com' }],
            usBankAccounts: [
              { token: 'ba-1', default: false, createdAt: '2024-01-01', last4: '5678', accountType: 'checking' },
            ],
          } as never),
        },
      } as never);

      const recordSpy = jest
        .spyOn(BraintreeCustomerService.prototype, 'recordCustomerCall')
        .mockImplementation(() => undefined);

      const result = await braintreePaymentService.getStoredPaymentMethods();

      expect(result.storedPaymentMethods).toHaveLength(1);
      expect(result.storedPaymentMethods[0]).toMatchObject({ type: 'card', token: 'cc-1' });
      expect(recordSpy).toHaveBeenCalledWith(
        'ct-customer-123',
        'find',
        { customerId: 'bt-customer-1' },
        expect.objectContaining({ creditCards: expect.any(Array) }),
        // the customer just read, so the record needs no read of its own
        storedCustomer,
      );
      expect(getCtCustomer).toHaveBeenCalledTimes(1);
    });

    test("Braintree lookup fails: empty list, Braintree's answer recorded on the customer", async () => {
      const cart = { ...mockCartForShippingUpdate(), customerId: 'ct-customer-123' };
      jest.spyOn(FastifyContext, 'getCartIdFromContext').mockReturnValue(cart.id);
      jest.spyOn(paymentSDK.ctCartService, 'getCart').mockResolvedValue(cart);
      jest.spyOn(BraintreeCustomerService.prototype, 'getCtCustomer').mockResolvedValue(storedCustomer);
      const notFound = Object.assign(new Error('customer not found'), { name: 'notFoundError' });
      (CommonConnect.getBraintreeGateway as jest.Mock).mockResolvedValue({
        customer: { find: jest.fn().mockRejectedValue(notFound as never) },
      } as never);
      const recordSpy = jest
        .spyOn(BraintreeCustomerService.prototype, 'recordCustomerCall')
        .mockImplementation(() => undefined);

      const result = await braintreePaymentService.getStoredPaymentMethods();

      expect(result.storedPaymentMethods).toEqual([]);
      expect(recordSpy).toHaveBeenCalledWith(
        'ct-customer-123',
        'find',
        { customerId: 'bt-customer-1' },
        { success: false, name: 'notFoundError', message: 'customer not found' },
        storedCustomer,
      );
    });
  });

  // The cart a non-Express payment was created for: amount and line items match mockGetPaymentResult (1200.00 GBP), as
  // transactionSale compares them; the enabler echoes createPayment's line items, built by the same buildCartLineItems
  const saleCart = (...lineItemCentAmounts: number[]): Cart => ({
    ...mockGetCartResult(),
    lineItems: (lineItemCentAmounts.length ? lineItemCentAmounts : [120000]).map(lineItemWithTotal),
    totalPrice: { ...mockGetPaymentResult.amountPlanned },
    taxedPrice: undefined,
    shippingInfo: undefined,
    discountOnTotalPrice: undefined,
    paymentInfo: undefined,
  });
  const saleDetails = { braintreeLineItems: buildCartLineItems(saleCart(), false) };
  const mockCart = (cart: Cart = saleCart()) => jest.spyOn(paymentSDK.ctCartService, 'getCart').mockResolvedValue(cart);

  describe('transactionSale', () => {
    const braintreePaymentService = new BraintreePaymentService(opts);

    beforeEach(() => {
      jest.spyOn(FastifyContext, 'getCartIdFromContext').mockReturnValue('cart-id');
      (CommonConnect.transactionSale as jest.Mock).mockResolvedValue(mockBraintreeTransaction as never);
      jest.spyOn(paymentSDK.ctPaymentService, 'getPayment').mockResolvedValue(mockGetPaymentResult as never);
      mockCart();
    });

    const baseRequest = { ctPaymentId: mockGetPaymentResult.id, braintreePaymentDetails: saleDetails };

    const lineItem = (totalAmount: string, name: string) => ({
      name,
      kind: LineItemKind.Debit,
      quantity: '1',
      unitAmount: totalAmount,
      totalAmount,
      productCode: 'PRODUCT',
      unitTaxAmount: '0.00',
      description: '',
      url: '',
    });

    test('CreditCard: forwards nonce and deviceData', async () => {
      const result = await braintreePaymentService.transactionSale({
        ...baseRequest,
        paymentMethodType: PaymentMethodType.CREDIT_CARD,
        paymentMethodNonce: 'fake-valid-nonce',
        deviceData: 'device-fingerprint-data',
      });
      expect(result.success).toBe(true);
      expect(CommonConnect.transactionSale).toHaveBeenCalledWith(
        expect.objectContaining({ paymentMethodNonce: 'fake-valid-nonce', deviceData: 'device-fingerprint-data' }),
      );
    });

    test('CreditCard: forwards braintreeShipping', async () => {
      const shipping = {
        firstName: 'Jane',
        lastName: 'Doe',
        streetAddress: '1 Main St',
        locality: 'Berlin',
        region: 'BE',
        postalCode: '10115',
        countryCodeAlpha2: 'DE',
      };
      await braintreePaymentService.transactionSale({
        ...baseRequest,
        paymentMethodType: PaymentMethodType.CREDIT_CARD,
        paymentMethodNonce: 'fake-valid-nonce',
        braintreePaymentDetails: { ...saleDetails, braintreeShipping: shipping },
      });
      expect(CommonConnect.transactionSale).toHaveBeenCalledWith(expect.objectContaining({ shipping }));
    });

    test('CreditCardStored: forwards paymentToken, no nonce', async () => {
      await braintreePaymentService.transactionSale({
        ...baseRequest,
        paymentMethodType: PaymentMethodType.CREDIT_CARD_STORED,
        paymentToken: 'stored-card-token',
      });
      expect(CommonConnect.transactionSale).toHaveBeenCalledWith(
        expect.objectContaining({ paymentMethodToken: 'stored-card-token', paymentMethodNonce: undefined }),
      );
    });

    test('PayPal: forwards nonce', async () => {
      await braintreePaymentService.transactionSale({
        ...baseRequest,
        paymentMethodType: PaymentMethodType.PAYPAL,
        paymentMethodNonce: 'fake-paypal-billing-agreement-nonce',
      });
      expect(CommonConnect.transactionSale).toHaveBeenCalledWith(
        expect.objectContaining({ paymentMethodNonce: 'fake-paypal-billing-agreement-nonce' }),
      );
    });

    // PAYPAL_STORED_DISABLED: no test for PayPalStored — see StoredPaymentMethodType in dtos/braintree-payment.dto.ts

    test('GooglePay: forwards nonce', async () => {
      await braintreePaymentService.transactionSale({
        ...baseRequest,
        paymentMethodType: PaymentMethodType.GOOGLE_PAY,
        paymentMethodNonce: 'fake-android-pay-nonce',
      });
      expect(CommonConnect.transactionSale).toHaveBeenCalledWith(
        expect.objectContaining({ paymentMethodNonce: 'fake-android-pay-nonce' }),
      );
    });

    test('ApplePay: forwards nonce', async () => {
      await braintreePaymentService.transactionSale({
        ...baseRequest,
        paymentMethodType: PaymentMethodType.APPLE_PAY,
        paymentMethodNonce: 'fake-apple-pay-visa-nonce',
      });
      expect(CommonConnect.transactionSale).toHaveBeenCalledWith(
        expect.objectContaining({ paymentMethodNonce: 'fake-apple-pay-visa-nonce' }),
      );
    });

    test('Venmo: forwards nonce', async () => {
      const result = await braintreePaymentService.transactionSale({
        ...baseRequest,
        paymentMethodType: PaymentMethodType.VENMO,
        paymentMethodNonce: 'fake-venmo-account-nonce',
        venmoUsername: 'venmo-user',
      });
      expect(result.success).toBe(true);
      expect(CommonConnect.transactionSale).toHaveBeenCalledWith(
        expect.objectContaining({ paymentMethodNonce: 'fake-venmo-account-nonce' }),
      );
    });

    test('ACH: forwards paymentToken', async () => {
      await braintreePaymentService.transactionSale({
        ...baseRequest,
        paymentMethodType: PaymentMethodType.ACH,
        paymentToken: 'ach-bank-token',
      });
      expect(CommonConnect.transactionSale).toHaveBeenCalledWith(
        expect.objectContaining({ paymentMethodToken: 'ach-bank-token' }),
      );
    });

    const localPaymentSale = () =>
      braintreePaymentService.transactionSale({
        ...baseRequest,
        paymentMethodType: LocalPaymentMethodType.IDEAL as unknown as PaymentMethodType,
        paymentMethodNonce: 'fake-local-payment-nonce',
        localPaymentId: 'local-payment-id-123',
      });
    const withMerchantAccount = (merchantAccountId: string | undefined) => {
      const config = Config.getConfig();
      jest.spyOn(Config, 'getConfig').mockReturnValue({ ...config, merchantAccountId });
    };

    test('Local payment (ideal): sets submitForSettlement', async () => {
      withMerchantAccount('merchant-account');

      await localPaymentSale();
      expect(CommonConnect.transactionSale).toHaveBeenCalledWith(
        expect.objectContaining({
          paymentMethodNonce: 'fake-local-payment-nonce',
          options: expect.objectContaining({ submitForSettlement: true }),
        }),
      );
    });

    // a fallback: without a merchant account local methods are neither listed nor available in the enabler
    test('Local payment without a merchant account: refused before Braintree, logged for the merchant', async () => {
      withMerchantAccount(undefined);
      const errorSpy = jest.spyOn(log, 'error').mockImplementation(() => log);

      await expect(localPaymentSale()).rejects.toThrow(
        `transactionSale refused for payment ${mockGetPaymentResult.id}`,
      );

      expect(CommonConnect.transactionSale).not.toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('requires BRAINTREE_MERCHANT_ACCOUNT'));
    });

    test('storeInVaultOnSuccess: sets vault options', async () => {
      await braintreePaymentService.transactionSale({
        ...baseRequest,
        paymentMethodType: PaymentMethodType.CREDIT_CARD,
        paymentMethodNonce: 'fake-valid-nonce',
        storeInVaultOnSuccess: true,
        storeShipping: true,
      });
      expect(CommonConnect.transactionSale).toHaveBeenCalledWith(
        expect.objectContaining({
          options: expect.objectContaining({
            storeInVaultOnSuccess: true,
            storeShippingAddressInVault: true,
          }),
        }),
      );
    });

    // The new card joins the Braintree customer linked on the CT customer; the request names no customer
    describe('vaulting sale: the Braintree customer', () => {
      let getCtCustomer: jest.SpiedFunction<BraintreeCustomerService['getCtCustomer']>;
      let lookup: jest.SpiedFunction<BraintreeCustomerService['findExistingBraintreeCustomerId']>;
      let link: jest.SpiedFunction<BraintreeCustomerService['linkBraintreeCustomerId']>;
      const vaultSale = () =>
        braintreePaymentService.transactionSale({
          ...baseRequest,
          paymentMethodType: PaymentMethodType.CREDIT_CARD,
          paymentMethodNonce: 'fake-valid-nonce',
          storeInVaultOnSuccess: true,
        });
      const sentToBraintree = () => (CommonConnect.transactionSale as jest.Mock).mock.calls[0][0];

      beforeEach(() => {
        jest
          .spyOn(paymentSDK.ctPaymentService, 'getPayment')
          .mockResolvedValue({
            ...mockGetPaymentResult,
            customer: { typeId: 'customer', id: 'ct-customer-1' },
          } as never);
        jest.spyOn(paymentSDK.ctPaymentMethodService, 'save').mockResolvedValue({} as never);
        getCtCustomer = jest.spyOn(BraintreeCustomerService.prototype, 'getCtCustomer');
        lookup = jest
          .spyOn(BraintreeCustomerService.prototype, 'findExistingBraintreeCustomerId')
          .mockResolvedValue({ braintreeCustomerId: undefined, recordFields: { findResponse: 'miss' } });
        link = jest.spyOn(BraintreeCustomerService.prototype, 'linkBraintreeCustomerId').mockResolvedValue();
        jest.spyOn(BraintreeCustomerService.prototype, 'recordCustomerFields').mockImplementation(() => undefined);
      });

      test('linked customer: attached by its stored id, no lookup; the read customer serves the link', async () => {
        const customer = ctCustomerWith('bt-customer-1');
        getCtCustomer.mockResolvedValue(customer);

        await vaultSale();

        expect(sentToBraintree()).toEqual(expect.objectContaining({ customerId: 'bt-customer-1' }));
        expect(sentToBraintree()).not.toHaveProperty('customer');
        expect(lookup).not.toHaveBeenCalled();
        expect(link).toHaveBeenCalledWith('ct-customer-1', 'bt-customer-1', undefined, customer);
      });

      // the field wiped on redeploy: the Braintree customer with the CT customer's id is reused
      test('no stored id, a Braintree customer found: attached to it, the lookup recorded with the link', async () => {
        const customer = ctCustomerWith();
        getCtCustomer.mockResolvedValue(customer);
        lookup.mockResolvedValue({ braintreeCustomerId: 'bt-customer-1', recordFields: { findResponse: 'found' } });

        await vaultSale();

        expect(sentToBraintree()).toEqual(expect.objectContaining({ customerId: 'bt-customer-1' }));
        expect(link).toHaveBeenCalledWith('ct-customer-1', 'bt-customer-1', { findResponse: 'found' }, customer);
      });

      test('no stored id, none found: the Braintree customer created with the CT customer id', async () => {
        getCtCustomer.mockResolvedValue(ctCustomerWith());

        await vaultSale();

        expect(sentToBraintree()).toEqual(expect.objectContaining({ customer: { id: 'ct-customer-1' } }));
        expect(sentToBraintree()).not.toHaveProperty('customerId');
      });

      // unlike the ACH vault: the sale goes ahead
      test('CT customer unreadable: falls back to the lookup, charged', async () => {
        getCtCustomer.mockResolvedValue(undefined);

        await expect(vaultSale()).resolves.toEqual(expect.objectContaining({ success: true }));

        expect(lookup).toHaveBeenCalledWith('ct-customer-1');
      });

      // Braintree's contract (braintree-extension live test "transaction with customerId keeps that customer")
      test('Braintree answers with another customer than the sent one: logged for a report to Braintree', async () => {
        getCtCustomer.mockResolvedValue(ctCustomerWith('bt-customer-1'));
        (CommonConnect.transactionSale as jest.Mock).mockResolvedValue({
          ...mockBraintreeTransaction,
          customer: { id: 'bt-other' },
        } as never);
        const errorSpy = jest.spyOn(log, 'error').mockImplementation(() => log);

        await vaultSale();

        expect(errorSpy).toHaveBeenCalledWith(
          expect.stringContaining(
            `on payment ${mockGetPaymentResult.id}, commercetools customer ct-customer-1: bt-other`,
          ),
        );
        expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('report this to Braintree immediately'));
      });
    });

    test('discountAmount is derived as the gap between lineItems total and the charged amount', async () => {
      // mockGetPaymentResult.amountPlanned is 1200.00 GBP; lineItems sum to 1300.00 — the 100.00
      // gap is the cart discount, which never arrives as its own line item (it's filtered out above).
      const cart = saleCart(70000, 60000);
      mockCart(cart);
      await braintreePaymentService.transactionSale({
        ...baseRequest,
        paymentMethodType: PaymentMethodType.CREDIT_CARD,
        paymentMethodNonce: 'fake-valid-nonce',
        braintreePaymentDetails: { braintreeLineItems: buildCartLineItems(cart, false) },
      });
      expect(CommonConnect.transactionSale).toHaveBeenCalledWith(expect.objectContaining({ discountAmount: '100.00' }));
    });

    test('discountAmount is 0.00 when lineItems already match the charged amount', async () => {
      await braintreePaymentService.transactionSale({
        ...baseRequest,
        paymentMethodType: PaymentMethodType.CREDIT_CARD,
        paymentMethodNonce: 'fake-valid-nonce',
      });
      expect(CommonConnect.transactionSale).toHaveBeenCalledWith(expect.objectContaining({ discountAmount: '0.00' }));
    });

    // Express after a shipping change: line items and shipping come from the refetched cart, never from the enabler
    const usd = (centAmount: number): CentPrecisionMoney => ({
      type: 'centPrecision',
      currencyCode: 'USD',
      centAmount,
      fractionDigits: 2,
    });
    const expressCart = (lineItemCentAmount: number, shippingCentAmount: number): Cart => {
      const cart = mockGetCartResult(); // totalPrice: $1500.00 (see mock-cart-data.ts)
      return {
        ...cart,
        lineItems: [lineItemWithTotal(lineItemCentAmount)],
        shippingInfo: { ...cart.shippingInfo!, price: usd(shippingCentAmount) },
      };
    };
    // the payment's amountPlanned is the cart gross, written by createPayment or the last updateCartShipping
    const mockExpressSale = (cart: Cart, amountPlannedCents: number) => {
      jest
        .spyOn(paymentSDK.ctPaymentService, 'getPayment')
        .mockResolvedValue({ ...mockGetPaymentResult, amountPlanned: usd(amountPlannedCents) } as never);
      jest.spyOn(FastifyContext, 'getCartIdFromContext').mockReturnValue(cart.id);
      return jest.spyOn(paymentSDK.ctCartService, 'getCart').mockResolvedValue(cart);
    };
    // createPayment's copy: the same product and quantity, the price before the shipping change
    const staleEnablerLineItem = {
      ...buildCartLineItems(expressCart(100, 0), true)[0],
      name: 'stale createPayment copy',
    };
    const expressShippingChangedRequest = {
      ...baseRequest,
      paymentMethodType: PaymentMethodType.PAYPAL,
      paymentMethodNonce: 'fake-paypal-billing-agreement-nonce',
      braintreePaymentDetails: {
        braintreeLineItems: [staleEnablerLineItem],
        expressShippingChanged: true,
      },
    };

    test.each([
      {
        // lineItems (1550.00) + shippingAmount (20.00) - amount (1500.00) = 70.00, sent to PayPal as a DISCOUNT line item
        description: 'balances the discount residual against the cart line items and shipping',
        cart: () => expressCart(155000, 2000),
        amountPlanned: 150000,
        expected: {
          amount: '1500.00',
          discountAmount: '0.00',
          shippingAmount: '20.00',
          lineItems: [
            expect.objectContaining({ productCode: 'product-id-1', totalAmount: '1550.00' }),
            expect.objectContaining({ productCode: 'DISCOUNT', kind: 'credit', totalAmount: '70.00' }),
          ],
        },
      },
      {
        description: 'charges the cart gross when tax is not included in price',
        cart: (): Cart => ({
          ...expressCart(178000, 2000), // totalPrice: $1500.00 (net)
          taxedPrice: { totalNet: usd(150000), totalGross: usd(180000), totalTax: usd(30000), taxPortions: [] },
        }),
        amountPlanned: 180000,
        expected: {
          amount: '1800.00',
          discountAmount: '0.00',
          shippingAmount: '20.00',
          lineItems: [expect.objectContaining({ totalAmount: '1780.00' })],
        },
      },
      {
        description: 'still takes the line items from the cart for a 0 cost shipping option',
        cart: () => expressCart(150000, 0),
        amountPlanned: 150000,
        expected: {
          amount: '1500.00',
          shippingAmount: '0.00',
          lineItems: [expect.objectContaining({ totalAmount: '1500.00' })],
        },
      },
    ])('express shipping change $description', async ({ cart, amountPlanned, expected }) => {
      mockExpressSale(cart(), amountPlanned);

      await braintreePaymentService.transactionSale(expressShippingChangedRequest);
      expect(CommonConnect.transactionSale).toHaveBeenCalledWith(expect.objectContaining(expected));
    });

    test('Express without a shipping change: the enabler line items are sent, no shippingAmount', async () => {
      const cart = expressCart(150000, 0);
      mockExpressSale(cart, 150000);

      await braintreePaymentService.transactionSale({
        ...expressShippingChangedRequest,
        braintreePaymentDetails: {
          braintreeLineItems: buildCartLineItems(cart, true).map((item) => ({ ...item, name: 'Item A' })),
        },
      });
      const request = (CommonConnect.transactionSale as jest.Mock).mock.calls[0][0] as { lineItems: unknown[] };
      expect(request.lineItems).toEqual([expect.objectContaining({ name: 'Item A', totalAmount: '1500.00' })]);
      expect(request).not.toHaveProperty('shippingAmount');
    });
  });

  // test('getStatus', async () => {
  //   const mockHealthCheckFunction: () => Promise<HealthCheckResult> = async () => {
  //     const result: HealthCheckResult = {
  //       name: 'CoCo Permissions',
  //       status: 'DOWN',
  //       details: {
  //         message: 'CoCo Permissions are not available',
  //       },
  //     };
  //     return result;
  //   };
  //
  //   jest.spyOn(StatusHandler, 'healthCheckCommercetoolsPermissions').mockReturnValue(mockHealthCheckFunction);
  //   const paymentService: AbstractPaymentService = new BraintreePaymentService(opts);
  //   const result: StatusResponse = await paymentService.status();
  //
  //   expect(result?.status).toBeDefined();
  //   expect(result?.checks).toHaveLength(2);
  //   expect(result?.status).toStrictEqual('Partially Available');
  //   expect(result?.checks[0]?.name).toStrictEqual('CoCo Permissions');
  //   expect(result?.checks[0]?.status).toStrictEqual('DOWN');
  //   expect(result?.checks[0]?.details).toStrictEqual({ message: 'CoCo Permissions are not available' });
  //   expect(result?.checks[1]?.name).toStrictEqual('Mock Payment API');
  //   expect(result?.checks[1]?.status).toStrictEqual('UP');
  //   expect(result?.checks[1]?.details).toBeDefined();
  //   expect(result?.checks[1]?.message).toBeDefined();
  // });
  //
  // test('cancelPayment', async () => {
  //   const modifyPaymentOpts: ModifyPayment = {
  //     paymentId: 'dummy-paymentId',
  //     data: {
  //       actions: [
  //         {
  //           action: 'cancelPayment',
  //         },
  //       ],
  //     },
  //   };
  //   jest.spyOn(DefaultPaymentService.prototype, 'getPayment').mockReturnValue(Promise.resolve(mockGetPaymentResult));
  //   jest
  //     .spyOn(DefaultPaymentService.prototype, 'updatePayment')
  //     .mockReturnValue(Promise.resolve(mockUpdatePaymentResult));
  //
  //   const result = await paymentService.modifyPayment(modifyPaymentOpts);
  //   expect(result?.outcome).toStrictEqual('approved');
  // });
  //
  // test('capturePayment', async () => {
  //   const modifyPaymentOpts: ModifyPayment = {
  //     paymentId: 'dummy-paymentId',
  //     data: {
  //       actions: [
  //         {
  //           action: 'capturePayment',
  //           amount: {
  //             centAmount: 150000,
  //             currencyCode: 'USD',
  //           },
  //         },
  //       ],
  //     },
  //   };
  //   jest.spyOn(DefaultPaymentService.prototype, 'getPayment').mockReturnValue(Promise.resolve(mockGetPaymentResult));
  //   jest
  //     .spyOn(DefaultPaymentService.prototype, 'updatePayment')
  //     .mockReturnValue(Promise.resolve(mockUpdatePaymentResult));
  //   jest
  //     .spyOn(DefaultPaymentService.prototype, 'updatePayment')
  //     .mockReturnValue(Promise.resolve(mockUpdatePaymentResult));
  //
  //   const result = await paymentService.modifyPayment(modifyPaymentOpts);
  //   expect(result?.outcome).toStrictEqual('approved');
  // });
  //
  // test('refundPayment', async () => {
  //   const modifyPaymentOpts: ModifyPayment = {
  //     paymentId: 'dummy-paymentId',
  //     data: {
  //       actions: [
  //         {
  //           action: 'refundPayment',
  //           amount: {
  //             centAmount: 150000,
  //             currencyCode: 'USD',
  //           },
  //         },
  //       ],
  //     },
  //   };
  //   jest.spyOn(DefaultPaymentService.prototype, 'getPayment').mockReturnValue(Promise.resolve(mockGetPaymentResult));
  //   jest
  //     .spyOn(DefaultPaymentService.prototype, 'updatePayment')
  //     .mockReturnValue(Promise.resolve(mockUpdatePaymentResult));
  //   jest
  //     .spyOn(DefaultPaymentService.prototype, 'updatePayment')
  //     .mockReturnValue(Promise.resolve(mockUpdatePaymentResult));
  //
  //   const result = await paymentService.modifyPayment(modifyPaymentOpts);
  //   expect(result?.outcome).toStrictEqual('approved');
  // });
  //
  // test('create card payment', async () => {
  //   const createPaymentOpts: CreatePaymentRequest = {
  //     data: {
  //       paymentMethod: {
  //         type: PaymentMethodType.CARD,
  //       },
  //       paymentOutcome: PaymentOutcome.AUTHORIZED,
  //     },
  //   };
  //   jest.spyOn(DefaultCartService.prototype, 'getCart').mockReturnValue(Promise.resolve(mockGetCartResult()));
  //   jest.spyOn(DefaultPaymentService.prototype, 'createPayment').mockReturnValue(Promise.resolve(mockGetPaymentResult));
  //   jest.spyOn(DefaultCartService.prototype, 'addPayment').mockReturnValue(Promise.resolve(mockGetCartResult()));
  //   jest.spyOn(FastifyContext, 'getProcessorUrlFromContext').mockReturnValue('http://127.0.0.1');
  //   jest.spyOn(DefaultPaymentService.prototype, 'updatePayment').mockReturnValue(Promise.resolve(mockGetPaymentResult));
  //
  //   const result = await braintreePaymentService.createPayment(createPaymentOpts);
  //   expect(result?.paymentReference).toStrictEqual('123456');
  // });
  //
  // test('create invoice payment', async () => {
  //   const createPaymentOpts: CreatePaymentRequest = {
  //     data: {
  //       paymentMethod: {
  //         type: PaymentMethodType.INVOICE,
  //       },
  //       paymentOutcome: PaymentOutcome.AUTHORIZED,
  //     },
  //   };
  //   jest.spyOn(DefaultCartService.prototype, 'getCart').mockReturnValue(Promise.resolve(mockGetCartResult()));
  //   jest.spyOn(DefaultPaymentService.prototype, 'createPayment').mockReturnValue(Promise.resolve(mockGetPaymentResult));
  //   jest.spyOn(DefaultCartService.prototype, 'addPayment').mockReturnValue(Promise.resolve(mockGetCartResult()));
  //   jest.spyOn(FastifyContext, 'getProcessorUrlFromContext').mockReturnValue('http://127.0.0.1');
  //   jest.spyOn(DefaultPaymentService.prototype, 'updatePayment').mockReturnValue(Promise.resolve(mockGetPaymentResult));
  //
  //   const result = await braintreePaymentService.createPayment(createPaymentOpts);
  //   expect(result?.paymentReference).toStrictEqual('123456');
  // });
  //
  // test('create purchaseorder payment successfully', async () => {
  //   const createPaymentOpts: CreatePaymentRequest = {
  //     data: {
  //       paymentMethod: {
  //         type: PaymentMethodType.PURCHASE_ORDER,
  //         poNumber: '123456',
  //         invoiceMemo: 'This is a test invoice',
  //       },
  //       paymentOutcome: PaymentOutcome.AUTHORIZED,
  //     },
  //   };
  //   jest.spyOn(DefaultCartService.prototype, 'getCart').mockReturnValue(Promise.resolve(mockGetCartResult()));
  //   jest.spyOn(DefaultPaymentService.prototype, 'createPayment').mockReturnValue(Promise.resolve(mockGetPaymentResult));
  //   jest.spyOn(DefaultCartService.prototype, 'addPayment').mockReturnValue(Promise.resolve(mockGetCartResult()));
  //   jest.spyOn(FastifyContext, 'getProcessorUrlFromContext').mockReturnValue('http://127.0.0.1');
  //   jest.spyOn(DefaultPaymentService.prototype, 'updatePayment').mockReturnValue(Promise.resolve(mockGetPaymentResult));
  //
  //   const result = await braintreePaymentService.createPayment(createPaymentOpts);
  //   expect(result?.paymentReference).toStrictEqual('123456');
  // });
  //
  // test('create purchaseorder payment returns an error when PO number is not received', async () => {
  //   const createPaymentOpts: CreatePaymentRequest = {
  //     data: {
  //       paymentMethod: {
  //         type: PaymentMethodType.PURCHASE_ORDER,
  //       },
  //       paymentOutcome: PaymentOutcome.AUTHORIZED,
  //     },
  //   };
  //   jest.spyOn(DefaultCartService.prototype, 'getCart').mockReturnValue(Promise.resolve(mockGetCartResult()));
  //   jest.spyOn(DefaultPaymentService.prototype, 'createPayment').mockReturnValue(Promise.resolve(mockGetPaymentResult));
  //   jest.spyOn(DefaultCartService.prototype, 'addPayment').mockReturnValue(Promise.resolve(mockGetCartResult()));
  //   jest.spyOn(FastifyContext, 'getProcessorUrlFromContext').mockReturnValue('http://127.0.0.1');
  //
  //   const resultPromise = braintreePaymentService.createPayment(createPaymentOpts);
  //
  //   await expect(resultPromise).rejects.toThrow('A value is required for field poNumber.');
  // });
  //
  // describe('handleTransaction', () => {
  //   test('should create the payment in CoCo and return it with a success state', async () => {
  //     const createPaymentOpts: TransactionDraftDTO = {
  //       cartId: 'dd4b7669-698c-4175-8e4c-bed178abfed3',
  //       paymentInterface: '42251cfc-0660-4ab3-80f6-c32829aa7a8b',
  //       amount: {
  //         centAmount: 1000,
  //         currencyCode: 'EUR',
  //       },
  //     };
  //
  //     jest.spyOn(DefaultCartService.prototype, 'getCart').mockReturnValueOnce(Promise.resolve(mockGetCartResult()));
  //     jest
  //       .spyOn(DefaultPaymentService.prototype, 'createPayment')
  //       .mockReturnValueOnce(Promise.resolve(mockGetPaymentResult));
  //     jest.spyOn(DefaultCartService.prototype, 'addPayment').mockReturnValueOnce(Promise.resolve(mockGetCartResult()));
  //     jest
  //       .spyOn(DefaultPaymentService.prototype, 'updatePayment')
  //       .mockReturnValue(Promise.resolve(mockUpdatePaymentResult));
  //
  //     const resultPromise = braintreePaymentService.handleTransaction(createPaymentOpts);
  //     expect(resultPromise).resolves.toStrictEqual({
  //       transactionStatus: {
  //         errors: [],
  //         state: 'Pending',
  //       },
  //     });
  //   });
  //
  //   test('should create the payment in CoCo and return it with a failed state', async () => {
  //     const createPaymentOpts: TransactionDraftDTO = {
  //       cartId: 'dd4b7669-698c-4175-8e4c-bed178abfed3',
  //       paymentInterface: '42251cfc-0660-4ab3-80f6-c32829aa7a8b',
  //       amount: {
  //         centAmount: 10000,
  //         currencyCode: 'EUR',
  //       },
  //     };
  //
  //     jest.spyOn(DefaultCartService.prototype, 'getCart').mockReturnValueOnce(Promise.resolve(mockGetCartResult()));
  //     jest
  //       .spyOn(DefaultPaymentService.prototype, 'createPayment')
  //       .mockReturnValueOnce(Promise.resolve(mockGetPaymentResult));
  //     jest.spyOn(DefaultCartService.prototype, 'addPayment').mockReturnValueOnce(Promise.resolve(mockGetCartResult()));
  //     jest
  //       .spyOn(DefaultPaymentService.prototype, 'updatePayment')
  //       .mockReturnValue(Promise.resolve(mockUpdatePaymentResult));
  //
  //     const resultPromise = braintreePaymentService.handleTransaction(createPaymentOpts);
  //
  //     expect(resultPromise).resolves.toStrictEqual({
  //       transactionStatus: {
  //         errors: [
  //           {
  //             code: 'PaymentRejected',
  //             message: `Payment '${mockGetPaymentResult.id}' has been rejected.`,
  //           },
  //         ],
  //         state: 'Failed',
  //       },
  //     });
  //   });
  // });
  //
  // describe('reversePayment', () => {
  //   test('it should fail because there are no transactions to revert', async () => {
  //     const modifyPaymentOpts: ModifyPayment = {
  //       paymentId: 'dummy-paymentId',
  //       data: {
  //         actions: [
  //           {
  //             action: 'reversePayment',
  //           },
  //         ],
  //       },
  //     };
  //     jest
  //       .spyOn(DefaultPaymentService.prototype, 'getPayment')
  //       .mockReturnValue(Promise.resolve(mockGetPaymentResultWithoutTransactions));
  //     jest
  //       .spyOn(DefaultPaymentService.prototype, 'updatePayment')
  //       .mockReturnValue(Promise.resolve(mockUpdatePaymentResult));
  //     jest
  //       .spyOn(DefaultPaymentService.prototype, 'updatePayment')
  //       .mockReturnValue(Promise.resolve(mockUpdatePaymentResult));
  //
  //     const result = paymentService.modifyPayment(modifyPaymentOpts);
  //     await expect(result).rejects.toThrow('There is no successful payment transaction to reverse.');
  //   });
  //
  //   test('it should successfully revert transaction', async () => {
  //     const modifyPaymentOpts: ModifyPayment = {
  //       paymentId: 'dummy-paymentId',
  //       data: {
  //         actions: [
  //           {
  //             action: 'reversePayment',
  //           },
  //         ],
  //       },
  //     };
  //     jest.spyOn(DefaultPaymentService.prototype, 'getPayment').mockReturnValue(Promise.resolve(mockGetPaymentResult));
  //     jest
  //       .spyOn(DefaultPaymentService.prototype, 'updatePayment')
  //       .mockReturnValue(Promise.resolve(mockUpdatePaymentResultWithRefundTransaction));
  //
  //     const result = await paymentService.modifyPayment(modifyPaymentOpts);
  //     expect(result?.outcome).toStrictEqual('approved');
  //   });
  // });

  // A non-Express sale is refused when the cart changed after the payment was created (reloadPaymentMethods not called)
  describe('transactionSale cart check', () => {
    const braintreePaymentService = new BraintreePaymentService(opts);
    const gbp = (centAmount: number): CentPrecisionMoney => ({ ...mockGetPaymentResult.amountPlanned, centAmount });

    beforeEach(() => {
      jest.spyOn(FastifyContext, 'getCartIdFromContext').mockReturnValue('cart-id');
      (CommonConnect.transactionSale as jest.Mock).mockResolvedValue(mockBraintreeTransaction as never);
    });

    const mockPayments = (...payments: { id: string }[]) =>
      jest
        .spyOn(paymentSDK.ctPaymentService, 'getPayment')
        .mockImplementation(
          async ({ id }) => [mockGetPaymentResult, ...payments].find((payment) => payment.id === id) as never,
        );
    const sale = (braintreePaymentDetails?: object) =>
      braintreePaymentService.transactionSale({
        ctPaymentId: mockGetPaymentResult.id,
        paymentMethodType: PaymentMethodType.CREDIT_CARD,
        paymentMethodNonce: 'nonce-123',
        braintreePaymentDetails,
      });
    // the buyer gets no detail; returns the merchant log
    const expectRefusedBeforeBraintree = async (promise: Promise<unknown>) => {
      const errorSpy = jest.spyOn(log, 'error').mockImplementation(() => log);
      await expect(promise).rejects.toThrow(`transactionSale refused for payment ${mockGetPaymentResult.id}`);
      expect(CommonConnect.transactionSale).not.toHaveBeenCalled();
      return errorSpy;
    };
    const expectRefused = async (promise: Promise<unknown>, change: string) => {
      const errorSpy = await expectRefusedBeforeBraintree(promise);
      // the merchant gets the hint with the commercetools docs link
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining(`cart ${change} changed after payment creation`));
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('reloadPaymentMethods'));
    };

    // the cart holds this payment and 'other-payment'
    const cartWithOtherPayment = (): Cart => ({
      ...saleCart(),
      paymentInfo: {
        payments: [
          { typeId: 'payment', id: mockGetPaymentResult.id },
          { typeId: 'payment', id: 'other-payment' },
        ],
      },
    });

    beforeEach(() => {
      mockPayments();
      mockCart();
    });

    test('cart unchanged: charged', async () => {
      await sale(saleDetails);

      expect(CommonConnect.transactionSale).toHaveBeenCalled();
    });

    test('cart amount changed: refused before Braintree', async () => {
      mockCart({ ...saleCart(), totalPrice: gbp(130000) });

      await expectRefused(sale(saleDetails), 'amount');
    });

    test('same amount, another product: refused before Braintree', async () => {
      mockCart({ ...saleCart(), lineItems: [{ ...lineItemWithTotal(120000), productId: 'another-product' }] });

      await expectRefused(sale(saleDetails), 'line items');
    });

    // the item is fixed by its product and price; the name is what the buyer saw, sent to Braintree as is
    test('only a line item name changed: charged with the submitted name', async () => {
      await sale({
        braintreeLineItems: saleDetails.braintreeLineItems.map((item) => ({ ...item, name: 'name the buyer saw' })),
      });

      expect(CommonConnect.transactionSale).toHaveBeenCalledWith(
        expect.objectContaining({ lineItems: [expect.objectContaining({ name: 'name the buyer saw' })] }),
      );
    });

    // e.g. a merchant's own call: nothing to compare the line items with, the amount still is
    test('no line items submitted, cart unchanged: charged without line items', async () => {
      await sale();

      expect(CommonConnect.transactionSale).toHaveBeenCalledWith(expect.objectContaining({ lineItems: [] }));
    });

    test('no line items submitted, cart amount changed: refused before Braintree', async () => {
      mockCart({ ...saleCart(), totalPrice: gbp(130000) });

      await expectRefused(sale(), 'amount');
    });

    // the cart (1500.00) holds this payment (1200.00) and another one (300.00)
    test.each([
      { description: 'approved: its amount is not left, charged', transactions: [transaction({})], charged: true },
      { description: 'not approved: refused', transactions: [transaction({ state: 'Failure' })], charged: false },
      {
        description: 'reverted: refused',
        transactions: [transaction({}), transaction({ type: 'Refund', state: 'Success' })],
        charged: false,
      },
    ])('another payment on the cart $description', async ({ transactions, charged }) => {
      const otherPayment = { id: 'other-payment', amountPlanned: gbp(30000), transactions };
      const getPayment = mockPayments(otherPayment);
      mockCart({ ...cartWithOtherPayment(), totalPrice: gbp(150000) });

      if (charged) {
        await sale(saleDetails);
        expect(CommonConnect.transactionSale).toHaveBeenCalled();
      } else await expectRefused(sale(saleDetails), 'amount');
      // the payment itself is read once, by transactionSale
      expect(getPayment.mock.calls.filter(([{ id }]) => id === mockGetPaymentResult.id)).toHaveLength(1);
    });

    // without it the amount left to pay can't be computed: a clear refusal, not a 500
    test('another payment on the cart unreadable: refused before Braintree', async () => {
      jest
        .spyOn(paymentSDK.ctPaymentService, 'getPayment')
        .mockImplementation(async ({ id }) =>
          id === mockGetPaymentResult.id
            ? (mockGetPaymentResult as never)
            : Promise.reject(new Error('CT unavailable')),
        );
      mockCart(cartWithOtherPayment());

      const errorSpy = await expectRefusedBeforeBraintree(sale(saleDetails));
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('could not read payment other-payment of cart'));
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining(`refused payment ${mockGetPaymentResult.id}`));
    });

    // the SDK's getPaymentAmount would count the payment itself as paid
    test("ACH micro-deposit placeholder on the payment: doesn't count as paid, charged", async () => {
      const payment = { ...mockGetPaymentResult, transactions: [achPlaceholder] };
      jest.spyOn(paymentSDK.ctPaymentService, 'getPayment').mockResolvedValue(payment as never);
      mockCart({ ...saleCart(), paymentInfo: { payments: [{ typeId: 'payment', id: payment.id }] } });

      await sale(saleDetails);

      expect(CommonConnect.transactionSale).toHaveBeenCalled();
    });

    // Checkout charges a payment once; the check uses the payment already read
    test.each(['Success', 'Pending'] as const)('payment already charged (Authorization %s): refused', async (state) => {
      const payment = { ...mockGetPaymentResult, transactions: [transaction({ state })] };
      jest.spyOn(paymentSDK.ctPaymentService, 'getPayment').mockResolvedValue(payment as never);
      const errorSpy = jest.spyOn(log, 'error').mockImplementation(() => log);

      await expect(sale(saleDetails)).rejects.toThrow(`transactionSale refused for payment ${payment.id}`);
      expect(CommonConnect.transactionSale).not.toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('already charged payment'));
    });

    test('failed earlier Authorization: charged', async () => {
      const payment = { ...mockGetPaymentResult, transactions: [transaction({ state: 'Failure' })] };
      jest.spyOn(paymentSDK.ctPaymentService, 'getPayment').mockResolvedValue(payment as never);

      await sale(saleDetails);

      expect(CommonConnect.transactionSale).toHaveBeenCalled();
    });

    describe('Express', () => {
      const expressItems = (cart: Cart) => buildCartLineItems(cart, true);
      const expressSale = (braintreeLineItems: unknown[], expressShippingChanged?: boolean) =>
        sale({ braintreeLineItems, ...(expressShippingChanged ? { expressShippingChanged } : {}) });

      test('no shipping change, cart unchanged: charged', async () => {
        await expressSale(expressItems(saleCart()));

        expect(CommonConnect.transactionSale).toHaveBeenCalled();
      });

      // shipping is a line item in the standard copy, in PayPal's breakdown for Express; the amount check covers it
      test.each([
        { copy: 'standard (shipping line item)', isExpress: false },
        { copy: 'Express (no shipping line item)', isExpress: true },
      ])('cart with shipping, $copy copy: charged', async ({ isExpress }) => {
        const cart = { ...saleCart(), shippingInfo: mockGetCartResult().shippingInfo };
        mockCart(cart);

        await expressSale(buildCartLineItems(cart, isExpress));

        expect(CommonConnect.transactionSale).toHaveBeenCalled();
      });

      // without a shipping change nothing may change: PayPal was shown createPayment's line amounts
      test('no shipping change, prices shifted between line items (same total): refused', async () => {
        mockCart(saleCart(70000, 50000));

        await expectRefused(expressSale(expressItems(saleCart(60000, 60000))), 'line items');
      });

      test('cart amount differs from amountPlanned: refused', async () => {
        mockCart({ ...saleCart(), totalPrice: gbp(130000) });

        await expectRefused(expressSale(expressItems(saleCart()), true), 'amount');
      });

      // a shipping change may reprice the line items; amountPlanned (written by updateCartShipping) holds the total
      test('after a shipping change, same products at new prices: charged', async () => {
        mockCart(saleCart(70000, 50000));

        await expressSale(expressItems(saleCart(60000, 60000)), true);

        expect(CommonConnect.transactionSale).toHaveBeenCalled();
      });

      test('after a shipping change, another product: refused', async () => {
        mockCart({ ...saleCart(), lineItems: [{ ...lineItemWithTotal(120000), productId: 'another-product' }] });

        await expectRefused(expressSale(expressItems(saleCart()), true), 'line items');
      });
    });
  });

  describe('transactionSale order-triggering transaction', () => {
    const braintreePaymentService = new BraintreePaymentService(opts);

    beforeEach(() => {
      jest.spyOn(FastifyContext, 'getCartIdFromContext').mockReturnValue('cart-id');
      jest.spyOn(paymentSDK.ctPaymentService, 'updatePayment').mockResolvedValue({} as never);
      (CommonConnect.transactionSale as jest.Mock).mockResolvedValue(mockBraintreeTransaction as never);
      mockCart();
    });

    const sale = (ctPaymentId: string) =>
      braintreePaymentService.transactionSale({
        ctPaymentId,
        paymentMethodType: PaymentMethodType.CREDIT_CARD,
        paymentMethodNonce: 'nonce-123',
        braintreePaymentDetails: saleDetails,
      });

    test('real transaction available: no placeholder, the real Authorization is written before responding', async () => {
      const payment = { ...mockGetPaymentResult, transactions: [] };
      jest.spyOn(paymentSDK.ctPaymentService, 'getPayment').mockResolvedValue(payment as never);
      // The CT write stays pending until released — transactionSale must not resolve before it does.
      let releaseWrite!: () => void;
      rawPostExecute.mockImplementationOnce(
        () => new Promise((resolve) => (releaseWrite = () => resolve({ body: payment }))),
      );

      let settled = false;
      const salePromise = sale(payment.id).finally(() => (settled = true));
      await new Promise((resolve) => setImmediate(resolve));
      expect(settled).toBe(false);
      releaseWrite();
      const result = await salePromise;

      expect(result.success).toBe(true);
      // the Authorization (order trigger) plus Braintree's real state (submitted_for_settlement → Charge), both with
      // the Braintree id — no placeholder of any kind
      expect(addedTransactions()).toEqual([
        expect.objectContaining({ type: 'Authorization', interactionId: mockBraintreeTransaction.id }),
        expect.objectContaining({ type: 'Charge', interactionId: mockBraintreeTransaction.id }),
      ]);
    });

    // transaction, interactions, status fields and response field together; the SDK's updatePayment isn't used
    test('records the sale in one raw commercetools call', async () => {
      const payment = { ...mockGetPaymentResult, transactions: [], interfaceId: undefined };
      jest.spyOn(paymentSDK.ctPaymentService, 'getPayment').mockResolvedValue(payment as never);

      await sale(payment.id);

      expect(rawActionCalls()).toHaveLength(1);
      expect([...new Set(rawActionCalls()[0].map((a) => a.action))].sort()).toEqual([
        'addInterfaceInteraction',
        'addTransaction',
        'setCustomField',
        'setInterfaceId',
        'setMethodInfoMethod',
        'setStatusInterfaceCode',
        'setStatusInterfaceText',
      ]);
      // a reintroduced SDK write would fail silently inside retryCTSync, so it's checked here
      expect(paymentSDK.ctPaymentService.updatePayment).not.toHaveBeenCalled();
    });

    // fire-and-forget (the buyer is waiting), and no transaction: a declined sale never leaves one on the payment
    test("Braintree call fails: Braintree's answer recorded on the payment without a transaction, rejected", async () => {
      const payment = { ...mockGetPaymentResult, transactions: [] };
      jest.spyOn(paymentSDK.ctPaymentService, 'getPayment').mockResolvedValue(payment as never);
      (CommonConnect.transactionSale as jest.Mock).mockRejectedValue(braintreeDeclineError() as never);

      await expect(sale(payment.id)).rejects.toThrow(`transactionSale failed for payment ${payment.id}`);
      await new Promise((resolve) => setImmediate(resolve));

      expect(setCustomFieldWrites()).toEqual([
        {
          transactionSaleProcessorRequest: JSON.stringify(recordedRequest('transactionSale')),
          transactionSaleResponse: JSON.stringify(braintreeDecline),
        },
      ]);
      expect(recordedRequest('transactionSale')).toEqual(expect.objectContaining({ paymentMethodNonce: 'nonce-123' }));
      expect(addedTransactions()).toEqual([]);
    });

    // setCustomField instead of the SDK's setCustomType, which would replace every field
    test('records transactionSaleResponse', async () => {
      const payment = { ...mockGetPaymentResult, transactions: [] };
      jest.spyOn(paymentSDK.ctPaymentService, 'getPayment').mockResolvedValue(payment as never);

      await sale(payment.id);

      expect(setCustomFieldWrites()).toEqual([
        {
          transactionSaleProcessorRequest: JSON.stringify(recordedRequest('transactionSale')),
          transactionSaleResponse: JSON.stringify(mockBraintreeTransaction),
        },
      ]);
      expect(recordedRequest('transactionSale')).toEqual(expect.objectContaining({ paymentMethodNonce: 'nonce-123' }));
    });

    test.each(nonBraintreeCustomCases)(
      'payment with $description: refused before Braintree, logged as error',
      async ({ custom }) => {
        jest
          .spyOn(paymentSDK.ctPaymentService, 'getPayment')
          .mockResolvedValue({ ...mockGetPaymentResult, custom } as never);
        const errorSpy = jest.spyOn(log, 'error').mockImplementation(() => log);

        await expect(sale(mockGetPaymentResult.id)).rejects.toThrow(
          `payment ${mockGetPaymentResult.id} is not Braintree checkout payment`,
        );
        expect(CommonConnect.transactionSale).not.toHaveBeenCalled();
        expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining(notBraintreePayment(mockGetPaymentResult.id)));
        expect(rawPaymentPost).not.toHaveBeenCalled();
      },
    );

    test('placeholder cancelled before verification: refused without calling Braintree', async () => {
      const payment = { ...mockGetPaymentResult, transactions: [achPlaceholder, cancelledPlaceholder] };
      jest.spyOn(paymentSDK.ctPaymentService, 'getPayment').mockResolvedValue(payment as never);

      await expect(sale(payment.id)).rejects.toThrow(ErrorInvalidOperation);
      expect(CommonConnect.transactionSale).not.toHaveBeenCalled();
    });

    test('placeholder present: overwritten in place with the real state and Braintree id, no duplicate added', async () => {
      const payment = { ...mockGetPaymentResult, version: 7, transactions: [achPlaceholder] };
      jest.spyOn(paymentSDK.ctPaymentService, 'getPayment').mockResolvedValue(payment as never);

      await sale(payment.id);

      // submitted_for_settlement maps to Pending
      expect(rawActions('changeTransactionState')).toEqual([
        { action: 'changeTransactionState', transactionId: 'placeholder-1', state: 'Pending' },
      ]);
      expect(rawActions('changeTransactionInteractionId')).toEqual([
        {
          action: 'changeTransactionInteractionId',
          transactionId: 'placeholder-1',
          interactionId: mockBraintreeTransaction.id,
        },
      ]);
      // first attempt on the sale's own snapshot: its version, no extra fetch
      expect(rawPaymentPost).toHaveBeenCalledWith({ body: expect.objectContaining({ version: 7 }) });
      expect(paymentSDK.ctPaymentService.getPayment).toHaveBeenCalledTimes(1);
      // no duplicate Authorization; only Braintree's real state is added next to it
      expect(addedTransactions()).toEqual([expect.objectContaining({ type: 'Charge' })]);
    });

    test('placeholder cancelled while the sale ran (cancel and capture concurrently): logged as merchant issue, still overwritten', async () => {
      const snapshot = { ...mockGetPaymentResult, transactions: [achPlaceholder] };
      jest
        .spyOn(paymentSDK.ctPaymentService, 'getPayment')
        .mockResolvedValueOnce(snapshot as never)
        .mockResolvedValue({ ...snapshot, transactions: [achPlaceholder, cancelledPlaceholder] } as never);
      const errorSpy = jest.spyOn(log, 'error').mockImplementation(() => log);
      // the cancel marker was written after the sale's snapshot: its version is stale, the retry sees the marker
      firstWriteConflicts();

      await afterRetryBackoff(() => sale(snapshot.id));

      expect(errorSpy.mock.calls.flat()).toContain(
        `${CONCURRENT_CANCEL_AND_SALE_ISSUE} on payment ${snapshot.id}, Braintree transaction ${mockBraintreeTransaction.id}`,
      );
      expect(rawActions('changeTransactionInteractionId')).not.toHaveLength(0);
    });

    test('placeholder already overwritten by an earlier sync attempt: neither re-overwritten nor re-added', async () => {
      const snapshot = { ...mockGetPaymentResult, transactions: [achPlaceholder] };
      const alreadyOverwritten = {
        ...snapshot,
        transactions: [{ ...achPlaceholder, interactionId: mockBraintreeTransaction.id }],
      };
      jest
        .spyOn(paymentSDK.ctPaymentService, 'getPayment')
        .mockResolvedValueOnce(snapshot as never)
        .mockResolvedValue(alreadyOverwritten as never);
      // the earlier attempt reached commercetools, but the client saw a failure; the retry re-fetches
      firstWriteConflicts();

      await afterRetryBackoff(() => sale(snapshot.id));

      const retry = rawActionCalls().slice(-1);
      expect(rawActions('changeTransactionInteractionId', retry)).toHaveLength(0);
      expect(addedTransactions(retry)).not.toContainEqual(expect.objectContaining({ type: 'Authorization' }));
    });
  });

  // Payment Intents operations — behavior per docs/Intents.md
  describe('settlement', () => {
    const braintreePaymentService = new BraintreePaymentService(opts);
    const authorization = transaction({ id: 'auth-1', interactionId: 'interaction-1' });

    beforeEach(() => {
      (CommonConnect.submitForSettlement as jest.Mock).mockResolvedValue(mockBraintreeTransaction as never);
      jest.spyOn(paymentSDK.ctPaymentService, 'getPayment').mockResolvedValue(mockGetPaymentResult as never);
    });

    test('first capture of the full authorized amount: submitForSettlement without amount on the last Authorization', async () => {
      const payment = {
        ...mockGetPaymentResult,
        transactions: [authorization, transaction({ id: 'auth-2', interactionId: 'interaction-2' })],
      };

      const result = await braintreePaymentService.settlement({ payment, amount: payment.amountPlanned });

      expect(CommonConnect.submitForSettlement).toHaveBeenCalledWith('interaction-2', undefined);
      // submitted_for_settlement → Pending → received
      expect(result).toEqual({ outcome: PaymentModificationStatus.RECEIVED });
    });

    test('partial amount: submitForPartialSettlement amount passed', async () => {
      const payment = { ...mockGetPaymentResult, transactions: [authorization] };

      await braintreePaymentService.settlement({ payment, amount: amountOf(50000) });

      expect(CommonConnect.submitForSettlement).toHaveBeenCalledWith('interaction-1', '500.00');
    });

    test('a capture already exists: partial settlement even for the full amount', async () => {
      const payment = {
        ...mockGetPaymentResult,
        transactions: [authorization, transaction({ id: 'charge-1', type: 'Charge', interactionId: 'child-1' })],
      };

      await braintreePaymentService.settlement({ payment, amount: payment.amountPlanned });

      expect(CommonConnect.submitForSettlement).toHaveBeenCalledWith('interaction-1', '1200.00');
    });

    // full capture = the Authorization's first capture, for its whole amount; decided from the transactions
    test.each([
      // a full capture's Charge carries its Authorization's id, so the other Authorization is still uncaptured
      { description: 'the first was captured in full: full capture', chargeId: 'interaction-1', expected: undefined },
      // a partial capture's Charge (child id) can't be attributed to an Authorization on commercetools
      {
        description: 'a partial capture exists on the payment: partial settlement',
        chargeId: 'child-1',
        expected: '1200.00',
      },
    ])('second Authorization, $description', async ({ chargeId, expected }) => {
      const payment = {
        ...mockGetPaymentResult,
        transactions: [
          authorization,
          transaction({ id: 'charge-1', type: 'Charge', interactionId: chargeId }),
          transaction({ id: 'auth-2', interactionId: 'interaction-2' }),
        ],
      };

      await braintreePaymentService.settlement({
        payment,
        amount: payment.amountPlanned,
        merchantReference: 'interaction-2',
      });

      expect(CommonConnect.submitForSettlement).toHaveBeenCalledWith('interaction-2', expected);
    });

    test('merchantReference selects the Authorization to capture', async () => {
      const payment = {
        ...mockGetPaymentResult,
        transactions: [authorization, transaction({ id: 'auth-2', interactionId: 'interaction-2' })],
      };

      await braintreePaymentService.settlement({
        payment,
        amount: payment.amountPlanned,
        merchantReference: 'interaction-1',
      });

      expect(CommonConnect.submitForSettlement).toHaveBeenCalledWith('interaction-1', undefined);
    });

    test.each([
      ['a Charge', [authorization, transaction({ id: 'charge-1', type: 'Charge', interactionId: 'txn-x' })], 'txn-x'],
      ['a placeholder', [authorization, achPlaceholder], buildPlaceholderInteractionId(mockGetPaymentResult.id)],
      ['not on the payment', [authorization], 'unknown'],
    ])(
      'merchantReference that is %s: rejected without calling Braintree',
      async (_, transactions, merchantReference) => {
        const payment = { ...mockGetPaymentResult, transactions };

        const result = await braintreePaymentService.settlement({
          payment,
          amount: payment.amountPlanned,
          merchantReference,
        });

        expect(result).toEqual({ outcome: PaymentModificationStatus.REJECTED });
        expect(CommonConnect.submitForSettlement).not.toHaveBeenCalled();
      },
    );

    // as braintree-extension records it
    test('success: records submitForSettlementResponse', async () => {
      const payment = { ...mockGetPaymentResult, transactions: [authorization] };

      await braintreePaymentService.settlement({ payment, amount: payment.amountPlanned });

      expect(setCustomFieldWrites()).toEqual([
        {
          submitForSettlementProcessorRequest: JSON.stringify({ transactionId: 'interaction-1' }),
          submitForSettlementResponse: JSON.stringify(mockBraintreeTransaction),
        },
      ]);
    });

    test('skips a placeholder Authorization and settles the real one', async () => {
      const payment = { ...mockGetPaymentResult, transactions: [authorization, achPlaceholder] };

      await braintreePaymentService.settlement({ payment, amount: payment.amountPlanned });

      expect(CommonConnect.submitForSettlement).toHaveBeenCalledWith('interaction-1', undefined);
    });

    test.each([
      ['the only Authorization is a placeholder', [achPlaceholder]],
      ['no Authorization exists', [transaction({ id: 'charge-1', type: 'Charge', interactionId: undefined })]],
      ['the Authorization has no interactionId', [transaction({ id: 'auth-1' })]],
      ['the Authorization failed (declined sale)', [{ ...authorization, state: 'Failure' as const }]],
      ['the Authorization was voided', [authorization, cancelOf('interaction-1')]],
    ])('rejects without calling Braintree when %s', async (_, transactions) => {
      const payment = { ...mockGetPaymentResult, transactions };

      const result = await braintreePaymentService.settlement({ payment, amount: payment.amountPlanned });

      expect(result).toEqual({ outcome: PaymentModificationStatus.REJECTED });
      expect(CommonConnect.submitForSettlement).not.toHaveBeenCalled();
    });

    test.each([
      ['full capture: only the transactionId', 120000, { transactionId: 'interaction-1' }],
      ['partial capture: the Braintree amount too', 50000, { transactionId: 'interaction-1', amount: '500.00' }],
    ])('records what was sent to Braintree — %s', async (_, centAmount, expected) => {
      const payment = { ...mockGetPaymentResult, transactions: [authorization] };

      await braintreePaymentService.settlement({ payment, amount: amountOf(centAmount) });

      expect(recordedRequest('submitForSettlement')).toEqual(expected);
    });

    test('returns approved when Braintree reports the settlement as settled', async () => {
      const payment = { ...mockGetPaymentResult, transactions: [authorization] };
      (CommonConnect.submitForSettlement as jest.Mock).mockResolvedValue({
        ...mockBraintreeTransaction,
        status: 'settled',
      } as never);

      const result = await braintreePaymentService.settlement({ payment, amount: payment.amountPlanned });

      expect(result).toEqual({ outcome: PaymentModificationStatus.APPROVED });
    });

    test('Braintree call fails: rejected, failure recorded on the payment without a transaction', async () => {
      const payment = { ...mockGetPaymentResult, transactions: [authorization] };
      (CommonConnect.submitForSettlement as jest.Mock).mockRejectedValue(braintreeDeclineError() as never);

      const result = await braintreePaymentService.settlement({ payment, amount: payment.amountPlanned });

      expect(result).toEqual({ outcome: PaymentModificationStatus.REJECTED });
      expectFailureRecorded('submitForSettlement', { transactionId: 'interaction-1' }, braintreeDecline);
    });

    // the failure record itself: see 'Braintree call fails: rejected, failure recorded …' above
    test('Braintree call fails: the request sent to Braintree is recorded', async () => {
      const payment = { ...mockGetPaymentResult, transactions: [authorization] };
      (CommonConnect.submitForSettlement as jest.Mock).mockRejectedValue(new Error('Braintree error') as never);

      await braintreePaymentService.settlement({ payment, amount: amountOf(50000) });

      expect(recordedRequest('submitForSettlement')).toEqual({ transactionId: 'interaction-1', amount: '500.00' });
    });
  });

  describe('refundPayment', () => {
    const braintreePaymentService = new BraintreePaymentService(opts);
    const charge = transaction({ id: 'charge-1', type: 'Charge', interactionId: 'txn-charge' });
    const otherCharge = transaction({ id: 'charge-2', type: 'Charge', interactionId: 'txn-other' });

    beforeEach(() => {
      jest.spyOn(paymentSDK.ctPaymentService, 'getPayment').mockResolvedValue(mockGetPaymentResult as never);
      (CommonConnect.refund as jest.Mock).mockResolvedValue({
        ...mockBraintreeTransaction,
        id: 'refund-1',
        type: 'credit',
      } as never);
    });

    test('no transactionId: refunds the single active capture by its Braintree id, received for a pending refund', async () => {
      const voidedCapture = transaction({ id: 'charge-0', type: 'Charge', state: 'Failure', interactionId: 'txn-old' });
      const payment = { ...mockGetPaymentResult, transactions: [voidedCapture, charge] };

      const result = await braintreePaymentService.refundPayment({ payment, amount: amountOf(50000) });

      expect(CommonConnect.refund).toHaveBeenCalledWith('txn-charge', '500.00');
      expect(result).toEqual({ outcome: PaymentModificationStatus.RECEIVED });
    });

    test('transactionId on the payment: refunds that capture', async () => {
      const payment = { ...mockGetPaymentResult, transactions: [charge, otherCharge] };

      await braintreePaymentService.refundPayment({
        payment,
        amount: amountOf(50000),
        transactionId: 'txn-charge',
      });

      expect(CommonConnect.refund).toHaveBeenCalledWith('txn-charge', '500.00');
    });

    test.each([
      ['transactionId not on the payment', [charge], 'txn-foreign'],
      ['transactionId is the placeholder marker', [achPlaceholder], achPlaceholder.interactionId],
      ['no capture to refund', [achPlaceholder], undefined],
      ['more than one active capture and no transactionId', [charge, otherCharge], undefined],
      [
        'the only capture is already fully refunded',
        [charge, transaction({ id: 'refund-0', type: 'Refund', interactionId: 'refund-0' })],
        undefined,
      ],
      [
        'a Pending refund leaves less than requested',
        [
          charge,
          transaction({
            id: 'refund-0',
            type: 'Refund',
            state: 'Pending',
            interactionId: 'refund-0',
            amount: amountOf(100000),
          }),
        ],
        undefined,
      ],
    ])('rejects without calling Braintree when %s', async (_, transactions, transactionId) => {
      const payment = { ...mockGetPaymentResult, transactions };

      const result = await braintreePaymentService.refundPayment({
        payment,
        amount: amountOf(50000),
        transactionId,
      });

      expect(result).toEqual({ outcome: PaymentModificationStatus.REJECTED });
      expect(CommonConnect.refund).not.toHaveBeenCalled();
    });

    test('impossible operation is logged as warn, a failed Braintree call as error', async () => {
      const warnSpy = jest.spyOn(log, 'warn').mockImplementation(() => log);
      const errorSpy = jest.spyOn(log, 'error').mockImplementation(() => log);
      const payment = { ...mockGetPaymentResult, transactions: [charge] };

      await braintreePaymentService.refundPayment({ payment, amount: amountOf(50000), transactionId: 'txn-foreign' });
      expect(warnSpy.mock.calls.flat()).toContainEqual(expect.stringContaining('refundPayment: rejected'));
      expect(errorSpy).not.toHaveBeenCalled();

      (CommonConnect.refund as jest.Mock).mockRejectedValue(new Error('Braintree error') as never);
      await braintreePaymentService.refundPayment({ payment, amount: amountOf(50000) });
      expect(errorSpy.mock.calls.flat()).toContainEqual(expect.stringContaining('refundPayment: rejected'));
    });

    test('a refund that fits what is left on the only capture goes to Braintree', async () => {
      const payment = {
        ...mockGetPaymentResult,
        transactions: [
          charge,
          transaction({ id: 'refund-0', type: 'Refund', interactionId: 'refund-0', amount: amountOf(70000) }),
        ],
      };

      await braintreePaymentService.refundPayment({ payment, amount: amountOf(50000) });

      expect(CommonConnect.refund).toHaveBeenCalledWith('txn-charge', '500.00');
    });

    test('Braintree call fails: rejected, failure recorded on the payment without a transaction', async () => {
      const payment = { ...mockGetPaymentResult, transactions: [charge] };
      (CommonConnect.refund as jest.Mock).mockRejectedValue(braintreeDeclineError() as never);

      const result = await braintreePaymentService.refundPayment({ payment, amount: payment.amountPlanned });

      expect(result).toEqual({ outcome: PaymentModificationStatus.REJECTED });
      // what was sent to Braintree (its amount string), not the incoming commercetools Money
      expectFailureRecorded('refund', { transactionId: 'txn-charge', amount: '1200.00' }, braintreeDecline);
    });

    test('records refundResponse', async () => {
      const payment = { ...mockGetPaymentResult, transactions: [charge] };

      await braintreePaymentService.refundPayment({ payment, amount: amountOf(50000) });

      expect(setCustomFieldWrites()).toEqual([
        {
          refundProcessorRequest: JSON.stringify({ transactionId: 'txn-charge', amount: '500.00' }),
          refundResponse: JSON.stringify({ ...mockBraintreeTransaction, id: 'refund-1', type: 'credit' }),
        },
      ]);
    });
  });

  describe('void', () => {
    const braintreePaymentService = new BraintreePaymentService(opts);
    const authorization = transaction({ id: 'auth-1', interactionId: 'txn-auth' });
    // Full capture: the Charge carries the parent (Authorization) id
    const pendingCharge = transaction({ id: 'charge-1', type: 'Charge', state: 'Pending', interactionId: 'txn-auth' });

    beforeEach(() => {
      jest.spyOn(paymentSDK.ctPaymentService, 'getPayment').mockResolvedValue(mockGetPaymentResult as never);
      (CommonConnect.voidTransaction as jest.Mock).mockResolvedValue({
        ...mockBraintreeTransaction,
        id: 'txn-auth',
        status: 'voided',
      } as never);
    });

    test('voids the real Authorization, skipping a later placeholder, and returns approved', async () => {
      const payment = { ...mockGetPaymentResult, transactions: [authorization, achPlaceholder] };

      const result = await braintreePaymentService.void({ payment });

      expect(CommonConnect.voidTransaction).toHaveBeenCalledWith('txn-auth');
      expect(result).toEqual({ outcome: PaymentModificationStatus.APPROVED });
    });

    test('merchantReference on the payment: voids that transaction', async () => {
      const child = transaction({ id: 'charge-1', type: 'Charge', state: 'Pending', interactionId: 'txn-child' });
      const payment = { ...mockGetPaymentResult, transactions: [authorization, child] };

      await braintreePaymentService.void({ payment, merchantReference: 'txn-child' });

      expect(CommonConnect.voidTransaction).toHaveBeenCalledWith('txn-child');
    });

    test('voided capture: its Pending Charge is moved to Failure', async () => {
      const payment = { ...mockGetPaymentResult, transactions: [authorization, pendingCharge] };
      jest.spyOn(paymentSDK.ctPaymentService, 'getPayment').mockResolvedValue(payment as never);

      await braintreePaymentService.void({ payment });

      expect(rawActions('changeTransactionState')).toEqual([
        { action: 'changeTransactionState', transactionId: 'charge-1', state: 'Failure' },
      ]);
    });

    test('voided capture whose Charge was already moved by an earlier sync attempt: nothing changed again', async () => {
      const payment = { ...mockGetPaymentResult, transactions: [authorization, pendingCharge] };
      jest.spyOn(paymentSDK.ctPaymentService, 'getPayment').mockResolvedValue({
        ...payment,
        transactions: [authorization, { ...pendingCharge, state: 'Failure' }],
      } as never);
      // the earlier attempt reached commercetools, but the client saw a failure; the retry re-fetches
      firstWriteConflicts();

      await afterRetryBackoff(() => braintreePaymentService.void({ payment }));

      expect(rawActions('changeTransactionState', rawActionCalls().slice(-1))).toHaveLength(0);
    });

    test('only a placeholder (unverified ACH): cancels it on commercetools without calling Braintree', async () => {
      const payment = { ...mockGetPaymentResult, transactions: [achPlaceholder] };
      jest.spyOn(paymentSDK.ctPaymentService, 'getPayment').mockResolvedValue(payment as never);

      const result = await braintreePaymentService.void({ payment });

      expect(result).toEqual({ outcome: PaymentModificationStatus.APPROVED });
      expect(CommonConnect.voidTransaction).not.toHaveBeenCalled();
      expect(addedTransactions()).toEqual([
        {
          type: 'CancelAuthorization',
          state: 'Success',
          interactionId: buildPlaceholderInteractionId(payment.id),
          amount: { centAmount: achPlaceholder.amount.centAmount, currencyCode: achPlaceholder.amount.currencyCode },
        },
      ]);
    });

    test('placeholder already cancelled: approved again, no second cancellation added', async () => {
      const payment = { ...mockGetPaymentResult, transactions: [achPlaceholder, cancelledPlaceholder] };
      jest.spyOn(paymentSDK.ctPaymentService, 'getPayment').mockResolvedValue(payment as never);

      const result = await braintreePaymentService.void({ payment });

      expect(result).toEqual({ outcome: PaymentModificationStatus.APPROVED });
      expect(addedTransactions()).toEqual([]);
    });

    test('placeholder cancel that cannot be written: rejected', async () => {
      const payment = { ...mockGetPaymentResult, transactions: [achPlaceholder] };
      jest.spyOn(paymentSDK.ctPaymentService, 'getPayment').mockResolvedValue(payment as never);
      // 403 — retryCTSync stops at once, without backoff
      rawPaymentPost.mockReturnValue({
        execute: jest.fn<() => Promise<unknown>>().mockRejectedValue({ statusCode: 403 }),
      });

      const result = await braintreePaymentService.void({ payment });

      expect(result).toEqual({ outcome: PaymentModificationStatus.REJECTED });
    });

    test('placeholder already replaced by a capture (cancel and capture concurrently): logged as merchant issue', async () => {
      const payment = { ...mockGetPaymentResult, transactions: [achPlaceholder] };
      jest
        .spyOn(paymentSDK.ctPaymentService, 'getPayment')
        .mockResolvedValue({ ...payment, transactions: [{ ...achPlaceholder, interactionId: 'txn-sale' }] } as never);
      const errorSpy = jest.spyOn(log, 'error').mockImplementation(() => log);

      const result = await braintreePaymentService.void({ payment });

      // no Braintree call to decline: approved once the marker is written (docs/Intents.md)
      expect(result).toEqual({ outcome: PaymentModificationStatus.APPROVED });
      expect(errorSpy.mock.calls.flat()).toContain(`${CONCURRENT_CANCEL_AND_SALE_ISSUE} on payment ${payment.id}`);
    });

    test.each([
      ['there is no transaction at all', [], undefined],
      ['merchantReference is not on the payment', [authorization], 'txn-foreign'],
      ['merchantReference is given and only a placeholder exists', [achPlaceholder], 'txn-foreign'],
      ['the Authorization failed (declined sale)', [{ ...authorization, state: 'Failure' as const }], undefined],
      ['the Authorization was already voided', [authorization, cancelOf('txn-auth')], undefined],
    ])('rejects without calling Braintree when %s', async (_, transactions, merchantReference) => {
      const payment = { ...mockGetPaymentResult, transactions };

      const result = await braintreePaymentService.void({ payment, merchantReference });

      expect(result).toEqual({ outcome: PaymentModificationStatus.REJECTED });
      expect(CommonConnect.voidTransaction).not.toHaveBeenCalled();
      expect(addedTransactions()).toEqual([]);
    });

    test('Braintree call fails: rejected, failure recorded on the payment without a transaction', async () => {
      const payment = { ...mockGetPaymentResult, transactions: [authorization] };
      (CommonConnect.voidTransaction as jest.Mock).mockRejectedValue(braintreeDeclineError() as never);

      const result = await braintreePaymentService.void({ payment });

      expect(result).toEqual({ outcome: PaymentModificationStatus.REJECTED });
      expectFailureRecorded('void', { transactionId: 'txn-auth' }, braintreeDecline);
    });

    test('records voidResponse', async () => {
      const payment = { ...mockGetPaymentResult, transactions: [authorization] };

      await braintreePaymentService.void({ payment });

      expect(setCustomFieldWrites()).toEqual([
        {
          voidProcessorRequest: JSON.stringify({ transactionId: 'txn-auth' }),
          voidResponse: JSON.stringify({ ...mockBraintreeTransaction, id: 'txn-auth', status: 'voided' }),
        },
      ]);
    });

    // as braintree-extension records a void; the cancelled refund never reached the customer
    test('voided refund: recorded as a CancelAuthorization, its Pending Refund moved to Failure', async () => {
      const refund = transaction({ id: 'refund-1', type: 'Refund', state: 'Pending', interactionId: 'txn-refund' });
      const payment = { ...mockGetPaymentResult, transactions: [authorization, refund] };
      (CommonConnect.voidTransaction as jest.Mock).mockResolvedValue({
        ...mockBraintreeTransaction,
        id: 'txn-refund',
        type: 'credit',
        status: 'voided',
      } as never);

      await braintreePaymentService.void({ payment, merchantReference: 'txn-refund' });

      expect(CommonConnect.voidTransaction).toHaveBeenCalledWith('txn-refund');
      expect(rawActions('changeTransactionState')).toEqual([
        { action: 'changeTransactionState', transactionId: 'refund-1', state: 'Failure' },
      ]);
      expect(addedTransactions()).toEqual([
        expect.objectContaining({ type: 'CancelAuthorization', state: 'Success', interactionId: 'txn-refund' }),
      ]);
    });
  });

  describe('reversePayment', () => {
    const braintreePaymentService = new BraintreePaymentService(opts);
    const authorization = transaction({ id: 'auth-1', interactionId: 'txn-1' });
    const charge = transaction({ id: 'charge-1', type: 'Charge', interactionId: 'txn-capture' });
    const pendingChild = transaction({ id: 'charge-2', type: 'Charge', state: 'Pending', interactionId: 'txn-child' });
    const braintreeStatus = (status: string) =>
      (CommonConnect.getTransaction as jest.Mock).mockResolvedValue({ ...mockBraintreeTransaction, status } as never);

    beforeEach(() => {
      jest.spyOn(paymentSDK.ctPaymentService, 'getPayment').mockResolvedValue(mockGetPaymentResult as never);
      (CommonConnect.voidTransaction as jest.Mock).mockResolvedValue({
        ...mockBraintreeTransaction,
        status: 'voided',
      } as never);
      (CommonConnect.refund as jest.Mock).mockResolvedValue({
        ...mockBraintreeTransaction,
        id: 'refund-1',
        type: 'credit',
      } as never);
    });

    test.each(['settling', 'settled', 'settlement_confirmed'])(
      '%s: refunds the single capture without an amount (Braintree refunds what is left)',
      async (status) => {
        braintreeStatus(status);
        const payment = { ...mockGetPaymentResult, transactions: [authorization, charge] };

        const result = await braintreePaymentService.reversePayment({ payment });

        expect(CommonConnect.getTransaction).toHaveBeenCalledWith('txn-capture');
        expect(CommonConnect.refund).toHaveBeenCalledWith('txn-capture', undefined);
        // refund submitted_for_settlement → Pending → received
        expect(result).toEqual({ outcome: PaymentModificationStatus.RECEIVED });
        expect(CommonConnect.voidTransaction).not.toHaveBeenCalled();
      },
    );

    test.each(['authorized', 'submitted_for_settlement', 'settlement_pending'])('%s: voids', async (status) => {
      braintreeStatus(status);
      const payment = { ...mockGetPaymentResult, transactions: [authorization] };

      const result = await braintreePaymentService.reversePayment({ payment });

      expect(CommonConnect.voidTransaction).toHaveBeenCalledWith('txn-1');
      expect(CommonConnect.refund).not.toHaveBeenCalled();
      expect(result).toEqual({ outcome: PaymentModificationStatus.APPROVED });
    });

    test('Pending capture (partial-settlement child): asks Braintree about the child and voids the child', async () => {
      braintreeStatus('submitted_for_settlement');
      const payment = { ...mockGetPaymentResult, transactions: [authorization, pendingChild] };
      jest.spyOn(paymentSDK.ctPaymentService, 'getPayment').mockResolvedValue(payment as never);
      rawPostReturns(payment);
      (CommonConnect.voidTransaction as jest.Mock).mockResolvedValue({
        ...mockBraintreeTransaction,
        id: 'txn-child',
        status: 'voided',
      } as never);

      await braintreePaymentService.reversePayment({ payment });

      expect(CommonConnect.getTransaction).toHaveBeenCalledWith('txn-child');
      expect(CommonConnect.voidTransaction).toHaveBeenCalledWith('txn-child');
      expect(rawActions('changeTransactionState')).toEqual([
        { action: 'changeTransactionState', transactionId: 'charge-2', state: 'Failure' },
      ]);
    });

    // as braintree-extension records its findTransaction lookup; the void starts from the version that record returned
    test('records the Braintree lookup, then continues from the payment it returned', async () => {
      braintreeStatus('authorized');
      const payment = { ...mockGetPaymentResult, version: 3, transactions: [authorization] };
      rawPostReturns({ ...payment, version: 4 });

      await braintreePaymentService.reversePayment({ payment });

      expect(setCustomFieldWrites()[0]).toEqual({
        findTransactionProcessorRequest: JSON.stringify({ transactionId: 'txn-1' }),
        findTransactionResponse: JSON.stringify({ ...mockBraintreeTransaction, status: 'authorized' }),
      });
      expect(recordedRequest('findTransaction')).toEqual({ transactionId: 'txn-1' });
      expect(rawPaymentPost.mock.calls.map(([args]) => args.body.version)).toEqual([3, 4]);
    });

    test('Pending capture already settled on Braintree: refunds the child, not the parent', async () => {
      braintreeStatus('settled');
      const payment = { ...mockGetPaymentResult, transactions: [authorization, pendingChild] };

      await braintreePaymentService.reversePayment({ payment });

      expect(CommonConnect.refund).toHaveBeenCalledWith('txn-child', undefined);
    });

    test('a voided capture (Failure) is ignored: the remaining capture is the target', async () => {
      braintreeStatus('settled');
      const voided = { ...pendingChild, id: 'charge-0', state: 'Failure' as const, interactionId: 'txn-old' };
      const payment = { ...mockGetPaymentResult, transactions: [authorization, voided, pendingChild] };

      await braintreePaymentService.reversePayment({ payment });

      expect(CommonConnect.getTransaction).toHaveBeenCalledWith('txn-child');
    });

    test('merchantReference pointing at the Authorization while a capture exists: the Authorization is the target', async () => {
      braintreeStatus('authorized');
      const payment = { ...mockGetPaymentResult, transactions: [authorization, pendingChild] };

      await braintreePaymentService.reversePayment({ payment, merchantReference: 'txn-1' });

      expect(CommonConnect.getTransaction).toHaveBeenCalledWith('txn-1');
      expect(CommonConnect.voidTransaction).toHaveBeenCalledWith('txn-1');
    });

    test('merchantReference on the payment: that transaction is the target', async () => {
      braintreeStatus('settled');
      const other = { ...pendingChild, id: 'charge-3', interactionId: 'txn-other' };
      const payment = { ...mockGetPaymentResult, transactions: [authorization, pendingChild, other] };

      await braintreePaymentService.reversePayment({ payment, merchantReference: 'txn-child' });

      expect(CommonConnect.refund).toHaveBeenCalledWith('txn-child', undefined);
    });

    test.each([
      [
        'more than one active capture and no merchantReference',
        [authorization, pendingChild, { ...pendingChild, id: 'c3', interactionId: 'txn-c3' }],
        undefined,
      ],
      ['merchantReference is not on the payment', [authorization], 'txn-foreign'],
      [
        'the only capture is already fully refunded',
        [authorization, charge, transaction({ id: 'r1', type: 'Refund', interactionId: 'r1' })],
        undefined,
      ],
      [
        'a Pending refund already covers the only capture',
        [authorization, charge, transaction({ id: 'r1', type: 'Refund', state: 'Pending', interactionId: 'r1' })],
        undefined,
      ],
      ['the Authorization failed (declined sale)', [{ ...authorization, state: 'Failure' as const }], undefined],
      ['the Authorization was already voided', [authorization, cancelOf('txn-1')], undefined],
      ['there is no transaction at all', [], undefined],
    ])('rejects without calling Braintree when %s', async (_, transactions, merchantReference) => {
      const payment = { ...mockGetPaymentResult, transactions };

      const result = await braintreePaymentService.reversePayment({ payment, merchantReference });

      expect(result).toEqual({ outcome: PaymentModificationStatus.REJECTED });
      expect(CommonConnect.getTransaction).not.toHaveBeenCalled();
      expect(CommonConnect.refund).not.toHaveBeenCalled();
      expect(CommonConnect.voidTransaction).not.toHaveBeenCalled();
    });

    test('non-reversible Braintree status: rejects', async () => {
      braintreeStatus('voided');
      const payment = { ...mockGetPaymentResult, transactions: [authorization] };

      const result = await braintreePaymentService.reversePayment({ payment });

      expect(result).toEqual({ outcome: PaymentModificationStatus.REJECTED });
      expect(CommonConnect.refund).not.toHaveBeenCalled();
      expect(CommonConnect.voidTransaction).not.toHaveBeenCalled();
    });

    test('only a placeholder Authorization (unverified ACH): cancels it without calling Braintree', async () => {
      const payment = { ...mockGetPaymentResultWithoutTransactions, transactions: [achPlaceholder] };
      jest.spyOn(paymentSDK.ctPaymentService, 'getPayment').mockResolvedValue(payment as never);

      const result = await braintreePaymentService.reversePayment({ payment });

      expect(result).toEqual({ outcome: PaymentModificationStatus.APPROVED });
      expect(CommonConnect.getTransaction).not.toHaveBeenCalled();
      expect(addedTransactions()).toEqual([
        expect.objectContaining({
          type: 'CancelAuthorization',
          state: 'Success',
          interactionId: achPlaceholder.interactionId,
        }),
      ]);
    });

    test('Braintree lookup fails: rejected, failure recorded as findTransaction', async () => {
      // the SDK throws without a Braintree response here
      const notFound = Object.assign(new Error('transaction not found'), { name: 'notFoundError' });
      (CommonConnect.getTransaction as jest.Mock).mockRejectedValue(notFound as never);
      const payment = { ...mockGetPaymentResult, transactions: [authorization] };

      const result = await braintreePaymentService.reversePayment({ payment });

      expect(result).toEqual({ outcome: PaymentModificationStatus.REJECTED });
      expectFailureRecorded(
        'findTransaction',
        { transactionId: 'txn-1' },
        { success: false, name: 'notFoundError', message: 'transaction not found' },
      );
      expect(CommonConnect.refund).not.toHaveBeenCalled();
      expect(CommonConnect.voidTransaction).not.toHaveBeenCalled();
    });
  });

  describe('getAchVaultToken', () => {
    const braintreePaymentService = new BraintreePaymentService(opts);
    // vaultPaymentMethodForCustomer's result, the vault going to the cart's customer
    const vaultResult = (token: string, verified: boolean) => ({ token, verified, ctCustomerId: 'ct-cust-1' });

    beforeEach(() => {
      jest.spyOn(FastifyContext, 'getCartIdFromContext').mockReturnValue('cart-id');
      jest
        .spyOn(paymentSDK.ctCartService, 'getCart')
        .mockResolvedValue({ ...mockCartForShippingUpdate(), customerId: 'ct-cust-1' });
      jest
        .spyOn(BraintreeCustomerService.prototype, 'vaultPaymentMethodForCustomer')
        .mockResolvedValue(vaultResult('ach-token-123', true));
    });

    // the customer isn't taken from the request: the vault and the PaymentMethod mirror go to the cart's customer
    test("vaults to the cart's customer and mirrors the method on it", async () => {
      jest.spyOn(paymentSDK.ctPaymentService, 'getPayment').mockResolvedValue(mockGetPaymentResult as never);
      const saveSpy = jest.spyOn(paymentSDK.ctPaymentMethodService, 'save').mockResolvedValue({} as never);

      await braintreePaymentService.getAchVaultToken({ ctPaymentId: 'payment-123', paymentMethodNonce: 'ach-nonce' });

      expect(BraintreeCustomerService.prototype.vaultPaymentMethodForCustomer).toHaveBeenCalledWith({
        paymentMethodNonce: 'ach-nonce',
        ctCustomerId: 'ct-cust-1',
      });
      expect(saveSpy).toHaveBeenCalledWith(
        expect.objectContaining({ customerId: 'ct-cust-1', method: 'ACH', token: 'ach-token-123' }),
      );
    });

    test('verified/instant path: no Pending sync side effect', async () => {
      const result = await braintreePaymentService.getAchVaultToken({
        ctPaymentId: 'payment-123',
        paymentMethodNonce: 'ach-nonce',
      });

      expect(result.token).toBe('ach-token-123');
      expect(result.verified).toBe(true);
    });

    test('unverified/micro-deposit path: fires Pending sync', async () => {
      jest
        .spyOn(BraintreeCustomerService.prototype, 'vaultPaymentMethodForCustomer')
        .mockResolvedValueOnce(vaultResult('ach-token-456', false));

      const result = await braintreePaymentService.getAchVaultToken({
        ctPaymentId: 'payment-123',
        paymentMethodNonce: 'ach-nonce',
      });

      expect(result.token).toBe('ach-token-456');
      expect(result.verified).toBe(false);
      // CT PaymentMethod mirror save should be fire-and-forget when cart has customerId
    });

    test('unverified/micro-deposit path: adds a Pending Authorization placeholder with the marker interactionId', async () => {
      jest
        .spyOn(BraintreeCustomerService.prototype, 'vaultPaymentMethodForCustomer')
        .mockResolvedValueOnce(vaultResult('ach-token-456', false));
      jest
        .spyOn(paymentSDK.ctPaymentService, 'getPayment')
        .mockResolvedValue({ ...mockGetPaymentResultWithoutTransactions, id: 'payment-123' } as never);

      await braintreePaymentService.getAchVaultToken({
        ctPaymentId: 'payment-123',
        paymentMethodNonce: 'ach-nonce',
      });

      expect(addedTransactions()).toEqual([
        {
          type: 'Authorization',
          state: 'Pending',
          interactionId: 'BraintreePlaceholder: payment-123',
          amount: {
            centAmount: mockGetPaymentResultWithoutTransactions.amountPlanned.centAmount,
            currencyCode: mockGetPaymentResultWithoutTransactions.amountPlanned.currencyCode,
          },
        },
      ]);
    });

    // the payment is only read after the vault, so it can't be refused in time; the placeholder needs no custom type
    test('unverified/micro-deposit path, payment with another custom type: placeholder written, logged as error once', async () => {
      jest
        .spyOn(BraintreeCustomerService.prototype, 'vaultPaymentMethodForCustomer')
        .mockResolvedValueOnce(vaultResult('ach-token-456', false));
      jest.spyOn(paymentSDK.ctPaymentService, 'getPayment').mockResolvedValue({
        ...mockGetPaymentResultWithoutTransactions,
        custom: otherTypeCustom(),
      } as never);
      const errorSpy = jest.spyOn(log, 'error').mockImplementation(() => log);

      await braintreePaymentService.getAchVaultToken({
        ctPaymentId: mockGetPaymentResult.id,
        paymentMethodNonce: 'ach-nonce',
      });

      expect(addedTransactions()).toEqual([expect.objectContaining({ type: 'Authorization', state: 'Pending' })]);
      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining(notBraintreePayment(mockGetPaymentResult.id)));
    });

    test('unverified/micro-deposit path: does not add a second placeholder when one already exists', async () => {
      jest
        .spyOn(BraintreeCustomerService.prototype, 'vaultPaymentMethodForCustomer')
        .mockResolvedValueOnce(vaultResult('ach-token-456', false));
      jest
        .spyOn(paymentSDK.ctPaymentService, 'getPayment')
        .mockResolvedValue({ ...mockGetPaymentResult, transactions: [achPlaceholder] } as never);

      await braintreePaymentService.getAchVaultToken({
        ctPaymentId: mockGetPaymentResult.id,
        paymentMethodNonce: 'ach-nonce',
      });

      expect(rawPaymentPost).toHaveBeenCalled();
      expect(addedTransactions()).toEqual([]);
    });

    test('unverified/micro-deposit path: no placeholder when a real Authorization already exists', async () => {
      jest
        .spyOn(BraintreeCustomerService.prototype, 'vaultPaymentMethodForCustomer')
        .mockResolvedValueOnce(vaultResult('ach-token-456', false));
      jest.spyOn(paymentSDK.ctPaymentService, 'getPayment').mockResolvedValue({
        ...mockGetPaymentResult,
        transactions: [transaction({ id: 'auth-1', interactionId: 'txn-real' })],
      } as never);

      await braintreePaymentService.getAchVaultToken({
        ctPaymentId: mockGetPaymentResult.id,
        paymentMethodNonce: 'ach-nonce',
      });

      expect(rawPaymentPost).toHaveBeenCalled();
      expect(addedTransactions()).toEqual([]);
    });

    test('includes merchantReturnUrl in unverified flow', async () => {
      jest
        .spyOn(BraintreeCustomerService.prototype, 'vaultPaymentMethodForCustomer')
        .mockResolvedValueOnce(vaultResult('ach-token-789', false));
      jest.spyOn(FastifyContext, 'getMerchantReturnUrlFromContext').mockReturnValue('https://example.com/return');

      const result = await braintreePaymentService.getAchVaultToken({
        ctPaymentId: 'payment-123',
        paymentMethodNonce: 'ach-nonce',
      });

      // buildRedirectMerchantUrl appends paymentReference/paymentStatus query params.
      expect(result.merchantReturnUrl).toContain('https://example.com/return?');
      expect(result.merchantReturnUrl).toContain('paymentStatus=settlement_pending');
    });
  });

  describe('deleteStoredPaymentMethod', () => {
    const braintreePaymentService = new BraintreePaymentService(opts);

    beforeEach(() => {
      // deleteStoredPaymentMethod calls braintreeDeletePayment(token) directly (aliased from
      // common-connect/dist's `deletePayment`) — not getBraintreeGateway().paymentMethod.delete.
      (CommonConnect.deletePayment as jest.Mock).mockResolvedValue(undefined as never);
      jest.spyOn(paymentSDK.ctPaymentMethodService, 'delete').mockResolvedValue({} as never);
    });

    test('happy path: deletes from Braintree and CT mirror', async () => {
      const cart = { ...mockCartForShippingUpdate(), customerId: 'ct-cust-123' };
      jest.spyOn(FastifyContext, 'getCartIdFromContext').mockReturnValue(cart.id);
      jest.spyOn(paymentSDK.ctCartService, 'getCart').mockResolvedValue(cart);
      jest.spyOn(paymentSDK.ctPaymentMethodService, 'getByTokenValue').mockResolvedValue({
        id: 'ct-pm-1',
        version: 1,
      } as never);

      await braintreePaymentService.deleteStoredPaymentMethod('pm-token-123');
      // fireAndForgetCtPaymentMethodSync doesn't await its own chain — flush pending microtasks
      // so the mirror-delete call lands before the assertion below.
      await new Promise((resolve) => process.nextTick(resolve));

      expect(paymentSDK.ctPaymentMethodService.delete).toHaveBeenCalled();
    });

    // Braintree answers a delete with no body
    test("the delete is recorded on the cart's customer", async () => {
      const cart = { ...mockCartForShippingUpdate(), customerId: 'ct-cust-123' };
      jest.spyOn(FastifyContext, 'getCartIdFromContext').mockReturnValue(cart.id);
      jest.spyOn(paymentSDK.ctCartService, 'getCart').mockResolvedValue(cart);
      jest
        .spyOn(paymentSDK.ctPaymentMethodService, 'getByTokenValue')
        .mockResolvedValue({ id: 'pm', version: 1 } as never);
      const recordSpy = jest
        .spyOn(BraintreeCustomerService.prototype, 'recordCustomerCall')
        .mockImplementation(() => undefined);

      await braintreePaymentService.deleteStoredPaymentMethod('pm-token-123');
      await new Promise((resolve) => setImmediate(resolve));

      expect(recordSpy).toHaveBeenCalledWith(
        'ct-cust-123',
        'deletePayment',
        { paymentMethodToken: 'pm-token-123' },
        // the extension's deletePaymentResponse on success
        'success',
      );
    });

    test("Braintree delete fails: Braintree's answer recorded on the cart's customer", async () => {
      const cart = { ...mockCartForShippingUpdate(), customerId: 'ct-cust-123' };
      jest.spyOn(FastifyContext, 'getCartIdFromContext').mockReturnValue(cart.id);
      jest.spyOn(paymentSDK.ctCartService, 'getCart').mockResolvedValue(cart);
      const notFound = Object.assign(new Error('payment method not found'), { name: 'notFoundError' });
      (CommonConnect.deletePayment as jest.Mock).mockRejectedValue(notFound as never);
      const recordSpy = jest
        .spyOn(BraintreeCustomerService.prototype, 'recordCustomerCall')
        .mockImplementation(() => undefined);

      await expect(braintreePaymentService.deleteStoredPaymentMethod('pm-token-123')).rejects.toThrow();
      await new Promise((resolve) => setImmediate(resolve));

      expect(recordSpy).toHaveBeenCalledWith(
        'ct-cust-123',
        'deletePayment',
        { paymentMethodToken: 'pm-token-123' },
        { success: false, name: 'notFoundError', message: 'payment method not found' },
      );
    });

    test('rethrows when Braintree delete rejects', async () => {
      const cart = { ...mockCartForShippingUpdate(), customerId: 'ct-cust-123' };
      jest.spyOn(FastifyContext, 'getCartIdFromContext').mockReturnValue(cart.id);
      jest.spyOn(paymentSDK.ctCartService, 'getCart').mockResolvedValue(cart);
      (CommonConnect.deletePayment as jest.Mock).mockRejectedValue(new Error('Braintree error') as never);

      await expect(braintreePaymentService.deleteStoredPaymentMethod('pm-token-123')).rejects.toThrow(
        'Braintree error',
      );

      expect(paymentSDK.ctPaymentMethodService.delete).not.toHaveBeenCalled();
    });

    test('cart lookup failure alone does not fail the method', async () => {
      jest.spyOn(FastifyContext, 'getCartIdFromContext').mockReturnValue('cart-id');
      jest.spyOn(paymentSDK.ctCartService, 'getCart').mockRejectedValue(new Error('Cart not found'));

      // Should still succeed in deleting from Braintree — cart lookup failure is swallowed inline
      await expect(braintreePaymentService.deleteStoredPaymentMethod('pm-token-123')).resolves.toBeUndefined();
    });
  });

  describe('config', () => {
    const braintreePaymentService = new BraintreePaymentService(opts);

    test('happy path shape', async () => {
      jest.spyOn(paymentSDK.ctCartService, 'getCart').mockResolvedValue(mockCartForShippingUpdate() as never);

      const result = await braintreePaymentService.config();

      expect(result).toBeDefined();
      expect(result?.environment).toBeDefined();
      expect(result?.storedPaymentMethodsConfig).toEqual({ isEnabled: expect.any(Boolean) });
    });

    test('propagates when a dependency throws', async () => {
      jest.spyOn(Config, 'getConfig').mockImplementation(() => {
        throw new Error('Config error');
      });

      await expect(braintreePaymentService.config()).rejects.toThrow('Config error');
    });
  });

  describe('getShippingMethods', () => {
    const braintreePaymentService = new BraintreePaymentService(opts);

    // getShippingMethods calls paymentSDK.ctAPI.client.shippingMethods().get().execute() directly
    // — it has nothing to do with the Braintree gateway. paymentSDK.ctAPI.client is a
    // non-configurable getter, so it's mocked via manual save/restore, matching the
    // updateCartShipping describe block's mockCtClientCarts convention above.
    let savedClient: unknown;
    beforeEach(() => {
      savedClient = paymentSDK.ctAPI.client;
    });
    afterEach(() => {
      (paymentSDK.ctAPI as any).client = savedClient;
    });

    const mockShippingMethodsResolved = (results: unknown[]) => {
      const execute = jest.fn<() => Promise<any>>().mockResolvedValue({ body: { results } });
      const get = jest.fn().mockReturnValue({ execute });
      (paymentSDK.ctAPI as any).client = { shippingMethods: jest.fn().mockReturnValue({ get }) };
    };

    const mockShippingMethodsRejected = (reason: unknown) => {
      const execute = jest.fn<() => Promise<any>>().mockRejectedValue(reason);
      const get = jest.fn().mockReturnValue({ execute });
      (paymentSDK.ctAPI as any).client = { shippingMethods: jest.fn().mockReturnValue({ get }) };
    };

    test('happy path', async () => {
      mockShippingMethodsResolved([{ id: 'method-1', name: 'Standard' }]);

      const result = await braintreePaymentService.getShippingMethods('cart-123');

      expect(result).toEqual([{ id: 'method-1', name: 'Standard' }]);
    });

    test('returns undefined on 401 auth error', async () => {
      mockShippingMethodsRejected({ httpErrorStatus: 401 });

      const result = await braintreePaymentService.getShippingMethods('cart-123');

      expect(result).toBeUndefined();
    });

    test('returns undefined on other errors with warn log', async () => {
      mockShippingMethodsRejected(new Error('Other error'));

      const result = await braintreePaymentService.getShippingMethods('cart-123');

      expect(result).toBeUndefined();
    });
  });

  describe('getExpressClientToken', () => {
    const braintreePaymentService = new BraintreePaymentService(opts);

    test('happy path with resolvable cart/customer', async () => {
      const cart = { ...mockCartForShippingUpdate(), customerId: 'ct-cust-123' };
      jest.spyOn(FastifyContext, 'getCartIdFromContext').mockReturnValue(cart.id);
      jest.spyOn(paymentSDK.ctCartService, 'getCart').mockResolvedValue(cart);
      jest.spyOn(BraintreeCustomerService.prototype, 'getCtCustomer').mockResolvedValue({
        custom: { fields: { braintreeCustomerId: 'bt-cust-123' } },
      } as unknown as Customer);
      (CommonConnect.getClientToken as jest.Mock).mockResolvedValue('client-token-123' as never);

      const result = await braintreePaymentService.getExpressClientToken();

      expect(result).toEqual({
        braintreeData: { clientToken: 'client-token-123' },
      });
    });

    test('session without a cart: anonymous token, no cart lookup', async () => {
      jest.spyOn(FastifyContext, 'getCartIdFromContext').mockReturnValue(undefined);
      const getCartSpy = jest.spyOn(paymentSDK.ctCartService, 'getCart');
      (CommonConnect.getClientToken as jest.Mock).mockResolvedValue('anon-client-token' as never);

      const result = await braintreePaymentService.getExpressClientToken();

      expect(getCartSpy).not.toHaveBeenCalled();
      expect(result).toEqual({
        braintreeData: { clientToken: 'anon-client-token', braintreeCustomerId: undefined },
      });
    });

    test('cart lookup fails: fallback to anonymous', async () => {
      jest.spyOn(FastifyContext, 'getCartIdFromContext').mockReturnValue('cart-id');
      jest.spyOn(paymentSDK.ctCartService, 'getCart').mockRejectedValue(new Error('CT unavailable'));
      (CommonConnect.getClientToken as jest.Mock).mockResolvedValue('anon-client-token' as never);

      const result = await braintreePaymentService.getExpressClientToken();

      expect(result).toEqual({
        braintreeData: { clientToken: 'anon-client-token', braintreeCustomerId: undefined },
      });
    });

    test('cart with no customerId: getCtCustomer never called', async () => {
      const cart = { ...mockCartForShippingUpdate(), customerId: undefined };
      jest.spyOn(FastifyContext, 'getCartIdFromContext').mockReturnValue(cart.id);
      jest.spyOn(paymentSDK.ctCartService, 'getCart').mockResolvedValue(cart);
      const getCtCustomerSpy = jest.spyOn(BraintreeCustomerService.prototype, 'getCtCustomer');
      (CommonConnect.getClientToken as jest.Mock).mockResolvedValue('client-token' as never);

      const result = await braintreePaymentService.getExpressClientToken();

      expect(getCtCustomerSpy).not.toHaveBeenCalled();
      expect(result).toEqual({ braintreeData: { clientToken: 'client-token', braintreeCustomerId: undefined } });
    });
  });

  describe('createPayment', () => {
    const braintreePaymentService = new BraintreePaymentService(opts);

    const baseCart = () => ({
      ...mockGetCartResult(),
      customerEmail: 'buyer@example.com',
      billingAddress: { country: 'US' },
      shippingAddress: { country: 'US' },
    });

    const amountPlanned: CentPrecisionMoney = {
      type: 'centPrecision',
      currencyCode: 'USD',
      centAmount: 15000,
      fractionDigits: 2,
    };

    test('happy path: creates new payment (non-express, no existing customer)', async () => {
      const cart = { ...baseCart(), customerId: undefined };
      const newPayment = {
        ...mockGetPaymentResult,
        id: 'new-payment-id',
        amountPlanned,
        transactions: [],
        interfaceInteractions: [],
      };

      jest.spyOn(FastifyContext, 'getCartIdFromContext').mockReturnValue(cart.id);
      jest.spyOn(paymentSDK.ctCartService, 'getCart').mockResolvedValue(cart as never);
      jest.spyOn(paymentSDK.ctCartService, 'getPaymentAmount').mockResolvedValue(amountPlanned);
      jest.spyOn(paymentSDK.ctPaymentService, 'createPayment').mockResolvedValue(newPayment as never);
      const addPaymentSpy = jest.spyOn(paymentSDK.ctCartService, 'addPayment').mockResolvedValue(cart as never);
      jest.spyOn(paymentSDK.ctPaymentService, 'updatePayment').mockResolvedValue({} as never);
      (CommonConnect.getClientToken as jest.Mock).mockResolvedValue('new-client-token' as never);

      const result = await braintreePaymentService.createPayment({});

      expect(result.payment.ctPaymentId).toBe('new-payment-id');
      expect(result.braintreeData.clientToken).toBe('new-client-token');
      expect(addPaymentSpy).toHaveBeenCalled();
    });

    // the type is in the draft, so the token record is a setCustomField — never the SDK's setCustomType, which would
    // replace every custom field
    test('new payment: created with the Braintree type, the token recorded by setCustomField', async () => {
      const cart = { ...baseCart(), customerId: undefined };
      const newPayment = { ...mockGetPaymentResultWithoutTransactions, id: 'new-payment-id', amountPlanned };
      jest.spyOn(FastifyContext, 'getCartIdFromContext').mockReturnValue(cart.id);
      jest.spyOn(paymentSDK.ctCartService, 'getCart').mockResolvedValue(cart as never);
      jest.spyOn(paymentSDK.ctCartService, 'getPaymentAmount').mockResolvedValue(amountPlanned);
      const createPaymentSpy = jest
        .spyOn(paymentSDK.ctPaymentService, 'createPayment')
        .mockResolvedValue(newPayment as never);
      jest.spyOn(paymentSDK.ctCartService, 'addPayment').mockResolvedValue(cart as never);
      const updatePaymentSpy = jest.spyOn(paymentSDK.ctPaymentService, 'updatePayment');
      (CommonConnect.getClientToken as jest.Mock).mockResolvedValue('new-client-token' as never);

      await braintreePaymentService.createPayment({});

      expect(createPaymentSpy).toHaveBeenCalledWith(
        expect.objectContaining({ custom: { type: { typeId: 'type', key: 'braintree-payment-type' }, fields: {} } }),
      );
      expect(updatePaymentSpy).not.toHaveBeenCalled();
      expect(rawActions('setCustomType')).toEqual([]);
      expect(setCustomFieldWrites()).toEqual([
        {
          getClientTokenProcessorRequest: JSON.stringify({}),
          getClientTokenResponse: 'new-client-token',
        },
      ]);
      expect(rawActions('addInterfaceInteraction')).toHaveLength(2);
    });

    test("token fails: Braintree's answer recorded on the new payment, rejected", async () => {
      const cart = { ...baseCart(), customerId: undefined };
      const newPayment = { ...mockGetPaymentResultWithoutTransactions, id: 'new-payment-id', amountPlanned };
      jest.spyOn(FastifyContext, 'getCartIdFromContext').mockReturnValue(cart.id);
      jest.spyOn(paymentSDK.ctCartService, 'getCart').mockResolvedValue(cart as never);
      jest.spyOn(paymentSDK.ctCartService, 'getPaymentAmount').mockResolvedValue(amountPlanned);
      jest.spyOn(paymentSDK.ctPaymentService, 'createPayment').mockResolvedValue(newPayment as never);
      const addPaymentSpy = jest.spyOn(paymentSDK.ctCartService, 'addPayment');
      (CommonConnect.getClientToken as jest.Mock).mockRejectedValue(braintreeDeclineError() as never);

      await expect(braintreePaymentService.createPayment({})).rejects.toThrow('Declined');
      // the failure record is fire-and-forget
      await new Promise((resolve) => setImmediate(resolve));

      expect(addPaymentSpy).not.toHaveBeenCalled();
      expect(setCustomFieldWrites()).toEqual([
        {
          getClientTokenProcessorRequest: JSON.stringify({}),
          getClientTokenResponse: JSON.stringify(braintreeDecline),
        },
      ]);
    });

    // the cart's last payment, unchanged amount and no transactions — reusable unless it isn't this connector's
    const mockExistingPaymentOnCart = (existingPayment: Payment) => {
      const cart = {
        ...baseCart(),
        customerId: undefined,
        paymentInfo: { payments: [{ id: existingPayment.id, typeId: 'payment' }] },
      };
      jest.spyOn(FastifyContext, 'getCartIdFromContext').mockReturnValue(cart.id);
      jest.spyOn(paymentSDK.ctCartService, 'getCart').mockResolvedValue(cart as never);
      jest.spyOn(paymentSDK.ctCartService, 'getPaymentAmount').mockResolvedValue(amountPlanned);
      jest.spyOn(paymentSDK.ctPaymentService, 'getPayment').mockResolvedValue(existingPayment as never);
      jest.spyOn(paymentSDK.ctCartService, 'addPayment').mockResolvedValue(cart as never);
      jest.spyOn(paymentSDK.ctPaymentService, 'updatePayment').mockResolvedValue({} as never);
      (CommonConnect.getClientToken as jest.Mock).mockResolvedValue('client-token' as never);
    };
    const existingPaymentWith = (custom: Payment['custom']): Payment => ({
      ...mockGetPaymentResult,
      id: 'existing-payment-id',
      amountPlanned,
      transactions: [],
      custom,
    });
    const createStandardPayment = () => braintreePaymentService.createPayment({});

    // the reused payment already has the type: setCustomField only, its other fields stay
    test('reused-payment branch: reuses existing payment when amount unchanged and no transactions', async () => {
      const custom = braintreePaymentCustom({ BraintreeOrderId: 'order-1' });
      mockExistingPaymentOnCart(existingPaymentWith(custom));
      const createPaymentSpy = jest.spyOn(paymentSDK.ctPaymentService, 'createPayment');

      const result = await createStandardPayment();

      expect(createPaymentSpy).not.toHaveBeenCalled();
      expect(result.payment.ctPaymentId).toBe('existing-payment-id');
      expect(paymentSDK.ctPaymentService.updatePayment).not.toHaveBeenCalled();
      expect(rawActions('setCustomType')).toEqual([]);
      expect(setCustomFieldWrites()).toEqual([
        {
          getClientTokenProcessorRequest: JSON.stringify({}),
          getClientTokenResponse: 'client-token',
        },
      ]);
    });

    // the cart may hold another connector's payment (e.g. a gift card)
    test('existing payment with another custom type: not reused, a new payment is created', async () => {
      mockExistingPaymentOnCart(existingPaymentWith(otherTypeCustom()));
      const createPaymentSpy = jest.spyOn(paymentSDK.ctPaymentService, 'createPayment').mockResolvedValue({
        ...mockGetPaymentResultWithoutTransactions,
        id: 'new-payment-id',
        amountPlanned,
      } as never);

      const result = await createStandardPayment();

      expect(createPaymentSpy).toHaveBeenCalled();
      expect(result.payment.ctPaymentId).toBe('new-payment-id');
    });

    // the type id is cached per process, so the lookup itself is failed here, not getByKey
    test('type lookup fails: the existing payment is not reused, a new payment is created, logged as error', async () => {
      mockExistingPaymentOnCart(existingPaymentWith(braintreePaymentCustom()));
      jest.spyOn(CustomEntities, 'getBraintreePaymentTypeId').mockRejectedValue(new Error('unavailable'));
      const errorSpy = jest.spyOn(log, 'error').mockImplementation(() => log);
      jest.spyOn(paymentSDK.ctPaymentService, 'createPayment').mockResolvedValue({
        ...mockGetPaymentResultWithoutTransactions,
        id: 'new-payment-id',
        amountPlanned,
      } as never);

      const result = await createStandardPayment();

      expect(result.payment.ctPaymentId).toBe('new-payment-id');
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('could not look up the Braintree payment type'));
    });

    // every Braintree call is recorded, also a token fetched shortly after the last one
    test('records the client token also when one was recorded recently', async () => {
      const existingPayment = {
        ...mockGetPaymentResult,
        id: 'existing-payment-id',
        amountPlanned,
        transactions: [],
        interfaceInteractions: [{ fields: { type: 'getClientTokenResponse', timestamp: new Date().toISOString() } }],
      };
      const cart = {
        ...baseCart(),
        customerId: undefined,
        paymentInfo: { payments: [{ id: 'existing-payment-id', typeId: 'payment' }] },
      };

      jest.spyOn(FastifyContext, 'getCartIdFromContext').mockReturnValue(cart.id);
      jest.spyOn(paymentSDK.ctCartService, 'getCart').mockResolvedValue(cart as never);
      jest.spyOn(paymentSDK.ctCartService, 'getPaymentAmount').mockResolvedValue(amountPlanned);
      jest.spyOn(paymentSDK.ctPaymentService, 'getPayment').mockResolvedValue(existingPayment as never);
      (CommonConnect.getClientToken as jest.Mock).mockResolvedValue('reused-client-token' as never);

      await braintreePaymentService.createPayment({});

      expect(setCustomFieldWrites()).toEqual([
        expect.objectContaining({ getClientTokenResponse: 'reused-client-token' }),
      ]);
    });

    test('amount-mismatch: existing payment ref not reused when amount differs', async () => {
      const existingPayment = {
        ...mockGetPaymentResult,
        id: 'existing-payment-id',
        amountPlanned: { type: 'centPrecision', currencyCode: 'USD', centAmount: 9999, fractionDigits: 2 },
        transactions: [],
        interfaceInteractions: [],
      };
      const newPayment = {
        ...mockGetPaymentResult,
        id: 'new-payment-id',
        amountPlanned,
        transactions: [],
        interfaceInteractions: [],
      };
      const cart = {
        ...baseCart(),
        customerId: undefined,
        paymentInfo: { payments: [{ id: 'existing-payment-id', typeId: 'payment' }] },
      };

      jest.spyOn(FastifyContext, 'getCartIdFromContext').mockReturnValue(cart.id);
      jest.spyOn(paymentSDK.ctCartService, 'getCart').mockResolvedValue(cart as never);
      jest.spyOn(paymentSDK.ctCartService, 'getPaymentAmount').mockResolvedValue(amountPlanned);
      jest.spyOn(paymentSDK.ctPaymentService, 'getPayment').mockResolvedValue(existingPayment as never);
      const createPaymentSpy = jest
        .spyOn(paymentSDK.ctPaymentService, 'createPayment')
        .mockResolvedValue(newPayment as never);
      jest.spyOn(paymentSDK.ctCartService, 'addPayment').mockResolvedValue(cart as never);
      jest.spyOn(paymentSDK.ctPaymentService, 'updatePayment').mockResolvedValue({} as never);
      (CommonConnect.getClientToken as jest.Mock).mockResolvedValue('fresh-client-token' as never);

      const result = await braintreePaymentService.createPayment({});

      expect(createPaymentSpy).toHaveBeenCalled();
      expect(result.payment.ctPaymentId).toBe('new-payment-id');
    });

    test('express branch: fetches shipping methods, skips required-cart-data validation', async () => {
      // getShippingMethods (called internally for Express) uses the raw CT client directly —
      // paymentSDK.ctAPI.client is a non-configurable getter, so save/restore manually.
      const savedClient = paymentSDK.ctAPI.client;
      try {
        const cart = mockGetCartResult(); // no customerEmail/billingAddress/shippingAddress
        const newPayment = {
          ...mockGetPaymentResult,
          id: 'express-payment-id',
          amountPlanned,
          transactions: [],
          interfaceInteractions: [],
        };

        jest.spyOn(FastifyContext, 'getCartIdFromContext').mockReturnValue(cart.id);
        jest.spyOn(paymentSDK.ctCartService, 'getCart').mockResolvedValue(cart as never);
        jest.spyOn(paymentSDK.ctCartService, 'getPaymentAmount').mockResolvedValue(amountPlanned);
        jest.spyOn(paymentSDK.ctPaymentService, 'createPayment').mockResolvedValue(newPayment as never);
        jest.spyOn(paymentSDK.ctCartService, 'addPayment').mockResolvedValue(cart as never);
        jest.spyOn(paymentSDK.ctPaymentService, 'updatePayment').mockResolvedValue({} as never);
        (CommonConnect.getClientToken as jest.Mock).mockResolvedValue('express-token' as never);

        const execute = jest.fn<() => Promise<any>>().mockResolvedValue({ body: { results: [] } });
        const get = jest.fn().mockReturnValue({ execute });
        (paymentSDK.ctAPI as any).client = { shippingMethods: jest.fn().mockReturnValue({ get }) };

        const result = await braintreePaymentService.createPayment({
          builderType: 'express',
        } as never);

        expect(get).toHaveBeenCalled();
        expect(result.payment.ctPaymentId).toBe('express-payment-id');
      } finally {
        (paymentSDK.ctAPI as any).client = savedClient;
      }
    });

    test('non-express: throws when required cart data missing', async () => {
      const cart = mockGetCartResult(); // no customerEmail/billingAddress/shippingAddress

      jest.spyOn(FastifyContext, 'getCartIdFromContext').mockReturnValue(cart.id);
      jest.spyOn(paymentSDK.ctCartService, 'getCart').mockResolvedValue(cart as never);

      await expect(braintreePaymentService.createPayment({})).rejects.toThrow('Required data missing');
    });

    test('customer branch: forwards existing braintreeCustomerId', async () => {
      const cart = { ...baseCart(), customerId: 'ct-cust-1' };
      const newPayment = {
        ...mockGetPaymentResult,
        id: 'customer-payment-id',
        amountPlanned,
        transactions: [],
        interfaceInteractions: [],
      };

      jest.spyOn(FastifyContext, 'getCartIdFromContext').mockReturnValue(cart.id);
      jest.spyOn(paymentSDK.ctCartService, 'getCart').mockResolvedValue(cart as never);
      jest.spyOn(paymentSDK.ctCartService, 'getPaymentAmount').mockResolvedValue(amountPlanned);
      jest.spyOn(paymentSDK.ctPaymentService, 'createPayment').mockResolvedValue(newPayment as never);
      jest.spyOn(paymentSDK.ctCartService, 'addPayment').mockResolvedValue(cart as never);
      jest.spyOn(paymentSDK.ctPaymentService, 'updatePayment').mockResolvedValue({} as never);
      jest.spyOn(BraintreeCustomerService.prototype, 'getCtCustomer').mockResolvedValue({
        id: 'ct-cust-1',
        version: 1,
        custom: { fields: { braintreeCustomerId: 'bt-cust-1' } },
      } as unknown as Customer);
      (CommonConnect.getClientToken as jest.Mock).mockResolvedValue('customer-token' as never);

      const result = await braintreePaymentService.createPayment({});

      expect(CommonConnect.getClientToken).toHaveBeenCalledWith(expect.objectContaining({ customerId: 'bt-cust-1' }));
      expect(result.braintreeData.clientToken).toBe('customer-token');
    });

    test('rethrows when a dependency rejects', async () => {
      jest.spyOn(FastifyContext, 'getCartIdFromContext').mockReturnValue('cart-err');
      jest.spyOn(paymentSDK.ctCartService, 'getCart').mockRejectedValue(new Error('cart lookup failed'));

      await expect(braintreePaymentService.createPayment({})).rejects.toThrow('cart lookup failed');
    });
  });

  // PayPal Express's session may have no Cart before the click
  describe('session without a cart', () => {
    const braintreePaymentService = new BraintreePaymentService(opts);
    let getCartSpy: jest.SpiedFunction<typeof paymentSDK.ctCartService.getCart>;

    beforeEach(() => {
      jest.spyOn(FastifyContext, 'getCartIdFromContext').mockReturnValue(undefined);
      getCartSpy = jest.spyOn(paymentSDK.ctCartService, 'getCart');
    });

    test('stored payment methods are reported as disabled, without a cart lookup', async () => {
      jest
        .spyOn(StoredPaymentMethodsConfig, 'getStoredPaymentMethodsConfig')
        .mockReturnValue({ enabled: true, config: { paymentInterface: 'braintree' } });

      await expect(braintreePaymentService.isStoredPaymentMethodsEnabled()).resolves.toBe(false);
      expect(getCartSpy).not.toHaveBeenCalled();
    });

    test.each([
      {
        operation: 'createPayment',
        run: () =>
          braintreePaymentService.createPayment({
            builderType: 'express',
          } as never),
      },
      {
        operation: 'updateCartShipping',
        run: () =>
          braintreePaymentService.updateCartShipping({ ctPaymentId: 'payment-1', newShippingMethodId: 'method-1' }),
      },
      { operation: 'getStoredPaymentMethods', run: () => braintreePaymentService.getStoredPaymentMethods() },
    ])('$operation refuses with "no cart found"', async ({ run }) => {
      const result = run();

      await expect(result).rejects.toThrow(ErrorInvalidOperation);
      await expect(result).rejects.toThrow('no cart found for the checkout session');
      expect(getCartSpy).not.toHaveBeenCalled();
    });

    test('deleteStoredPaymentMethod refuses before the Braintree delete', async () => {
      await expect(braintreePaymentService.deleteStoredPaymentMethod('pm-token-123')).rejects.toThrow(
        'no cart found for the checkout session',
      );
      expect(CommonConnect.deletePayment).not.toHaveBeenCalled();
    });

    test.each([
      { flow: 'Express after a shipping change', braintreePaymentDetails: { expressShippingChanged: true } },
      { flow: 'without a shipping change', braintreePaymentDetails: undefined },
    ])('transactionSale ($flow) refuses before Braintree', async ({ braintreePaymentDetails }) => {
      jest.spyOn(paymentSDK.ctPaymentService, 'getPayment').mockResolvedValue(mockGetPaymentResult as never);

      await expect(
        braintreePaymentService.transactionSale({
          ctPaymentId: mockGetPaymentResult.id,
          paymentMethodType: PaymentMethodType.PAYPAL,
          paymentMethodNonce: 'fake-paypal-billing-agreement-nonce',
          braintreePaymentDetails,
        }),
      ).rejects.toThrow(`no cart found for ${mockGetPaymentResult.id}`);
      expect(CommonConnect.transactionSale).not.toHaveBeenCalled();
    });

    test('getAchVaultToken refuses before the Braintree vault', async () => {
      const vaultSpy = jest.spyOn(BraintreeCustomerService.prototype, 'vaultPaymentMethodForCustomer');

      await expect(
        braintreePaymentService.getAchVaultToken({
          ctPaymentId: 'payment-123',
          paymentMethodNonce: 'ach-nonce',
        }),
      ).rejects.toThrow('no cart found for payment-123');
      expect(vaultSpy).not.toHaveBeenCalled();
      expect(getCartSpy).not.toHaveBeenCalled();
    });
  });
});
