import {
  CommercetoolsCartService,
  CommercetoolsPaymentMethodService,
  CommercetoolsPaymentService,
} from '@commercetools/connect-payments-sdk';

export type BraintreePaymentServiceOptions = {
  ctCartService: CommercetoolsCartService;
  ctPaymentService: CommercetoolsPaymentService;
  ctPaymentMethodService: CommercetoolsPaymentMethodService;
};
