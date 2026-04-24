import { SessionHeaderAuthenticationHook } from '@commercetools/connect-payments-sdk';
import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import {
  GeneralResponseSuccessSchema,
  GeneralResponseSuccessSchemaDTO,
  PureVaultRequestSchema,
  PureVaultRequestSchemaDTO,
} from '../dtos/braintree-payment.dto';
import { BraintreePaymentService } from '../services/braintree-payment.service';

type CustomerRoutesOptions = {
  paymentService: BraintreePaymentService;
  sessionHeaderAuthHook: SessionHeaderAuthenticationHook;
};

export const customerRoutes = async (fastify: FastifyInstance, opts: FastifyPluginOptions & CustomerRoutesOptions) => {
  fastify.post<{ Body: PureVaultRequestSchemaDTO; Reply: GeneralResponseSuccessSchemaDTO }>(
    '/customer/pureVault',
    {
      preHandler: [
        opts.sessionHeaderAuthHook.authenticate(),
        opts.authorizationHook.authorize('manage_project', 'manage_customer'),
      ],
      schema: {
        body: PureVaultRequestSchema,
        response: {
          200: GeneralResponseSuccessSchema,
        },
      },
    },
    async (request, reply) => {
      const resp = await opts.paymentService.pureVault(request.body);

      return reply.status(200).send(resp);
    },
  );
};
