import { FastifyInstance } from 'fastify';
import { paymentSDK } from '../../payment-sdk';
import { paymentRoutes } from '../../routes/braintree-payment.route';
import { BraintreePaymentService } from '../../services/braintree-payment.service';

export default async function (server: FastifyInstance) {
  const braintreePaymentService = new BraintreePaymentService({
    ctCartService: paymentSDK.ctCartService,
    ctPaymentService: paymentSDK.ctPaymentService,
    ctPaymentMethodService: paymentSDK.ctPaymentMethodService,
  });

  await server.register(paymentRoutes, {
    paymentService: braintreePaymentService,
    sessionHeaderAuthHook: paymentSDK.sessionHeaderAuthHookFn,
  });
}
