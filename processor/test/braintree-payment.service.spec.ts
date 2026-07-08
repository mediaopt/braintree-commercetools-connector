import { describe, test, expect, afterEach, jest, beforeEach } from '@jest/globals';
import { ConfigResponse } from '../src/services/types/operation.type';
import { paymentSDK } from '../src/payment-sdk';
import { PaymentMethodType, LocalPaymentMethodType } from '../src/dtos/braintree-payment.dto';
import { mockGetPaymentResult } from './utils/mock-payment-results';
import { mockBraintreeTransaction } from './utils/mock-payment-data';

// transactionSale is exported as a non-configurable ES module binding; jest.spyOn cannot
// replace it. We must use jest.mock with a factory so Jest swaps the module before imports run.
jest.mock('common-connect/dist', () => ({
  ...(jest.requireActual('common-connect/dist') as object),
  transactionSale: jest.fn(),
}));
import * as CommonConnect from 'common-connect/dist';
// import { DefaultPaymentService } from '@commercetools/connect-payments-sdk/dist/commercetools/services/ct-payment.service';
// import { DefaultCartService } from '@commercetools/connect-payments-sdk/dist/commercetools/services/ct-cart.service';
// import {
//   mockGetPaymentResult,
//   mockGetPaymentResultWithoutTransactions,
//   mockUpdatePaymentResult,
//   mockUpdatePaymentResultWithRefundTransaction,
// } from './utils/mock-payment-results';
// import { mockGetCartResult } from './utils/mock-cart-data';
import { Cart } from '@commercetools/connect-payments-sdk';
import { CentPrecisionMoney } from '@commercetools/platform-sdk';
import { mockCartForShippingUpdate, mockCartWithExternalTax } from './utils/mock-cart-data';
import * as Config from '../src/config/config';
import { BraintreePaymentServiceOptions } from '../src/services/types/braintree-payment.type';
import { AbstractPaymentService } from '../src/services/abstract-payment.service';
import { BraintreePaymentService } from '../src/services/braintree-payment.service';
import * as FastifyContext from '../src/libs/fastify/context/context';
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
  beforeEach(() => {
    jest.setTimeout(10000);
    jest.resetAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

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

    const mockClient = (cart: Cart) => {
      (paymentSDK.ctAPI as any).client = { carts: mockCtClientCarts(cart) };
    };

    test('standard cart (platform tax): taxTotal is 0.00, itemTotal derived correctly', async () => {
      const cart = mockCartForShippingUpdate();
      const paymentAmount: CentPrecisionMoney = {
        type: 'centPrecision',
        currencyCode: 'USD',
        centAmount: 20000,
        fractionDigits: 2,
      };

      jest.spyOn(FastifyContext, 'getCartIdFromContext').mockReturnValue(cart.id);
      jest.spyOn(paymentSDK.ctCartService, 'getCart').mockResolvedValue(cart);
      jest.spyOn(paymentSDK.ctCartService, 'getPaymentAmount').mockResolvedValue(paymentAmount);
      mockClient(cart);

      const result = await braintreePaymentService.updateCartShipping({ newShippingMethodId: 'method-1' });

      expect(result.braintreeAmount).toBe('200.00');
      expect(result.amountBreakdown.shipping).toBe('20.00');
      expect(result.amountBreakdown.discount).toBe('0.00');
      expect(result.amountBreakdown.taxTotal).toBe('0.00');
      // itemTotal = 200.00 - 20.00 + 0.00 - 0.00
      expect(result.amountBreakdown.itemTotal).toBe('180.00');
      expect(result.amountBreakdown.handling).toBe('0.00');
      expect(result.amountBreakdown.insurance).toBe('0.00');
      expect(result.amountBreakdown.shippingDiscount).toBe('0.00');
    });

    test('external tax cart: taxTotal reflects taxedPrice.totalTax, itemTotal derived correctly', async () => {
      const cart = mockCartWithExternalTax();
      const paymentAmount: CentPrecisionMoney = {
        type: 'centPrecision',
        currencyCode: 'USD',
        centAmount: 20000,
        fractionDigits: 2,
      };

      jest.spyOn(FastifyContext, 'getCartIdFromContext').mockReturnValue(cart.id);
      jest.spyOn(paymentSDK.ctCartService, 'getCart').mockResolvedValue(cart);
      jest.spyOn(paymentSDK.ctCartService, 'getPaymentAmount').mockResolvedValue(paymentAmount);
      mockClient(cart);

      const result = await braintreePaymentService.updateCartShipping({ newShippingMethodId: 'method-2' });

      expect(result.braintreeAmount).toBe('200.00');
      expect(result.amountBreakdown.shipping).toBe('10.00'); // $10.00 shippingInfo
      expect(result.amountBreakdown.discount).toBe('5.00'); // $5.00 discount
      expect(result.amountBreakdown.taxTotal).toBe('20.00'); // $20.00 from taxedPrice.totalTax
      // itemTotal = 200.00 - 10.00 + 5.00 - 20.00
      expect(result.amountBreakdown.itemTotal).toBe('175.00');
    });

    test('cart without shippingInfo: shipping is 0.00', async () => {
      const cart: Cart = { ...mockCartForShippingUpdate(), shippingInfo: undefined };
      const paymentAmount: CentPrecisionMoney = {
        type: 'centPrecision',
        currencyCode: 'USD',
        centAmount: 20000,
        fractionDigits: 2,
      };

      jest.spyOn(FastifyContext, 'getCartIdFromContext').mockReturnValue(cart.id);
      jest.spyOn(paymentSDK.ctCartService, 'getCart').mockResolvedValue(cart);
      jest.spyOn(paymentSDK.ctCartService, 'getPaymentAmount').mockResolvedValue(paymentAmount);
      mockClient(cart);

      const result = await braintreePaymentService.updateCartShipping({ newShippingMethodId: 'method-3' });

      expect(result.amountBreakdown.shipping).toBe('0.00');
      expect(result.amountBreakdown.itemTotal).toBe('200.00'); // itemTotal = 200 - 0 + 0 - 0
    });

    test('ExternalAmount taxMode without taxedPrice: taxTotal is 0.00', async () => {
      const cart: Cart = { ...mockCartForShippingUpdate(), taxMode: 'ExternalAmount', taxedPrice: undefined };
      const paymentAmount: CentPrecisionMoney = {
        type: 'centPrecision',
        currencyCode: 'USD',
        centAmount: 20000,
        fractionDigits: 2,
      };

      jest.spyOn(FastifyContext, 'getCartIdFromContext').mockReturnValue(cart.id);
      jest.spyOn(paymentSDK.ctCartService, 'getCart').mockResolvedValue(cart);
      jest.spyOn(paymentSDK.ctCartService, 'getPaymentAmount').mockResolvedValue(paymentAmount);
      mockClient(cart);

      const result = await braintreePaymentService.updateCartShipping({ newShippingMethodId: 'method-4' });

      expect(result.amountBreakdown.taxTotal).toBe('0.00');
    });
  });

  describe('getSupportedPaymentComponents', () => {
    // Values are commercetools icon keys (see utils/paymentMethodIcon.utils.ts), not our own
    // PaymentMethodType values — ACH/Venmo/mybank have no commercetools equivalent so they're
    // unchanged; bancontact/p24 differ from our own naming (bancontactcard/przelewy24).
    const expectedLocalTypes = ['bancontactcard', 'blik', 'eps', 'ideal', 'mybank', 'przelewy24'];
    const expectedBaseTypesLoggedIn = ['ACH', 'applepay', 'card', 'googlepay', 'paypal', 'Venmo'];
    const expectedBaseTypesAnonymous = ['applepay', 'card', 'googlepay', 'paypal', 'Venmo'];
    const expectedExpressTypes = ['paypal']; // PayPalVault and CreditCardVault are PURE_VAULT_DISABLED

    const cartWithCustomer = { ...mockCartForShippingUpdate(), customerId: 'ct-customer-123' };
    const cartAnonymous = { ...mockCartForShippingUpdate(), customerId: undefined };

    test('logged-in customer — ACH included in base components', async () => {
      jest.spyOn(FastifyContext, 'getCartIdFromContext').mockReturnValue(cartWithCustomer.id);
      jest.spyOn(paymentSDK.ctCartService, 'getCart').mockResolvedValue(cartWithCustomer);
      const result: ConfigResponse = await paymentService.getSupportedPaymentComponents();
      const components = result?.components;
      expect((components as { type: string }[])?.map(({ type }) => type)).toEqual(expectedBaseTypesLoggedIn);
      expect(result?.dropins).toHaveLength(0);
      expect((result?.express as { type: string }[]).map(({ type }) => type)).toEqual(expectedExpressTypes);
    });

    test('anonymous session — ACH excluded from base components', async () => {
      jest.spyOn(FastifyContext, 'getCartIdFromContext').mockReturnValue(cartAnonymous.id);
      jest.spyOn(paymentSDK.ctCartService, 'getCart').mockResolvedValue(cartAnonymous as Cart);
      const result: ConfigResponse = await paymentService.getSupportedPaymentComponents();
      expect((result?.components as { type: string }[])?.map(({ type }) => type)).toEqual(expectedBaseTypesAnonymous);
    });

    test('without merchant account — returns base components only', async () => {
      jest.spyOn(FastifyContext, 'getCartIdFromContext').mockReturnValue(cartWithCustomer.id);
      jest.spyOn(paymentSDK.ctCartService, 'getCart').mockResolvedValue(cartWithCustomer);
      const result: ConfigResponse = await paymentService.getSupportedPaymentComponents();
      const components = result?.components;
      expect((components as { type: string }[])?.map(({ type }) => type)).toEqual(expectedBaseTypesLoggedIn);
      expect(result?.dropins).toHaveLength(0);
      expect((result?.express as { type: string }[]).map(({ type }) => type)).toEqual(expectedExpressTypes);
    });

    test('with merchant account — returns base + local payment components', async () => {
      jest.spyOn(Config, 'getConfig').mockReturnValueOnce({ ...Config.getConfig(), merchantAccountId: 'test-merchant-account' });
      jest.spyOn(FastifyContext, 'getCartIdFromContext').mockReturnValue(cartWithCustomer.id);
      jest.spyOn(paymentSDK.ctCartService, 'getCart').mockResolvedValue(cartWithCustomer);
      const result: ConfigResponse = await paymentService.getSupportedPaymentComponents();
      const components = result?.components;
      expect((components as { type: string }[])?.map(({ type }) => type)).toEqual([
        ...expectedBaseTypesLoggedIn,
        ...expectedLocalTypes,
      ]);
      expect(result?.dropins).toHaveLength(0);
      expect((result?.express as { type: string }[]).map(({ type }) => type)).toEqual(expectedExpressTypes);
    });
  });

  describe('transactionSale', () => {
    const braintreePaymentService = new BraintreePaymentService(opts);

    beforeEach(() => {
      (CommonConnect.transactionSale as jest.Mock).mockResolvedValue(mockBraintreeTransaction as never);
      jest.spyOn(paymentSDK.ctPaymentService, 'getPayment').mockResolvedValue(mockGetPaymentResult as never);
      jest.spyOn(paymentSDK.ctPaymentService, 'updatePayment').mockResolvedValue({} as never);
    });

    const baseRequest = { ctPaymentId: mockGetPaymentResult.id };

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
      const shipping = { firstName: 'Jane', lastName: 'Doe', streetAddress: '1 Main St', locality: 'Berlin', region: 'BE', postalCode: '10115', countryCodeAlpha2: 'DE' };
      await braintreePaymentService.transactionSale({
        ...baseRequest,
        paymentMethodType: PaymentMethodType.CREDIT_CARD,
        paymentMethodNonce: 'fake-valid-nonce',
        braintreePaymentDetails: { braintreeShipping: shipping },
      });
      expect(CommonConnect.transactionSale).toHaveBeenCalledWith(
        expect.objectContaining({ shipping }),
      );
    });

    test('CreditCardStored: forwards paymentToken, no nonce', async () => {
      await braintreePaymentService.transactionSale({
        ...baseRequest,
        paymentMethodType: PaymentMethodType.CREDIT_CARD_STORED,
        paymentToken: 'stored-card-token',
        braintreeCustomerId: 'bt-customer-123',
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

    test('Local payment (ideal): sets submitForSettlement', async () => {
      await braintreePaymentService.transactionSale({
        ...baseRequest,
        paymentMethodType: LocalPaymentMethodType.IDEAL as unknown as PaymentMethodType,
        paymentMethodNonce: 'fake-local-payment-nonce',
        localPaymentId: 'local-payment-id-123',
      });
      expect(CommonConnect.transactionSale).toHaveBeenCalledWith(
        expect.objectContaining({
          paymentMethodNonce: 'fake-local-payment-nonce',
          options: expect.objectContaining({ submitForSettlement: true }),
        }),
      );
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
});
