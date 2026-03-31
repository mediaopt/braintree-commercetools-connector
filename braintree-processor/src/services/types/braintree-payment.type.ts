import { PaymentRequestSchemaDTO } from '../../dtos/mock-payment.dto';
import { CommercetoolsCartService, CommercetoolsPaymentService } from '@commercetools/connect-payments-sdk';

export type BraintreePaymentServiceOptions = {
  ctCartService: CommercetoolsCartService;
  ctPaymentService: CommercetoolsPaymentService;
};

export type CreatePaymentRequest = {
  data: PaymentRequestSchemaDTO;
};
