import { CustomFields } from '@commercetools/platform-sdk';

// Ids commercetools would return for the Braintree custom types (a resource's custom.type references a type by id)
export const BRAINTREE_PAYMENT_TYPE_ID = 'braintree-payment-type-id';
export const BRAINTREE_CUSTOMER_TYPE_ID = 'braintree-customer-type-id';

const customOf =
  (id: string) =>
  (fields: CustomFields['fields'] = {}): CustomFields => ({ type: { typeId: 'type', id }, fields });

export const braintreePaymentCustom = customOf(BRAINTREE_PAYMENT_TYPE_ID);
export const braintreeCustomerCustom = customOf(BRAINTREE_CUSTOMER_TYPE_ID);
// a merchant's or another connector's custom type
export const otherTypeCustom = customOf('other-type');

// payments this connector refuses to operate on
export const nonBraintreeCustomCases = [
  { description: 'another custom type', custom: otherTypeCustom() },
  { description: 'no custom type', custom: undefined },
];
