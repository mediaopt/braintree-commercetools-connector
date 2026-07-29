import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import {
  SessionHeaderAuthenticationHook,
  JWTAuthenticationHook,
  Oauth2AuthenticationHook,
  AuthorityAuthorizationHook,
} from '@commercetools/connect-payments-sdk';
import { errorHandler } from '../../src/libs/fastify/error-handler';
import { requestContextPlugin } from '../../src/libs/fastify/context/context';
import { operationsRoute } from '../../src/routes/operation.route';
import { AbstractPaymentService } from '../../src/services/abstract-payment.service';

jest.mock('common-connect/dist', () => ({
  ...(jest.requireActual('common-connect/dist') as object),
  getBraintreeGateway: jest.fn(),
}));

describe('operation.route', () => {
  let fastify: FastifyInstance;
  const mockPaymentService = {
    config: jest.fn(),
    status: jest.fn(),
    getSupportedPaymentComponents: jest.fn(),
    modifyPayment: jest.fn(),
  } as unknown as AbstractPaymentService;

  const buildApp = async (
    sessionHeaderAuthImpl: jest.Mock,
    jwtAuthImpl: jest.Mock,
    oauth2AuthImpl: jest.Mock,
    authorizationImpl: jest.Mock,
  ) => {
    const instance = Fastify();
    instance.setErrorHandler(errorHandler);
    await instance.register(requestContextPlugin);

    const sessionHeaderAuthHook = {
      authenticate: jest.fn().mockReturnValue(sessionHeaderAuthImpl),
    } as unknown as SessionHeaderAuthenticationHook;

    const jwtAuthHook = {
      authenticate: jest.fn().mockReturnValue(jwtAuthImpl),
    } as unknown as JWTAuthenticationHook;

    const oauth2AuthHook = {
      authenticate: jest.fn().mockReturnValue(oauth2AuthImpl),
    } as unknown as Oauth2AuthenticationHook;

    const authorizationHook = {
      authorize: jest.fn().mockReturnValue(authorizationImpl),
    } as unknown as AuthorityAuthorizationHook;

    await instance.register(operationsRoute, {
      paymentService: mockPaymentService,
      sessionHeaderAuthHook,
      jwtAuthHook,
      oauth2AuthHook,
      authorizationHook,
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

  describe('GET /config', () => {
    test('returns 200 with config response when SessionHeaderAuth succeeds', async () => {
      const sessionHeaderAuthImpl = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
      const jwtAuthImpl = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
      const oauth2AuthImpl = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
      const authorizationImpl = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
      fastify = await buildApp(sessionHeaderAuthImpl, jwtAuthImpl, oauth2AuthImpl, authorizationImpl);

      const mockConfig = {
        clientKey: 'test-key',
        environment: 'sandbox',
      };

      (mockPaymentService.config as any).mockResolvedValue(mockConfig);

      const response = await fastify.inject({
        method: 'GET',
        url: '/config',
        headers: { 'x-session-id': 'session-123' },
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toEqual(mockConfig);
    });

    test('returns non-200 when SessionHeaderAuth fails', async () => {
      const sessionHeaderAuthImpl = jest.fn().mockImplementation(async () => {
        throw new Error('Auth failed');
      });
      const jwtAuthImpl = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
      const oauth2AuthImpl = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
      const authorizationImpl = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
      fastify = await buildApp(sessionHeaderAuthImpl, jwtAuthImpl, oauth2AuthImpl, authorizationImpl);

      const response = await fastify.inject({
        method: 'GET',
        url: '/config',
      });

      expect(response.statusCode).not.toBe(200);
    });
  });

  describe('GET /status', () => {
    test('returns 200 with status response when JWTAuth succeeds', async () => {
      const sessionHeaderAuthImpl = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
      const jwtAuthImpl = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
      const oauth2AuthImpl = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
      const authorizationImpl = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
      fastify = await buildApp(sessionHeaderAuthImpl, jwtAuthImpl, oauth2AuthImpl, authorizationImpl);

      const mockStatus = {
        status: 'UP',
        timestamp: '2024-01-01T00:00:00.000Z',
        version: '1.0.0',
        checks: [],
      };

      (mockPaymentService.status as any).mockResolvedValue(mockStatus);

      const response = await fastify.inject({
        method: 'GET',
        url: '/status',
        headers: { authorization: 'Bearer token' },
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toEqual(mockStatus);
    });

    test('returns non-200 when JWTAuth fails', async () => {
      const sessionHeaderAuthImpl = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
      const jwtAuthImpl = jest.fn().mockImplementation(async () => {
        throw new Error('JWT validation failed');
      });
      const oauth2AuthImpl = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
      const authorizationImpl = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
      fastify = await buildApp(sessionHeaderAuthImpl, jwtAuthImpl, oauth2AuthImpl, authorizationImpl);

      const response = await fastify.inject({
        method: 'GET',
        url: '/status',
      });

      expect(response.statusCode).not.toBe(200);
    });
  });

  describe('GET /payment-components', () => {
    test('returns 200 with payment components when JWTAuth succeeds', async () => {
      const sessionHeaderAuthImpl = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
      const jwtAuthImpl = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
      const oauth2AuthImpl = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
      const authorizationImpl = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
      fastify = await buildApp(sessionHeaderAuthImpl, jwtAuthImpl, oauth2AuthImpl, authorizationImpl);

      const mockComponents = {
        components: [{ type: 'CreditCard' }],
        express: [{ type: 'PayPal' }],
        dropins: [],
      };

      (mockPaymentService.getSupportedPaymentComponents as any).mockResolvedValue(mockComponents);

      const response = await fastify.inject({
        method: 'GET',
        url: '/payment-components',
        headers: { authorization: 'Bearer token' },
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toEqual(mockComponents);
    });
  });

  describe('POST /payment-intents/:id', () => {
    test('returns 200 when both OAuth2 and Authorization succeed', async () => {
      const sessionHeaderAuthImpl = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
      const jwtAuthImpl = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
      const oauth2AuthImpl = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
      const authorizationImpl = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
      fastify = await buildApp(sessionHeaderAuthImpl, jwtAuthImpl, oauth2AuthImpl, authorizationImpl);

      const mockResponse = { success: true, message: 'Payment payment-123 successful' };

      (mockPaymentService.modifyPayment as any).mockResolvedValue(mockResponse);

      const response = await fastify.inject({
        method: 'POST',
        url: '/payment-intents/payment-123',
        payload: {
          actions: [{ action: 'capturePayment', amount: { centAmount: 1000, currencyCode: 'USD' } }],
        },
        headers: { authorization: 'Bearer token' },
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toEqual(mockResponse);
    });

    test('returns non-200 when OAuth2 authentication fails', async () => {
      const sessionHeaderAuthImpl = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
      const jwtAuthImpl = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
      const oauth2AuthImpl = jest.fn().mockImplementation(async () => {
        throw new Error('OAuth2 validation failed');
      });
      const authorizationImpl = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
      fastify = await buildApp(sessionHeaderAuthImpl, jwtAuthImpl, oauth2AuthImpl, authorizationImpl);

      const response = await fastify.inject({
        method: 'POST',
        url: '/payment-intents/payment-123',
        payload: {
          actions: [{ action: 'capturePayment', amount: { centAmount: 1000, currencyCode: 'USD' } }],
        },
      });

      expect(response.statusCode).not.toBe(200);
    });

    test('returns non-200 when Authorization is rejected', async () => {
      const sessionHeaderAuthImpl = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
      const jwtAuthImpl = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
      const oauth2AuthImpl = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
      const authorizationImpl = jest.fn().mockImplementation(async () => {
        throw new Error('Authorization failed');
      });
      fastify = await buildApp(sessionHeaderAuthImpl, jwtAuthImpl, oauth2AuthImpl, authorizationImpl);

      const response = await fastify.inject({
        method: 'POST',
        url: '/payment-intents/payment-123',
        payload: {
          actions: [{ action: 'capturePayment', amount: { centAmount: 1000, currencyCode: 'USD' } }],
        },
        headers: { authorization: 'Bearer token' },
      });

      expect(response.statusCode).not.toBe(200);
    });

    test('passes payment ID and request body to service', async () => {
      const sessionHeaderAuthImpl = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
      const jwtAuthImpl = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
      const oauth2AuthImpl = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
      const authorizationImpl = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
      fastify = await buildApp(sessionHeaderAuthImpl, jwtAuthImpl, oauth2AuthImpl, authorizationImpl);

      (mockPaymentService.modifyPayment as any).mockResolvedValue({ success: true, message: 'ok' });

      const payload = {
        actions: [{ action: 'capturePayment' as const, amount: { centAmount: 5000, currencyCode: 'EUR' } }],
      };

      await fastify.inject({
        method: 'POST',
        url: '/payment-intents/specific-payment-id',
        payload,
        headers: { authorization: 'Bearer token' },
      });

      expect(mockPaymentService.modifyPayment).toHaveBeenCalledWith({
        paymentId: 'specific-payment-id',
        data: payload,
      });
    });
  });
});
