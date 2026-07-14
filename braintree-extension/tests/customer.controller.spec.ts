import { customerController } from '../src/controllers/customer.controller';
import { describe, expect } from '@jest/globals';
import { CustomerReference } from '@commercetools/platform-sdk';
import { deleteCustomer } from 'common-connect/src/service/braintree.service';
import { Customer } from 'braintree';
import {
  findSetCustomFieldAction,
  ControllerActionsResponse,
} from './utils/actions';

function expectCustomerNotFound(findResponse: ControllerActionsResponse) {
  expect(findResponse).toBeDefined();
  expect(findResponse?.statusCode).toBe(200);
  const findAction = findSetCustomFieldAction(
    findResponse?.actions ?? [],
    'findResponse'
  );
  expect(findAction?.name).toBe('findResponse');
  expect(findAction?.value).toContain('"success":false');
}

function expectCustomerFound(
  findResponse: ControllerActionsResponse,
  customerId: string
) {
  expect(findResponse).toBeDefined();
  expect(findResponse?.statusCode).toBe(200);
  const findAction = findSetCustomFieldAction(
    findResponse?.actions ?? [],
    'findResponse'
  );
  expect(findAction?.name).toBe('findResponse');
  expect(findAction?.value).toContain(`"id":"${customerId}"`);
}

const getRandomId = (): string => {
  return `test_${Math.floor(Math.random() * Math.pow(2, 10))}`;
};

function expectSuccessfulCreation(
  createResponse: ControllerActionsResponse,
  customerId: string
) {
  expect(createResponse).toBeDefined();
  expect(createResponse?.statusCode).toBe(200);
  const createAction = findSetCustomFieldAction(
    createResponse?.actions ?? [],
    'createResponse'
  );
  expect(createAction?.name).toBe('createResponse');
  expect(createAction?.value).toContain(`"id":"${customerId}"`);
}

describe('find customer', () => {
  test('find unknown user', async () => {
    const customer = {
      obj: {
        id: getRandomId(),
        custom: {
          fields: {
            findRequest: '{}',
          },
        },
      },
    } as unknown as CustomerReference;
    const response = await customerController('Update', customer);
    expect(response?.statusCode).toBe(200);
    const findAction = findSetCustomFieldAction(
      response?.actions ?? [],
      'findResponse'
    );
    expect(findAction?.name).toBe('findResponse');
    expect(findAction?.value).toContain('"success":false');
  });

  test('find existing user', async () => {
    const customerId = getRandomId();
    const findCustomer = {
      obj: {
        id: customerId,
        custom: {
          fields: {
            findRequest: '{}',
          },
        },
      },
    } as unknown as CustomerReference;
    const createCustomer = {
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
    } as unknown as CustomerReference;
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
    const findCustomer = {
      obj: {
        id: customerId,
        custom: {
          fields: {
            findRequest: '{}',
          },
        },
      },
    } as unknown as CustomerReference;
    const createCustomer = {
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
    } as unknown as CustomerReference;
    const initialFindResponse = await customerController(
      'Update',
      findCustomer
    );
    const vaultResponse = await customerController('Update', createCustomer);
    const secondFindResponse = await customerController('Update', findCustomer);
    await deleteCustomer(customerId);
    expectCustomerNotFound(initialFindResponse);
    expect(vaultResponse?.statusCode).toBe(200);
    const vaultAction = findSetCustomFieldAction(
      vaultResponse?.actions ?? [],
      'vaultResponse'
    );
    expect(vaultAction?.name).toBe('vaultResponse');
    expect(vaultAction?.value).toContain(`"id":"${customerId}"`);
    const newCustomer = JSON.parse(vaultAction?.value) as Customer;
    expect(newCustomer.paymentMethods).toHaveLength(1);
    expectCustomerFound(secondFindResponse, customerId);
  }, 8000);

  test('vault new customer', async () => {
    const customerId = getRandomId();
    const findCustomer = {
      obj: {
        id: customerId,
        custom: {
          fields: {
            findRequest: '{}',
          },
        },
      },
    } as unknown as CustomerReference;
    const createCustomer = {
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
    } as unknown as CustomerReference;
    const vaultCustomer = {
      obj: {
        id: customerId,
        custom: {
          fields: {
            vaultRequest: 'fake-valid-amex-nonce',
            braintreeCustomerId: customerId,
          },
        },
      },
    } as unknown as CustomerReference;
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
    const vaultAction = findSetCustomFieldAction(
      vaultResponse?.actions ?? [],
      'vaultResponse'
    );
    expect(vaultAction?.name).toBe('vaultResponse');
    expect(vaultAction?.value).toContain(`"customerId":"${customerId}"`);
    expectCustomerFound(secondFindResponse, customerId);
  }, 8000);
});
