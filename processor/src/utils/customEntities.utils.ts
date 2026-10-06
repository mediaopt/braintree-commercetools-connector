import { CustomFieldsDraft, Payment } from '@commercetools/connect-payments-sdk';
import { PaymentUpdateAction } from '@commercetools/platform-sdk';
import { Transaction } from 'braintree';
import { handleInterfaceInteraction } from 'common-connect/dist';
import { getConfig } from '../config/config';
import { paymentSDK } from '../payment-sdk';

type RestrictedFields = Required<CustomFieldsDraft>;

const BRAINTREE_PAYMENT_TYPE: RestrictedFields['type'] = {
  typeId: 'type',
  key: getConfig().paymentTypeKey,
};

// Custom fields written on the payment, by name. Only {messageName}Response — the extension's {messageName}Request
// fields are never written, as they would re-trigger the extension
type PaymentFields = Record<string, string>;

export const handleCustomFieldResponse = (
  messageName: string,
  message: string | object | undefined,
): PaymentFields => ({
  [`${messageName}Response`]: message ? `${JSON.stringify(message)}` : '',
});

/**
 * One setCustomField per field, as braintree-extension writes them (buildCustomFieldAction). The SDK's
 * updatePayment({ customFields }) can't be used after createPayment: it sends setCustomType, which overwrites the
 * type and every field. Send these in a raw call built from a fresh fetch, so a retry never writes stale fields.
 */
export const buildSetCustomFieldActions = (fields: PaymentFields): PaymentUpdateAction[] =>
  Object.entries(fields).map(([name, value]) => ({ action: 'setCustomField', name, value }));

// createPayment only: establishes the Braintree type (setCustomType), keeping the fields a reused payment already has
export const withBraintreeType = (fields: PaymentFields, payment: Payment): RestrictedFields => ({
  type: BRAINTREE_PAYMENT_TYPE,
  fields: { ...payment.custom?.fields, ...fields },
});

const typeIds = new Map<string, Promise<string>>();

// Id of a custom type, fetched once per process — a resource's custom.type references its type by id, not key
export const getTypeId = (key: string): Promise<string> => {
  let typeId = typeIds.get(key);
  if (!typeId) {
    typeId = paymentSDK.ctAPI.client
      .types()
      .withKey({ key })
      .get()
      .execute()
      .then(({ body }) => body.id)
      .catch((err) => {
        typeIds.delete(key);
        throw err;
      });
    typeIds.set(key, typeId);
  }
  return typeId;
};

export const getBraintreePaymentTypeId = (): Promise<string> => getTypeId(getConfig().paymentTypeKey);

// createPayment sets the Braintree type, so a payment without it was created elsewhere or had its type overwritten
export const isBraintreePayment = (payment: Payment, braintreePaymentTypeId: string): boolean =>
  payment.custom?.type.id === braintreePaymentTypeId;

export const NOT_BRAINTREE_PAYMENT = (paymentId: string) => `payment ${paymentId} is not Braintree checkout payment`;

export const notBraintreePaymentMessage = (paymentId: string) =>
  `${NOT_BRAINTREE_PAYMENT(paymentId)}. If you are sure that this is a Braintree checkout payment with missing type definition, you can set the required type (${getConfig().paymentTypeKey}) by a raw commercetools call. The checkout flow of this connector only defines one payment type and applies it on payment creation so it is your responsibility to find out which of your processes have overwritten the type.`;

//see also handleTransactionResponse from extensions module
export const handleCustomTransactionFields = (
  fields: PaymentFields,
  response: Transaction & { localPayment?: { paymentId: string } },
  payment: Payment,
) => {
  // Handle local_payment type - compare as string since SDK may not include all valid values
  if (
    (response.paymentInstrumentType as string) === 'local_payment' &&
    !payment?.custom?.fields?.LocalPaymentMethodsPaymentId &&
    response.localPayment?.paymentId
  )
    fields['LocalPaymentMethodsPaymentId'] = response.localPayment?.paymentId;
  if (!payment?.custom?.fields?.BraintreeOrderId && response?.orderId) {
    fields['BraintreeOrderId'] = response.orderId;
  }
};

// Request/response interface-interaction pair recorded on the payment for one Braintree call
export const buildPspInteractions = (messageName: string, request: string | object, response: string | object) => [
  handleInterfaceInteraction({ messageName, message: request, messageType: 'ProcessorRequest' }),
  handleInterfaceInteraction({ messageName, message: response, messageType: 'Response' }),
];
