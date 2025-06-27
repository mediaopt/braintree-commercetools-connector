import { describe, expect } from '@jest/globals';
import {
  createExtension,
  ExtensionKey,
  deleteExtensionIfExist,
  addOrUpdateCustomType,
  BraintreeCustomTypeKeys,
  deleteOrUpdateCustomType,
} from '../src/connector/actions';

const extensionKeys: ExtensionKey[] = [
  'braintree-extension',
  'braintree-customer-extension',
];
describe('Extension related actions', () => {
  test.each(extensionKeys)(
    'createExtension for key %p',
    async (extensionKey) => {
      const apiRequest: any = {
        execute: jest.fn(() => ({ body: { results: [{}] } })),
      };
      const apiRoot: any = {
        extensions: jest.fn(() => apiRoot),
        withKey: jest.fn(() => apiRoot),
        delete: jest.fn(() => apiRequest),
        get: jest.fn(() => apiRequest),
        post: jest.fn(() => apiRequest),
      };
      await createExtension(apiRoot, 'https://lorem.ipsum', extensionKey);
      expect(apiRoot.get).toBeCalledTimes(1);
      expect(apiRoot.delete).toBeCalledTimes(1);
      expect(apiRoot.post).toBeCalledTimes(1);
      expect(apiRequest.execute).toBeCalledTimes(3);
    }
  );

  test('delete extension', async () => {
    const apiRequest: any = {
      execute: jest.fn(() => ({ body: { results: [{}] } })),
    };
    const apiRoot: any = {
      extensions: jest.fn(() => apiRoot),
      withKey: jest.fn(() => apiRoot),
      delete: jest.fn(() => apiRequest),
      get: jest.fn(() => apiRequest),
    };
    await deleteExtensionIfExist(apiRoot, 'braintree-extension');
    expect(apiRoot.get).toBeCalledTimes(1);
    expect(apiRoot.delete).toBeCalledTimes(1);
    expect(apiRequest.execute).toBeCalledTimes(2);
  });
});

describe('create custom type actions', () => {
  const typesWithExpectedResults: {
    key: BraintreeCustomTypeKeys;
    expectedLength: number;
  }[] = [
    {
      key: 'braintree-payment-type',
      expectedLength: 18, //BRAINTREE_API_PAYMENT_ENDPOINTS.length * 2 + 2,
    },
    {
      key: 'braintree-payment-interaction-type',
      expectedLength: 3,
    },
    { key: 'braintree-payment-transaction-type', expectedLength: 6 }, //BRAINTREE_API_PAYMENT_TRANSACTION_ENDPOINTS.length * 2
    { key: 'braintree-customer-type', expectedLength: 11 }, //BRAINTREE_API_CUSTOMER_ENDPOINTS*2+1
  ];

  test.each(typesWithExpectedResults)(
    'create custom type for key $key',
    async ({ key, expectedLength }) => {
      const apiRequest: any = {
        execute: jest.fn(() => ({
          body: { results: [{ key, fieldDefinitions: [] }] },
        })),
      };
      const apiRoot: any = {
        types: jest.fn(() => apiRoot),
        withKey: jest.fn(() => apiRoot),
        post: jest.fn(() => apiRequest),
        get: jest.fn(() => apiRequest),
      };
      await addOrUpdateCustomType(apiRoot, key);
      expect(apiRoot.get).toBeCalledTimes(1);
      expect(apiRoot.post).toBeCalledTimes(1);
      expect(apiRequest.execute).toBeCalledTimes(2);
      expect(apiRoot.post.mock.calls[0][0].body.actions).toHaveLength(
        expectedLength
      );
    }
  );

  test('if there are multiple types on the target resource - all are updated to include missing fields, if none of the types has the same key - an extra type is created', async () => {
    const apiRequest: any = {
      execute: jest.fn(() => ({
        body: {
          results: [
            { key: 'some-other-key1', fieldDefinitions: [] },
            {
              key: 'some-other-key2',
              fieldDefinitions: [{ name: 'timestamp' }],
            },
          ],
        },
      })),
    };
    const apiRoot: any = {
      types: jest.fn(() => apiRoot),
      withKey: jest.fn(() => apiRoot),
      post: jest.fn(() => apiRequest),
      get: jest.fn(() => apiRequest),
    };
    await addOrUpdateCustomType(apiRoot, 'braintree-payment-interaction-type');
    expect(apiRoot.get).toBeCalledTimes(1);
    expect(apiRoot.post).toBeCalledTimes(3);
    expect(apiRequest.execute).toBeCalledTimes(4);
    expect(apiRoot.post.mock.calls[0][0].body.actions).toHaveLength(3);
    expect(apiRoot.post.mock.calls[1][0].body.actions).toHaveLength(2);
  });

  test('if there are multiple types on the target resource - all are updated to include missing fields, if one of the types has the same key - an extra type is not created', async () => {
    const apiRequest: any = {
      execute: jest.fn(() => ({
        body: {
          results: [
            { key: 'some-other-key1', fieldDefinitions: [] },
            {
              key: 'braintree-payment-interaction-type',
              fieldDefinitions: [{ name: 'timestamp' }],
            },
          ],
        },
      })),
    };
    const apiRoot: any = {
      types: jest.fn(() => apiRoot),
      withKey: jest.fn(() => apiRoot),
      post: jest.fn(() => apiRequest),
      get: jest.fn(() => apiRequest),
    };
    await addOrUpdateCustomType(apiRoot, 'braintree-payment-interaction-type');
    expect(apiRoot.get).toBeCalledTimes(1);
    expect(apiRoot.post).toBeCalledTimes(2);
    expect(apiRequest.execute).toBeCalledTimes(3);
    expect(apiRoot.post.mock.calls[0][0].body.actions).toHaveLength(3);
    expect(apiRoot.post.mock.calls[1][0].body.actions).toHaveLength(2);
  });

  test('if there are no types on the target resource - an extra type is created', async () => {
    const apiRequest: any = {
      execute: jest.fn(() => ({
        body: {
          results: [],
        },
      })),
    };
    const apiRoot: any = {
      types: jest.fn(() => apiRoot),
      withKey: jest.fn(() => apiRoot),
      post: jest.fn(() => apiRequest),
      get: jest.fn(() => apiRequest),
    };
    await addOrUpdateCustomType(apiRoot, 'braintree-payment-interaction-type');
    expect(apiRoot.get).toBeCalledTimes(1);
    expect(apiRoot.post).toBeCalledTimes(1);
    expect(apiRequest.execute).toBeCalledTimes(2);
    expect(apiRoot.post.mock.calls[0][0].body).not.toHaveProperty('actions');
  });
});

describe('delete custom type', () => {
  test('do not affect custom type if it has no fields matching the draft', async () => {
    const apiRequest: any = {
      execute: jest.fn(() => ({
        body: {
          results: [
            {
              key: 'noMatchingFieldsType',
              fieldDefinitions: [{ name: 'notExistingYetDefinition' }],
            },
          ],
        },
      })),
    };
    const apiRoot: any = {
      types: jest.fn(() => apiRoot),
      withKey: jest.fn(() => apiRoot),
      post: jest.fn(() => apiRequest),
      get: jest.fn(() => apiRequest),
    };
    await deleteOrUpdateCustomType(apiRoot, 'braintree-payment-type');
    expect(apiRoot.get).toBeCalledTimes(1);
    expect(apiRoot.post).toBeCalledTimes(0);
    expect(apiRequest.execute).toBeCalledTimes(1);
  });

  test('if only some fields match the type draft - delete these fields, but not the type', async () => {
    const apiRequest: any = {
      execute: jest.fn(() => ({
        body: {
          results: [
            {
              key: 'someMatchingFieldsType',
              fieldDefinitions: [
                { name: 'notExistingYetDefinition' },
                { name: 'data' },
              ],
            },
          ],
        },
      })),
    };
    const apiRoot: any = {
      types: jest.fn(() => apiRoot),
      withKey: jest.fn(() => apiRoot),
      post: jest.fn(() => apiRequest),
      get: jest.fn(() => apiRequest),
    };
    await deleteOrUpdateCustomType(
      apiRoot,
      'braintree-payment-interaction-type'
    );
    expect(apiRoot.get).toBeCalledTimes(1);
    expect(apiRoot.post).toBeCalledTimes(1);
    expect(apiRequest.execute).toBeCalledTimes(2);
  });

  test('if all fields match the type draft - delete the type', async () => {
    const apiRequest: any = {
      execute: jest.fn(() => ({
        body: {
          results: [
            {
              key: 'allMatchingFieldsType',
              fieldDefinitions: [
                { name: 'type' },
                { name: 'data' },
                { name: 'timestamp' },
              ],
            },
          ],
        },
      })),
    };
    const apiRoot: any = {
      types: jest.fn(() => apiRoot),
      withKey: jest.fn(() => apiRoot),
      post: jest.fn(() => apiRequest),
      get: jest.fn(() => apiRequest),
      delete: jest.fn(() => apiRequest),
    };
    await deleteOrUpdateCustomType(
      apiRoot,
      'braintree-payment-interaction-type'
    );
    expect(apiRoot.get).toBeCalledTimes(1);
    expect(apiRoot.delete).toBeCalledTimes(1);
    expect(apiRequest.execute).toBeCalledTimes(2);
  });
});
