import { SessionHeaderAuthenticationHook } from '@commercetools/connect-payments-sdk';
import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import {
  InitPaymentRequestSchema,
  PaymentRequestSchemaDTO,
  InitPaymentResponseSchema,
  PaymentResponseSchemaDTO,
  TransactionSaleRequestSchema,
  TransactionSaleRequestSchemaDTO,
} from '../dtos/braintree-payment.dto';
import { BraintreePaymentService } from '../services/braintree-payment.service';
import { StoredPaymentMethodsResponseSchema } from '../dtos/stored-payment-methods.dto';
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
      const resp = await opts.paymentService.createPayment({
        data: request.body,
      });

      return reply.status(200).send(resp);
    },
  );

  fastify.post<{
    Body: TransactionSaleRequestSchemaDTO;
    Reply: { status: string };
  }>(
    '/payments/transactionSale',
    {
      preHandler: [opts.sessionHeaderAuthHook.authenticate()],
      schema: {
        body: TransactionSaleRequestSchema,
        response: {
          200: Type.Object({
            status: Type.String(),
          }),
        },
      },
    },
    async (request, reply) => {
      await opts.paymentService.transactionSale(request.body);
      return reply.status(200).send({ status: 'Transaction sale processed' });
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
};
