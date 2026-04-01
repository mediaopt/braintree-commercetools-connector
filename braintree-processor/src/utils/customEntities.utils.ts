import { BRAINTREE_PAYMENT_TYPE_KEY } from 'common-connect/dist';
import { CustomFieldsDraft } from '@commercetools/connect-payments-sdk';

type RestrictedFields = Required<CustomFieldsDraft>;

export const handleCustomFieldResponse = (messageName: string, message?: string | object): RestrictedFields => {
  return {
    type: {
      typeId: 'type',
      key: BRAINTREE_PAYMENT_TYPE_KEY,
    },
    fields: { [`${messageName}Response`]: message ? `${JSON.stringify(message)}` : '' },
  };
};
