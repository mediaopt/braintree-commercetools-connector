import { SessionHeaderAuthenticationHook } from '@commercetools/connect-payments-sdk';
import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import {
  InitPaymentRequestSchema,
  PaymentRequestSchemaDTO,
  InitPaymentResponseSchema,
  PaymentResponseSchemaDTO,
  TransactionSaleRequestSchema,
  TransactionSaleRequestSchemaDTO,
  // PURE_VAULT_DISABLED: PureVaultRequestSchema,
  PaymentUpdateResponseSchema,
  // PURE_VAULT_DISABLED: PureVaultRequestSchemaDTO,
  PaymentUpdateResponseSchemaDTO,
  UpdateCartShippingResponseSchema,
  UpdateCartShippingResponseSchemaDTO,
  UpdateCartShippingRequestSchema,
  UpdateCartShippingRequestSchemaDTO,
  AchVaultTokenRequestSchema,
  AchVaultTokenRequestSchemaDTO,
  AchVaultTokenResponseSchema,
  AchVaultTokenResponseSchemaDTO,
  ExpressClientTokenResponseSchema,
  ExpressClientTokenResponseSchemaDTO,
} from '../dtos/braintree-payment.dto';
import { StoredPaymentMethodsResponseSchema, StoredPaymentMethodsResponse } from '../dtos/stored-payment-methods.dto';
import { BraintreePaymentService } from '../services/braintree-payment.service';
import { Type } from '@sinclair/typebox';

type PaymentRoutesOptions = {
  paymentService: BraintreePaymentService;
  sessionHeaderAuthHook: SessionHeaderAuthenticationHook;
};

export const paymentRoutes = async (fastify: FastifyInstance, opts: FastifyPluginOptions & PaymentRoutesOptions) => {
  fastify.post<{ Body: PaymentRequestSchemaDTO; Reply: PaymentResponseSchemaDTO }>(
    '/payments',
    {
      preHandler: [opts.sessionHeaderAuthHook.authenticate()],
      schema: {
        body: InitPaymentRequestSchema,
        response: {
          200: InitPaymentResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const resp = await opts.paymentService.createPayment(request.body);
      return reply.status(200).send(resp);
    },
  );

  fastify.post<{
    Body: TransactionSaleRequestSchemaDTO;
    Reply: PaymentUpdateResponseSchemaDTO;
  }>(
    '/payments/transactionSale',
    {
      preHandler: [opts.sessionHeaderAuthHook.authenticate()],
      schema: {
        body: TransactionSaleRequestSchema,
        response: {
          200: PaymentUpdateResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const paymentUpdateResult = await opts.paymentService.transactionSale(request.body);
      return reply.status(200).send(paymentUpdateResult);
    },
  );

  fastify.post<{
    Body: UpdateCartShippingRequestSchemaDTO;
    Reply: UpdateCartShippingResponseSchemaDTO;
  }>(
    '/payments/updateCartShipping',
    {
      preHandler: [opts.sessionHeaderAuthHook.authenticate()],
      schema: {
        body: UpdateCartShippingRequestSchema,
        response: {
          200: UpdateCartShippingResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const result = await opts.paymentService.updateCartShipping(request.body);
      return reply.status(200).send(result);
    },
  );

  fastify.get<{ Reply: ExpressClientTokenResponseSchemaDTO }>(
    '/payments/expressClientToken',
    {
      // No preHandler: unlike every other /payments/* route, a cart-bound session is not required
      // here — a Braintree client token alone is safe to issue anonymously. We still attempt the
      // SDK's normal session auth below so a cart-bound session gets the customer-aware token
      // an invalid or cart-less session just falls back to an anonymous
      // one instead of failing the request.
      schema: {
        response: {
          200: ExpressClientTokenResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        await opts.sessionHeaderAuthHook.authenticate()(request);
      } catch {
        // No cart-bound (or no valid) session — getExpressClientToken() falls back to anonymous.
      }
      const result = await opts.paymentService.getExpressClientToken();
      return reply.status(200).send(result);
    },
  );

  fastify.get<{ Reply: StoredPaymentMethodsResponse }>(
    '/stored-payment-methods',
    {
      preHandler: [opts.sessionHeaderAuthHook.authenticate()],
      schema: {
        response: {
          200: StoredPaymentMethodsResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const result = await opts.paymentService.getStoredPaymentMethods();
      return reply.status(200).send(result);
    },
  );

  fastify.delete<{ Params: { id: string } }>(
    '/stored-payment-methods/:id',
    {
      preHandler: [opts.sessionHeaderAuthHook.authenticate()],
      schema: {
        params: Type.Object({ id: Type.String() }),
        response: { 200: Type.Object({}) },
      },
    },
    async (request, reply) => {
      await opts.paymentService.deleteStoredPaymentMethod(request.params.id);
      return reply.status(200).send({});
    },
  );

  fastify.post<{ Body: AchVaultTokenRequestSchemaDTO; Reply: AchVaultTokenResponseSchemaDTO }>(
    '/payments/getAchVaultToken',
    {
      preHandler: [opts.sessionHeaderAuthHook.authenticate()],
      schema: { body: AchVaultTokenRequestSchema, response: { 200: AchVaultTokenResponseSchema } },
    },
    async (request, reply) => {
      // braintreeCustomerId/ctCustomerId presence is validated in vaultPaymentMethodForCustomer
      const result = await opts.paymentService.getAchVaultToken(request.body);
      return reply.status(200).send(result);
    },
  );

  /* PURE_VAULT_DISABLED start — pure vault cancelled; uncomment to re-enable
  fastify.post<{
    Body: PureVaultRequestSchemaDTO;
    Reply: PaymentUpdateResponseSchemaDTO;
  }>(
    '/customer/pureVault',
    {
      preHandler: [opts.sessionHeaderAuthHook.authenticate()],
      schema: {
        body: PureVaultRequestSchema,
        response: {
          200: PaymentUpdateResponseSchema,
        },
      },
      onError: (request, reply, error) => {
        log.error(`Error processing pure vault request: ${error.message}, paymentId:${request?.body?.ctPaymentId}`);
        reply.status(500).send({
          message: 'Failed to save payment method',
          success: false,
          paymentReference: request?.body?.ctPaymentId,
        });
      },
    },
    async (request, reply) => {
      const resp = await opts.paymentService.pureVault(request.body);
      return reply.status(200).send(resp);
    },
  );
  PURE_VAULT_DISABLED end */
};
