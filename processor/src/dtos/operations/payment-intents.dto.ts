import { Static, Type } from '@sinclair/typebox';

export const ActionCapturePaymentSchema = Type.Composite([
  Type.Object({
    action: Type.Literal('capturePayment'),
  }),
  Type.Object({
    transactionId: Type.Optional(Type.String()),
  }),
]);

export const ActionRefundPaymentSchema = Type.Composite([
  Type.Object({
    action: Type.Literal('refundPayment'),
  }),
  Type.Object({
    braintreeAmount: Type.Optional(Type.String()),
    transactionId: Type.Optional(Type.String()),
  }),
]);

export const ActionCancelPaymentSchema = Type.Composite([
  Type.Object({
    action: Type.Literal('cancelPayment'),
  }),
]);

export const ActionReversePaymentSchema = Type.Composite([
  Type.Object({
    action: Type.Literal('reversePayment'),
    merchantReference: Type.Optional(Type.String()),
  }),
]);

/**
 * Payment intent request schema.
 *
 * Example:
 * {
 *  "actions": [
 *   {
 *    "action": "capturePayment",
 *    "amount": {
 *      "centAmount": 100,
 *      "currencyCode": "EUR"
 *    }
 *  ]
 * }
 */
export const PaymentIntentRequestSchema = Type.Object({
  actions: Type.Array(
    Type.Union([
      ActionCapturePaymentSchema,
      ActionRefundPaymentSchema,
      ActionCancelPaymentSchema,
      ActionReversePaymentSchema,
    ]),
    {
      maxItems: 1,
    },
  ),
});

export enum PaymentModificationStatus {
  APPROVED = 'approved',
  REJECTED = 'rejected',
  RECEIVED = 'received',
}
const PaymentModificationSchema = Type.Enum(PaymentModificationStatus);

export const PaymentIntentResponseSchema = Type.Object({
  outcome: PaymentModificationSchema,
});

export type PaymentIntentRequestSchemaDTO = Static<typeof PaymentIntentRequestSchema>;
