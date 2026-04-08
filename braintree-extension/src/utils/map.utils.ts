import { CustomerCreateRequest } from 'braintree';
import { Customer } from '@commercetools/platform-sdk';

export const mapCommercetoolsCustomerToBraintreeCustomerCreateRequest = (
  customer: Customer,
  createRequest: string
): CustomerCreateRequest => {
  const request = JSON.parse(createRequest);
  return Object.assign(
    {
      id: customer.id,
      firstName: customer.firstName,
      lastName: customer.lastName,
      email: customer.email,
      company: customer.companyName,
    },
    request
  ) as CustomerCreateRequest;
};
