import { ByProjectKeyRequestBuilder } from '@commercetools/platform-sdk/dist/declarations/src/generated/client/by-project-key-request-builder';
import {
  FieldDefinition,
  TypeAddFieldDefinitionAction,
  TypeDraft,
} from '@commercetools/platform-sdk/dist/declarations/src/generated/models/type';

const BRAINTREE_EXTENSION_KEY = 'braintree-extension';
const BRAINTREE_CUSTOMER_TYPE_KEY = 'braintree-customer-type';
const BRAINTREE_PAYMENT_TYPE_KEY = 'braintree-payment-type';
export const BRAINTREE_PAYMENT_INTERACTION_TYPE_KEY =
  'braintree-payment-interaction-type';
const BRAINTREE_API_PAYMENT_ENDPOINTS = [
  'getClientToken',
  'transactionSale',
  'refund',
  'submitForSettlement',
  'void',
];
export const BRAINTREE_PAYMENT_TRANSACTION_TYPE_KEY =
  'braintree-payment-transaction-type';
const BRAINTREE_API_PAYMENT_TRANSACTION_ENDPOINTS = [
  'refund',
  'submitForSettlement',
  'void',
];

export async function createBraintreeExtension(
  apiRoot: ByProjectKeyRequestBuilder,
  applicationUrl: string
): Promise<void> {
  const {
    body: { results: extensions },
  } = await apiRoot
    .extensions()
    .get({
      queryArgs: {
        where: `key = "${BRAINTREE_EXTENSION_KEY}"`,
      },
    })
    .execute();

  if (extensions.length > 0) {
    const extension = extensions[0];

    await apiRoot
      .extensions()
      .withKey({ key: BRAINTREE_EXTENSION_KEY })
      .delete({
        queryArgs: {
          version: extension.version,
        },
      })
      .execute();
  }

  await apiRoot
    .extensions()
    .post({
      body: {
        key: BRAINTREE_EXTENSION_KEY,
        destination: {
          type: 'HTTP',
          url: applicationUrl,
        },
        triggers: [
          {
            resourceTypeId: 'payment',
            actions: ['Update'],
          },
        ],
        timeoutInMs: 10000,
      },
    })
    .execute();
}

export async function deleteCartUpdateExtension(
  apiRoot: ByProjectKeyRequestBuilder
): Promise<void> {
  const {
    body: { results: extensions },
  } = await apiRoot
    .extensions()
    .get({
      queryArgs: {
        where: `key = "${BRAINTREE_EXTENSION_KEY}"`,
      },
    })
    .execute();

  if (extensions.length > 0) {
    const extension = extensions[0];

    await apiRoot
      .extensions()
      .withKey({ key: BRAINTREE_EXTENSION_KEY })
      .delete({
        queryArgs: {
          version: extension.version,
        },
      })
      .execute();
  }
}

export async function createCustomPaymentType(
  apiRoot: ByProjectKeyRequestBuilder
): Promise<void> {
  const fieldDefinitions: FieldDefinition[] = [];
  BRAINTREE_API_PAYMENT_ENDPOINTS.forEach((element) =>
    fieldDefinitions.push({
      name: `${element}Request`,
      label: {
        en: `${element}Request`,
      },
      type: {
        name: 'String',
      },
      inputHint: 'MultiLine',
      required: false,
    })
  );
  BRAINTREE_API_PAYMENT_ENDPOINTS.forEach((element) =>
    fieldDefinitions.push({
      name: `${element}Response`,
      label: {
        en: `${element}Response`,
      },
      type: {
        name: 'String',
      },
      inputHint: 'MultiLine',
      required: false,
    })
  );
  const customType = {
    key: BRAINTREE_PAYMENT_TYPE_KEY,
    name: {
      en: 'Custom payment type to braintree fields',
    },
    resourceTypeIds: ['payment'],
    fieldDefinitions: fieldDefinitions,
  };
  await addOrUpdateCustomType(apiRoot, customType);
}

export async function createCustomPaymentInteractionType(
  apiRoot: ByProjectKeyRequestBuilder
): Promise<void> {
  const fieldDefinitions: FieldDefinition[] = [
    {
      name: 'type',
      label: {
        en: 'type',
      },
      type: {
        name: 'String',
      },
      inputHint: 'SingleLine',
      required: false,
    },
    {
      name: 'data',
      label: {
        en: 'data',
      },
      type: {
        name: 'String',
      },
      inputHint: 'MultiLine',
      required: false,
    },
    {
      name: 'timestamp',
      label: {
        en: 'timestamp',
      },
      type: {
        name: 'DateTime',
      },
      required: false,
    },
  ];
  const customType = {
    key: BRAINTREE_PAYMENT_INTERACTION_TYPE_KEY,
    name: {
      en: 'Custom payment interaction type to braintree fields',
    },
    resourceTypeIds: ['payment-interface-interaction'],
    fieldDefinitions: fieldDefinitions,
  };
  await addOrUpdateCustomType(apiRoot, customType);
}

export async function createCustomCustomerType(
  apiRoot: ByProjectKeyRequestBuilder
): Promise<void> {
  const fieldDefinitions: FieldDefinition[] = [
    {
      name: 'customerId',
      label: {
        en: 'Braintree customer Id',
      },
      type: {
        name: 'String',
      },
      inputHint: 'SingleLine',
      required: false,
    },
  ];
  const customType = {
    key: BRAINTREE_CUSTOMER_TYPE_KEY,
    name: {
      en: 'Custom customer type to braintree fields',
    },
    resourceTypeIds: ['customer'],
    fieldDefinitions: fieldDefinitions,
  };
  await addOrUpdateCustomType(apiRoot, customType);
}

export async function createCustomPaymentTransactionType(
  apiRoot: ByProjectKeyRequestBuilder
): Promise<void> {
  const fieldDefinitions: FieldDefinition[] = [];
  BRAINTREE_API_PAYMENT_TRANSACTION_ENDPOINTS.forEach((element) =>
    fieldDefinitions.push({
      name: `${element}Request`,
      label: {
        en: `${element}Request`,
      },
      type: {
        name: 'String',
      },
      inputHint: 'MultiLine',
      required: false,
    })
  );
  BRAINTREE_API_PAYMENT_TRANSACTION_ENDPOINTS.forEach((element) =>
    fieldDefinitions.push({
      name: `${element}Response`,
      label: {
        en: `${element}Response`,
      },
      type: {
        name: 'String',
      },
      inputHint: 'MultiLine',
      required: false,
    })
  );
  const customType = {
    key: BRAINTREE_PAYMENT_TRANSACTION_TYPE_KEY,
    name: {
      en: 'Custom payment transaction type to braintree fields',
    },
    resourceTypeIds: ['transaction'],
    fieldDefinitions: fieldDefinitions,
  };
  await addOrUpdateCustomType(apiRoot, customType);
}

async function addOrUpdateCustomType(
  apiRoot: ByProjectKeyRequestBuilder,
  customType: TypeDraft
): Promise<void> {
  const {
    body: { results: types },
  } = await apiRoot
    .types()
    .get({
      queryArgs: {
        where: `key = "${customType.key}"`,
      },
    })
    .execute();
  if (types.length > 0) {
    const type = types[0];
    const updates = (customType.fieldDefinitions ?? [])
      .filter(
        (newFieldDefinition: FieldDefinition): boolean =>
          !type.fieldDefinitions.find(
            (existingFieldDefinition: FieldDefinition): boolean =>
              newFieldDefinition.name === existingFieldDefinition.name
          )
      )
      .map((fieldDefinition: FieldDefinition): TypeAddFieldDefinitionAction => {
        return {
          action: 'addFieldDefinition',
          fieldDefinition: fieldDefinition,
        };
      });
    if (updates.length === 0) {
      return;
    }
    await apiRoot
      .types()
      .withKey({ key: customType.key })
      .post({
        body: {
          version: type.version,
          actions: updates,
        },
      })
      .execute();
    return;
  }
  await apiRoot
    .types()
    .post({
      body: customType,
    })
    .execute();
}
