import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import { SessionHeaderAuthenticationHook } from '@commercetools/connect-payments-sdk';
import { errorHandler } from '../../src/libs/fastify/error-handler';
import { requestContextPlugin } from '../../src/libs/fastify/context/context';
import { paymentRoutes } from '../../src/routes/braintree-payment.route';
import { BraintreePaymentService } from '../../src/services/braintree-payment.service';

jest.mock('common-connect/dist', () => ({
  ...(jest.requireActual('common-connect/dist') as object),
  transactionSale: jest.fn(),
  getBraintreeGateway: jest.fn(),
}));

describe('braintree-payment.route', () => {
  let fastify: FastifyInstance;
  const mockPaymentService = {
    createPayment: jest.fn(),
    transactionSale: jest.fn(),
    updateCartShipping: jest.fn(),
    getExpressClientToken: jest.fn(),
    getStoredPaymentMethods: jest.fn(),
    deleteStoredPaymentMethod: jest.fn(),
    getAchVaultToken: jest.fn(),
  } as unknown as BraintreePaymentService;

  const buildApp = async (authenticateImpl: jest.Mock) => {
    const instance = Fastify();
    instance.setErrorHandler(errorHandler);
    await instance.register(requestContextPlugin);

    const sessionHeaderAuthHook = {
      authenticate: jest.fn().mockReturnValue(authenticateImpl),
    } as unknown as SessionHeaderAuthenticationHook;

    await instance.register(paymentRoutes, {
      paymentService: mockPaymentService,
      sessionHeaderAuthHook,
    });

    return instance;
  };

  beforeEach(() => {
    jest.setTimeout(10000);
    jest.resetAllMocks();
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await fastify.close();
  });

  describe('POST /payments', () => {
    test('returns 200 with payment response when auth succeeds', async () => {
      const authenticateImpl = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
      fastify = await buildApp(authenticateImpl);

      const mockResponse = {
        braintreeData: { clientToken: 'token-123' },
        payment: { ctPaymentId: 'payment-123', braintreeAmount: 100, currency: 'USD' },
      };

      (mockPaymentService.createPayment as any).mockResolvedValue(mockResponse);

      const response = await fastify.inject({
        method: 'POST',
        url: '/payments',
        payload: {
          paymentMethodType: 'CreditCard',
          currency: 'USD',
        },
        headers: { 'x-session-id': 'session-123' },
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toEqual(mockResponse);
    });

    test('returns non-200 when session auth throws', async () => {
      const authenticateImpl = jest.fn().mockImplementation(async () => {
        throw new Error('Auth failed');
      });
      fastify = await buildApp(authenticateImpl);

      const response = await fastify.inject({
        method: 'POST',
        url: '/payments',
        payload: {
          paymentMethodType: 'CreditCard',
          currency: 'USD',
        },
      });

      expect(response.statusCode).not.toBe(200);
    });
  });

  describe('POST /payments/transactionSale', () => {
    test('returns 200 with payment update response', async () => {
      const authenticateImpl = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
      fastify = await buildApp(authenticateImpl);

      const mockResponse = { success: true, message: 'Payment payment-123 successful' };

      (mockPaymentService.transactionSale as any).mockResolvedValue(mockResponse);

      const response = await fastify.inject({
        method: 'POST',
        url: '/payments/transactionSale',
        payload: {
          ctPaymentId: 'payment-123',
          paymentMethodNonce: 'nonce-123',
          paymentMethodType: 'CreditCard',
        },
        headers: { 'x-session-id': 'session-123' },
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toEqual(mockResponse);
    });
  });

  describe('GET /payments/expressClientToken', () => {
    test('returns 200 when auth succeeds', async () => {
      const authenticateImpl = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
      fastify = await buildApp(authenticateImpl);

      const mockResponse = { braintreeData: { clientToken: 'express-client-token-123' } };

      (mockPaymentService.getExpressClientToken as any).mockResolvedValue(mockResponse);

      const response = await fastify.inject({
        method: 'GET',
        url: '/payments/expressClientToken',
        headers: { 'x-session-id': 'session-123' },
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body).braintreeData.clientToken).toBe('express-client-token-123');
    });

    test('returns 200 even when auth throws (catches internally)', async () => {
      const authenticateImpl = jest.fn().mockImplementation(async () => {
        throw new Error('Auth failed');
      });
      fastify = await buildApp(authenticateImpl);

      const mockResponse = { braintreeData: { clientToken: 'anon-client-token-456' } };

      (mockPaymentService.getExpressClientToken as any).mockResolvedValue(mockResponse);

      const response = await fastify.inject({
        method: 'GET',
        url: '/payments/expressClientToken',
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body).braintreeData.clientToken).toBe('anon-client-token-456');
    });

    test('service call still reached even when auth throws', async () => {
      const authenticateImpl = jest.fn().mockImplementation(async () => {
        throw new Error('Auth failed');
      });
      fastify = await buildApp(authenticateImpl);

      (mockPaymentService.getExpressClientToken as any).mockResolvedValue({
        braintreeData: { clientToken: 'fallback-token' },
      });

      await fastify.inject({
        method: 'GET',
        url: '/payments/expressClientToken',
      });

      expect(mockPaymentService.getExpressClientToken).toHaveBeenCalled();
    });
  });

  describe('GET /stored-payment-methods', () => {
    test('returns 200 with stored payment methods', async () => {
      const authenticateImpl = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
      fastify = await buildApp(authenticateImpl);

      const mockMethods = {
        storedPaymentMethods: [
          {
            id: 'pm-1',
            type: 'CreditCard',
            token: 'token-123',
            isDefault: true,
            createdAt: '2024-01-01T00:00:00Z',
            displayOptions: { endDigits: '1234', brand: { key: 'Visa' } },
          },
        ],
      };

      (mockPaymentService.getStoredPaymentMethods as any).mockResolvedValue(mockMethods);

      const response = await fastify.inject({
        method: 'GET',
        url: '/stored-payment-methods',
        headers: { 'x-session-id': 'session-123' },
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toEqual(mockMethods);
    });

    test('returns non-200 when auth fails', async () => {
      const authenticateImpl = jest.fn().mockImplementation(async () => {
        throw new Error('Auth failed');
      });
      fastify = await buildApp(authenticateImpl);

      const response = await fastify.inject({
        method: 'GET',
        url: '/stored-payment-methods',
      });

      expect(response.statusCode).not.toBe(200);
    });
  });

  describe('DELETE /stored-payment-methods/:id', () => {
    test('returns 200 when deletion succeeds', async () => {
      const authenticateImpl = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
      fastify = await buildApp(authenticateImpl);

      (mockPaymentService.deleteStoredPaymentMethod as any).mockResolvedValue(undefined);

      const response = await fastify.inject({
        method: 'DELETE',
        url: '/stored-payment-methods/pm-token-123',
        headers: { 'x-session-id': 'session-123' },
      });

      expect(response.statusCode).toBe(200);
      expect(mockPaymentService.deleteStoredPaymentMethod).toHaveBeenCalledWith('pm-token-123');
    });
  });

  describe('POST /payments/getAchVaultToken', () => {
    test('returns 200 with ACH vault token response', async () => {
      const authenticateImpl = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
      fastify = await buildApp(authenticateImpl);

      const mockResponse = { token: 'ach-token-123', verified: true };

      (mockPaymentService.getAchVaultToken as any).mockResolvedValue(mockResponse);

      const response = await fastify.inject({
        method: 'POST',
        url: '/payments/getAchVaultToken',
        payload: {
          ctPaymentId: 'payment-123',
          paymentMethodNonce: 'ach-nonce',
          braintreeCustomerId: 'bt-cust-123',
        },
        headers: { 'x-session-id': 'session-123' },
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toEqual(mockResponse);
    });

    test('passes request body to service', async () => {
      const authenticateImpl = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
      fastify = await buildApp(authenticateImpl);

      (mockPaymentService.getAchVaultToken as any).mockResolvedValue({ token: 'test', verified: true });

      const payload = {
        ctPaymentId: 'payment-456',
        paymentMethodNonce: 'nonce-456',
        ctCustomerId: 'ct-cust-456',
      };

      await fastify.inject({
        method: 'POST',
        url: '/payments/getAchVaultToken',
        payload,
        headers: { 'x-session-id': 'session-123' },
      });

      expect(mockPaymentService.getAchVaultToken).toHaveBeenCalledWith(expect.objectContaining(payload));
    });
  });
});
