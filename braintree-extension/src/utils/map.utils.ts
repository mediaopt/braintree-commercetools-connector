import { CustomerCreateRequest } from 'braintree';
import { Customer } from '@commercetools/platform-sdk';
import { mapCTCustomerToNewBraintreeCustomer } from 'common-connect/dist';

export const mapCommercetoolsCustomerToBraintreeCustomerCreateRequest = (
  customer: Customer,
  createRequest: string
): CustomerCreateRequest => {
  const request = JSON.parse(createRequest);
  return Object.assign(
    mapCTCustomerToNewBraintreeCustomer(customer),
    request
  ) as CustomerCreateRequest;
};
