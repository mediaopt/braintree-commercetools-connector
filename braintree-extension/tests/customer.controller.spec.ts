import { customerController } from '../src/controllers/customer.controller';
import { describe, expect } from '@jest/globals';
import { CustomerReference } from '@commercetools/platform-sdk';
import { deleteCustomer } from '../src/service/braintree.service';
import { UpdateAction } from '@commercetools/sdk-client-v2';
import { Customer } from 'braintree';

function expectCustomerNotFound(
  findResponse:
    | {
        actions: Array<UpdateAction>;
        statusCode: number;
      }
    | undefined
) {
  expect(findResponse).toBeDefined();
  expect(findResponse?.statusCode).toBe(200);
  expect(findResponse?.actions[0].name).toBe('findResponse');
  expect(findResponse?.actions[0].value).toContain('"success":false');
}

function expectCustomerFound(
  findResponse:
    | { actions: Array<UpdateAction>; statusCode: number }
    | undefined,
  customerId: string
) {
  expect(findResponse).toBeDefined();
  expect(findResponse?.statusCode).toBe(200);
  expect(findResponse?.actions[0].name).toBe('findResponse');
  expect(findResponse?.actions[0].value).toContain(`"id":"${customerId}"`);
}

const getRandomId = (): string => {
  return `test_${Math.floor(Math.random() * Math.pow(2, 10))}`;
};

function expectSuccessfulCreation(
  createResponse:
    | { actions: Array<UpdateAction>; statusCode: number }
    | undefined,
  customerId: string
) {
  expect(createResponse).toBeDefined();
  expect(createResponse?.statusCode).toBe(200);
  expect(createResponse?.actions[0].name).toBe('createResponse');
  expect(createResponse?.actions[0].value).toContain(`"id":"${customerId}"`);
}

describe('find customer', () => {
  test('find unknown user', async () => {
    const customer = ({
      obj: {
        id: getRandomId(),
        custom: {
          fields: {
            findRequest: '{}',
          },
        },
      },
    } as unknown) as CustomerReference;
    const response = await customerController('Update', customer);
    expect(response?.statusCode).toBe(200);
    expect(response?.actions[0].name).toBe('findResponse');
    expect(response?.actions[0].value).toContain('"success":false');
  });

  test('find existing user', async () => {
    const customerId = getRandomId();
    const findCustomer = ({
      obj: {
        id: customerId,
        custom: {
          fields: {
            findRequest: '{}',
          },
        },
      },
    } as unknown) as CustomerReference;
    const createCustomer = ({
      obj: {
        id: customerId,
        firstName: 'firstName',
        lastName: 'lastName',
        companyName: 'company',
        email: `${customerId}@test.de`,
        custom: {
          fields: {
            createRequest: '{}',
          },
        },
      },
    } as unknown) as CustomerReference;
    const initialFindResponse = await customerController(
      'Update',
      findCustomer
    );
    const createResponse = await customerController('Update', createCustomer);
    const secondFindResponse = await customerController('Update', findCustomer);
    await deleteCustomer(customerId);
    expectCustomerNotFound(initialFindResponse);
    expectSuccessfulCreation(createResponse, customerId);
    expect(secondFindResponse).toBeDefined();
    expectCustomerFound(secondFindResponse, customerId);
  }, 8000);
});

describe('vaulting', () => {
  test('vault new customer', async () => {
    const customerId = getRandomId();
    const findCustomer = ({
      obj: {
        id: customerId,
        custom: {
          fields: {
            findRequest: '{}',
          },
        },
      },
    } as unknown) as CustomerReference;
    const createCustomer = ({
      obj: {
        id: customerId,
        firstName: 'firstName',
        lastName: 'lastName',
        companyName: 'company',
        email: `${customerId}@test.de`,
        custom: {
          fields: {
            vaultRequest: 'fake-valid-commercial-nonce',
          },
        },
      },
    } as unknown) as CustomerReference;
    const initialFindResponse = await customerController(
      'Update',
      findCustomer
    );
    const vaultResponse = await customerController('Update', createCustomer);
    const secondFindResponse = await customerController('Update', findCustomer);
    await deleteCustomer(customerId);
    expectCustomerNotFound(initialFindResponse);
    expect(vaultResponse?.statusCode).toBe(200);
    expect(vaultResponse?.actions[0].name).toBe('vaultResponse');
    expect(vaultResponse?.actions[0].value).toContain(`"id":"${customerId}"`);
    const newCustomer = JSON.parse(vaultResponse?.actions[0].value) as Customer;
    expect(newCustomer.paymentMethods).toHaveLength(1);
    expectCustomerFound(secondFindResponse, customerId);
  }, 8000);

  test('vault new customer', async () => {
    const customerId = getRandomId();
    const findCustomer = ({
      obj: {
        id: customerId,
        custom: {
          fields: {
            findRequest: '{}',
          },
        },
      },
    } as unknown) as CustomerReference;
    const createCustomer = ({
      obj: {
        id: customerId,
        firstName: 'firstName',
        lastName: 'lastName',
        companyName: 'company',
        email: `${customerId}@test.de`,
        custom: {
          fields: {
            createRequest: '{}',
          },
        },
      },
    } as unknown) as CustomerReference;
    const vaultCustomer = ({
      obj: {
        id: customerId,
        custom: {
          fields: {
            vaultRequest: 'fake-valid-amex-nonce',
            braintreeCustomerId: customerId,
          },
        },
      },
    } as unknown) as CustomerReference;
    const initialFindResponse = await customerController(
      'Update',
      findCustomer
    );
    const createResponse = await customerController('Update', createCustomer);
    const vaultResponse = await customerController('Update', vaultCustomer);
    const secondFindResponse = await customerController('Update', findCustomer);
    await deleteCustomer(customerId);
    expectCustomerNotFound(initialFindResponse);
    expectSuccessfulCreation(createResponse, customerId);
    expect(vaultResponse?.statusCode).toBe(200);
    expect(vaultResponse?.actions[0].name).toBe('vaultResponse');
    expect(vaultResponse?.actions[0].value).toContain(
      `"customerId":"${customerId}"`
    );
    expectCustomerFound(secondFindResponse, customerId);
  }, 8000);
});
