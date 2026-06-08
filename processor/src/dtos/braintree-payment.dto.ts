import { Static, Type } from '@sinclair/typebox';
import { BraintreeLineItemSchema } from '../utils/lineItem.utils';
import { BraintreeShippingOptionSchema, BraintreeShippingSchema } from '../utils/shipping.utils';

export enum PaymentOutcome {
  AUTHORIZED = 'Authorized',
  REJECTED = 'Rejected',
}

export enum PaymentMethodType {
  ACH = 'ACH',
  APPLE_PAY = 'ApplePay',
  CREDIT_CARD = 'CreditCard',
  CREDIT_CARD_VAULT = 'CreditCardVault',
  GOOGLE_PAY = 'GooglePay',
  BANCONTACT = 'bancontact',
  BLIK = 'blik',
  EPS = 'eps',
  GIROPAY = 'giropay',
  IDEAL = 'ideal',
  SOFORT = 'sofort',
  MYBANK = 'mybank',
  P24 = 'p24',
  PAYPAL = 'PayPal',
  PAYPAL_VAULT = 'PayPalVault',
  VENMO = 'Venmo',
}
export enum CustomBuilderType {
  DROPIN = 'dropin',
  EXPRESS = 'express',
}

// Payment schema groups
const PaymentRequiredFieldsSchema = Type.Object({
  ctPaymentId: Type.String(),
  braintreeAmount: Type.Number(),
  currency: Type.String(),
});

const PaymentExpressShippingSchema = Type.Object({
  shippingOptions: Type.Optional(Type.Array(BraintreeShippingOptionSchema)),
  braintreeShipping: Type.Optional(BraintreeShippingSchema),
});

const PaymentFrontendRenderingSchema = Type.Object({
  email: Type.Optional(Type.String()),
  firstName: Type.Optional(Type.String()),
  lastName: Type.Optional(Type.String()),
  streetName: Type.Optional(Type.String()),
  streetNumber: Type.Optional(Type.String()),
  postalCode: Type.Optional(Type.String()),
  countryCode: Type.Optional(Type.String()),
  fallbackUrl: Type.Optional(Type.String()),
  braintreeLineItems: Type.Optional(Type.Array(BraintreeLineItemSchema)),
});

const PaymentVaultSchema = Type.Object({
  ctCustomerId: Type.Optional(Type.String()),
  ctCustomerVersion: Type.Optional(Type.Number()),
});

export const InitPaymentResponseSchema = Type.Object({
  braintreeData: Type.Object({
    clientToken: Type.String(),
    braintreeCustomerId: Type.Optional(Type.String()),
  }),
  payment: Type.Intersect([
    PaymentRequiredFieldsSchema,
    PaymentExpressShippingSchema,
    PaymentFrontendRenderingSchema,
    PaymentVaultSchema,
  ]),
});

export const PaymentOutcomeSchema = Type.Enum(PaymentOutcome);

export const InitPaymentRequestSchema = Type.Object({
  paymentMethodType: Type.Enum(PaymentMethodType),
  builderType: Type.Optional(Type.Enum(CustomBuilderType)),

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

const PureVaultBaseSchema = Type.Object({
  ctCustomerId: Type.String(),
  ctCustomerVersion: Type.Number(),
  braintreeCustomerId: Type.Optional(Type.String()),
  paymentMethodNonce: Type.String(),
});

export const PureVaultRequestSchema = Type.Object({
  ctCustomerId: Type.String(),
  ctCustomerVersion: Type.Number(),
  braintreeCustomerId: Type.Optional(Type.String()),
  paymentMethodNonce: Type.String(),
  ctPaymentId: Type.String(),
});

export type PureVaultBaseSchemaDTO = Static<typeof PureVaultBaseSchema>;
export type PureVaultRequestSchemaDTO = Static<typeof PureVaultRequestSchema>;

export type PaymentRequestSchemaDTO = Static<typeof InitPaymentRequestSchema>;
export type PaymentResponseSchemaDTO = Static<typeof InitPaymentResponseSchema>;

export const TransactionSaleRequestSchema = Type.Object({
  ctPaymentId: Type.String(),
  paymentMethodNonce: Type.Optional(Type.String()),
  paymentToken: Type.Optional(Type.String()),
  storeInVaultOnSuccess: Type.Optional(Type.Boolean()),
  storeShipping: Type.Optional(Type.Boolean()),
  deviceData: Type.Optional(Type.String()),
  braintreePaymentDetails: Type.Optional(
    Type.Object({
      braintreeLineItems: Type.Optional(Type.Array(BraintreeLineItemSchema)),
      extraShippingCost: Type.Optional(Type.String()),
      braintreeShipping: Type.Optional(BraintreeShippingSchema),
    }),
  ),
});

export type TransactionSaleRequestSchemaDTO = Static<typeof TransactionSaleRequestSchema>;

export const PaymentUpdateResponseSchema = Type.Object({
  message: Type.String(),
  success: Type.Boolean(),
  paymentReference: Type.Optional(Type.String()),
  merchantReturnUrl: Type.Optional(Type.String()),
});
export type PaymentUpdateResponseSchemaDTO = Static<typeof PaymentUpdateResponseSchema>;

export const RefundRequestSchema = Type.Object({
  ctPaymentId: Type.String(),
  braintreeAmount: Type.Optional(Type.String()),
  transactionId: Type.Optional(Type.String()),
});
