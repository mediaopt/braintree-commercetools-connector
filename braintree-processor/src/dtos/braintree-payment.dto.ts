import { Static, Type } from '@sinclair/typebox';

export enum PaymentOutcome {
  AUTHORIZED = 'Authorized',
  REJECTED = 'Rejected',
}

export enum PaymentMethodType {
  CARD = 'card',
  CUSTOM_TEST_METHOD = 'customtestmethod',
  INVOICE = 'invoice',
  PURCHASE_ORDER = 'purchaseorder',
}

export const InitPaymentResponseSchema = Type.Object({
  ctPaymentId: Type.String(),
  clientToken: Type.String(),
  currency: Type.String(),
  braintreeAmount: Type.String(),
  email: Type.Optional(Type.String()),
  braintreeCustomerId: Type.Optional(Type.String()),

  //discountAmount
  //taxAmount
  //shippingAmount
});

export const PaymentOutcomeSchema = Type.Enum(PaymentOutcome);

export const InitPaymentRequestSchema = Type.Object({
  merchantAccountId: Type.Optional(Type.String()),
  isPureVault: Type.Optional(Type.Boolean()),

  // paymentMethod: Type.Object({
  //   type: Type.Enum(PaymentMethodType),
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
  paymentNonce: Type.Optional(Type.String()),
  paymentToken: Type.Optional(Type.String()),
});

export type TransactionSaleRequestSchemaDTO = Static<typeof TransactionSaleRequestSchema>;
