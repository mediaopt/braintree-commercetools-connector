import { Static, Type } from '@sinclair/typebox';

export enum PaymentOutcome {
  AUTHORIZED = 'Authorized',
  REJECTED = 'Rejected',
}

export enum PaymentMethodType {
  ACH = 'ACH',
  APPLE_PAY = 'ApplePay',
  CREDIT_CARD = 'CreditCard',
  GOOGLE_PAY = 'GooglePay',
  LOCAL_PAYMENT_METHOD = 'LocalPaymentMethod',
  PAYPAL = 'PayPal',
  VENMO = 'Venmo',
}

export const InitPaymentResponseSchema = Type.Object({
  braintreeData: Type.Object({
    clientToken: Type.String(),
    braintreeCustomerId: Type.Optional(Type.String()),
  }),
  payment: Type.Object({
    ctPaymentId: Type.String(),
    braintreeAmount: Type.Number(),
    currency: Type.String(),
    email: Type.Optional(Type.String()),
    firstName: Type.Optional(Type.String()),
    lastName: Type.Optional(Type.String()),
    streetName: Type.Optional(Type.String()),
    streetNumber: Type.Optional(Type.String()),
    postalCode: Type.Optional(Type.String()),
  }),
});

export const PaymentOutcomeSchema = Type.Enum(PaymentOutcome);

export const InitPaymentRequestSchema = Type.Object({
  merchantAccountId: Type.Optional(Type.String()),
  isPureVault: Type.Optional(Type.Boolean()),

  // paymentMethod: Type.Object({
  //   type: Type.Enum(BraintreePaymentMethodType),
  //   poNumber: Type.Optional(Type.String()),
  //   invoiceMemo: Type.Optional(Type.String()),
  //   storedPaymentMethodId: Type.Optional(
  //     Type.String({ description: 'The ID of the stored-payment-method used to pay with.' }),
  //   ),
  //   storePaymentMethod: Type.Optional(
  //     Type.Boolean({
  //       description: 'True if the user has given consent to storing/tokenising the payment method.',
  //     }),
  //   ),
  // }),
  // paymentOutcome: PaymentOutcomeSchema,
});

export type PaymentRequestSchemaDTO = Static<typeof InitPaymentRequestSchema>;
export type PaymentResponseSchemaDTO = Static<typeof InitPaymentResponseSchema>;

export const TransactionSaleRequestSchema = Type.Object({
  ctPaymentId: Type.String(),
  paymentMethodNonce: Type.Optional(Type.String()),
  paymentToken: Type.Optional(Type.String()),
  deviceData: Type.Optional(Type.String()),
});

export type TransactionSaleRequestSchemaDTO = Static<typeof TransactionSaleRequestSchema>;
