import { BRAINTREE_PAYMENT_TYPE_KEY } from 'common-connect/dist';
import { CustomFieldsDraft, Payment } from '@commercetools/connect-payments-sdk';
import { Transaction, PaymentInstrumentType } from 'braintree';

type RestrictedFields = Required<CustomFieldsDraft>;

const BRAINTREE_PAYMENT_TYPE: RestrictedFields['type'] = {
  typeId: 'type',
  key: BRAINTREE_PAYMENT_TYPE_KEY,
};

export const handleCustomFieldResponse = (messageName: string, message?: string | object): RestrictedFields => {
  return {
    type: BRAINTREE_PAYMENT_TYPE,
    fields: { [`${messageName}Response`]: message ? `${JSON.stringify(message)}` : '' },
  };
};

//see also handleTransactionResponse from extensions module
export const handleCustomTransactionFields = (
  updateActions: RestrictedFields,
  response: Transaction & { localPayment?: { paymentId: string } },
  payment: Payment,
) => {
  // Handle local_payment type - compare as string since SDK may not include all valid values
  if (
    (response.paymentInstrumentType as string) === 'local_payment' &&
    !payment?.custom?.fields?.LocalPaymentMethodsPaymentId &&
    response.localPayment?.paymentId
  )
    updateActions.fields['LocalPaymentMethodsPaymentId'] = response.localPayment?.paymentId;
  if (!payment?.custom?.fields?.BraintreeOrderId && response?.orderId) {
    updateActions.fields['BraintreeOrderId'] = response.orderId;
  }
};
