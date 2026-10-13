import { CustomFieldsDraft, Payment } from '@commercetools/connect-payments-sdk';
import { PaymentUpdateAction } from '@commercetools/platform-sdk';
import { Transaction } from 'braintree';
import { apiCallNameToFieldData, getBraintreeResponse, getCurrentTimestamp, stringifyData } from 'common-connect/dist';
import { getConfig } from '../config/config';
import { paymentSDK } from '../payment-sdk';

type RestrictedFields = Required<CustomFieldsDraft>;

const BRAINTREE_PAYMENT_TYPE: RestrictedFields['type'] = {
  typeId: 'type',
  key: getConfig().paymentTypeKey,
};

// Custom fields written on a payment or customer, by name. A Braintree call is recorded as {messageName}ProcessorRequest
// and {messageName}Response — never the extension's {messageName}Request, which would re-trigger the extension
type PaymentFields = Record<string, string>;

const stringifyField = (message: unknown): string => (message ? JSON.stringify(message) : '');

// The fields recording one Braintree call: exactly what was sent and what Braintree answered
export const buildCallFields = (messageName: string, request: unknown, response: unknown): PaymentFields => {
  const [{ name: requestField }, { name: responseField }] = apiCallNameToFieldData(messageName, true);
  return { [requestField]: stringifyField(request), [responseField]: stringifyField(response) };
};

/**
 * What Braintree answered on a failed call: its own response (common-connect keeps it on the thrown error), or, for an
 * error the SDK throws without a response (not found, timeout, network), the SDK error as received.
 */
export const braintreeFailure = (err: unknown): object => {
  const response = getBraintreeResponse(err);
  if (response && typeof response === 'object') return response;
  return err instanceof Error
    ? { success: false, name: err.name, message: err.message }
    : { success: false, message: String(err) };
};

/**
 * One setCustomField per field, as braintree-extension writes them (buildCustomFieldAction). The SDK's
 * updatePayment({ customFields }) is never used: it sends setCustomType, which overwrites the
 * type and every field.
 */
const buildSetCustomFieldActions = (fields: PaymentFields): PaymentUpdateAction[] =>
  Object.entries(fields).map(([name, value]) => ({ action: 'setCustomField', name, value }));

// createPayment only: a new payment is created with the Braintree type, so it is never set later by setCustomType,
// which would overwrite the type and every field
export const braintreePaymentCustom = (fields: PaymentFields): RestrictedFields => ({
  type: BRAINTREE_PAYMENT_TYPE,
  fields,
});

const typeIds = new Map<string, Promise<string>>();

// Id of a custom type, fetched once per process — a resource's custom.type references its type by id, not key
export const getTypeId = (key: string): Promise<string> => {
  let typeId = typeIds.get(key);
  if (!typeId) {
    typeId = paymentSDK.ctCustomTypeService
      .getByKey({ key })
      .then(({ id }) => id)
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

export const notBraintreePayment = (paymentId: string) => `payment ${paymentId} is not Braintree checkout payment`;

export const notBraintreePaymentMessage = (paymentId: string) =>
  `${notBraintreePayment(paymentId)}. If you are sure that this is a Braintree checkout payment with missing type definition, you can set the required type (${getConfig().paymentTypeKey}) by a raw commercetools call. The checkout flow of this connector only defines one payment type and applies it on payment creation so it is your responsibility to find out which of your processes have overwritten the type.`;

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

// The interaction type the processor's post-deploy creates (key overridable by env, unlike common-connect's
// handleInterfaceInteraction, which always uses the default key)
const buildInteraction = (type: string, message: string | object): CustomFieldsDraft => ({
  type: { typeId: 'type', key: getConfig().interactionTypeKey },
  fields: { type, data: stringifyData(message), timestamp: getCurrentTimestamp() },
});

// Request/response interface-interaction pair recorded on the payment for one Braintree call
export const buildPspInteractions = (messageName: string, request: string | object, response: string | object) => {
  const [{ name: requestField }, { name: responseField }] = apiCallNameToFieldData(messageName, true);
  return [buildInteraction(requestField, request), buildInteraction(responseField, response)];
};

// What a Braintree call records on the payment: both call fields (+ extra fields) and the interaction pair
export const buildResponseActions = (
  messageName: string,
  request: string | object,
  response: string | object,
  extraFields: PaymentFields = {},
): PaymentUpdateAction[] => [
  ...buildSetCustomFieldActions({ ...buildCallFields(messageName, request, response), ...extraFields }),
  ...buildPspInteractions(messageName, request, response).map(
    (interaction): PaymentUpdateAction => ({ action: 'addInterfaceInteraction', ...interaction }),
  ),
];
