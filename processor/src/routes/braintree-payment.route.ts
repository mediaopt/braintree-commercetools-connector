import { SessionHeaderAuthenticationHook } from '@commercetools/connect-payments-sdk';
import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import {
  InitPaymentRequestSchema,
  PaymentRequestSchemaDTO,
  InitPaymentResponseSchema,
  PaymentResponseSchemaDTO,
  TransactionSaleRequestSchema,
  TransactionSaleRequestSchemaDTO,
  PureVaultRequestSchema,
  PaymentUpdateResponseSchema,
  PureVaultRequestSchemaDTO,
  PaymentUpdateResponseSchemaDTO,
} from '../dtos/braintree-payment.dto';
import { BraintreePaymentService } from '../services/braintree-payment.service';
import { Type } from '@sinclair/typebox';
import { log } from '../libs/logger';

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
    Body: { newShippingMethodId: string };
    Reply: { braintreeAmount: string };
  }>(
    '/payments/updateCartShipping',
    {
      preHandler: [opts.sessionHeaderAuthHook.authenticate()],
      schema: {
        body: Type.Object({
          newShippingMethodId: Type.String(),
        }),
        response: {
          200: Type.Object({
            braintreeAmount: Type.String(),
          }),
        },
      },
    },
    async (request, reply) => {
      const braintreeAmount = await opts.paymentService.updateCartShipping(request.body);
      return reply.status(200).send({ braintreeAmount });
    },
  );

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
};
