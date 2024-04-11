import { ByProjectKeyRequestBuilder } from '@commercetools/platform-sdk/dist/declarations/src/generated/client/by-project-key-request-builder';
import {
  FieldDefinition,
  TypeAddFieldDefinitionAction,
  TypeDraft,
} from '@commercetools/platform-sdk/dist/declarations/src/generated/models/type';

export const BRAINTREE_EXTENSION_KEY = 'braintree-extension';
export const BRAINTREE_CUSTOMER_EXTENSION_KEY = 'braintree-customer-extension';
const BRAINTREE_CUSTOMER_TYPE_KEY = 'braintree-customer-type';
export const BRAINTREE_API_CUSTOMER_ENDPOINTS = [
  'find',
  'create',
  'vault',
  'updatePayment',
  'deletePayment',
];
const BRAINTREE_PAYMENT_TYPE_KEY = 'braintree-payment-type';
export const BRAINTREE_PAYMENT_INTERACTION_TYPE_KEY =
  'braintree-payment-interaction-type';
export const BRAINTREE_API_PAYMENT_ENDPOINTS = [
  'getClientToken',
  'transactionSale',
  'refund',
  'submitForSettlement',
  'void',
  'findTransaction',
  'payPalOrder',
  'addPackageTracking',
];
export const BRAINTREE_PAYMENT_TRANSACTION_TYPE_KEY =
  'braintree-payment-transaction-type';
export const BRAINTREE_API_PAYMENT_TRANSACTION_ENDPOINTS = [
  'refund',
  'submitForSettlement',
  'void',
];

export async function deleteExtensionIfExist(
  apiRoot: ByProjectKeyRequestBuilder,
  extensionKey: string
) {
  const {
    body: { results: extensions },
  } = await apiRoot
    .extensions()
    .get({
      queryArgs: {
        where: `key = "${extensionKey}"`,
      },
    })
    .execute();

  if (extensions.length > 0) {
    const extension = extensions[0];

    await apiRoot
      .extensions()
      .withKey({ key: extensionKey })
      .delete({
        queryArgs: {
          version: extension.version,
        },
      })
      .execute();
  }
}

export async function createBraintreePaymentExtension(
  apiRoot: ByProjectKeyRequestBuilder,
  applicationUrl: string
): Promise<void> {
  await deleteExtensionIfExist(apiRoot, BRAINTREE_EXTENSION_KEY);

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
            condition: mapEndpointsToCondition(BRAINTREE_API_PAYMENT_ENDPOINTS),
          },
        ],
        timeoutInMs: 10000,
      },
    })
    .execute();
}

function mapEndpointsToCondition(endpoints: string[]) {
  return (
    'custom is defined AND custom(fields is defined) AND (' +
    endpoints
      .map((endpoint) => `custom(fields(${endpoint}Request is defined))`)
      .join(' or ') +
    ')'
  );
}

export async function createBraintreeCustomerExtension(
  apiRoot: ByProjectKeyRequestBuilder,
  applicationUrl: string
): Promise<void> {
  await deleteExtensionIfExist(apiRoot, BRAINTREE_CUSTOMER_EXTENSION_KEY);

  await apiRoot
    .extensions()
    .post({
      body: {
        key: BRAINTREE_CUSTOMER_EXTENSION_KEY,
        destination: {
          type: 'HTTP',
          url: applicationUrl,
        },
        triggers: [
          {
            resourceTypeId: 'customer',
            actions: ['Update'],
            condition: mapEndpointsToCondition(
              BRAINTREE_API_CUSTOMER_ENDPOINTS
            ),
          },
        ],
        timeoutInMs: 2000,
      },
    })
    .execute();
}

export async function createCustomPaymentType(
  apiRoot: ByProjectKeyRequestBuilder
): Promise<void> {
  const fieldDefinitions: FieldDefinition[] = [
    {
      name: `LocalPaymentMethodsPaymentId`,
      label: {
        en: `Payment Id of a local payment method (Bancontact, iDEAL, ...)`,
        de: `Payment Id einer lokalen Zahlungsart (Bancontact, iDEAL, ...)`,
      },
      type: {
        name: 'String',
      },
      required: false,
    },
    {
      name: `BraintreeOrderId`,
      label: {
        en: `Order Id`,
        de: 'Bestellnummer',
      },
      type: {
        name: 'String',
      },
      required: false,
    },
  ];
  BRAINTREE_API_PAYMENT_ENDPOINTS.forEach((element) =>
    fieldDefinitions.push(
      {
        name: `${element}Request`,
        label: {
          en: `${element}Request`,
        },
        type: {
          name: 'String',
        },
        inputHint: 'MultiLine',
        required: false,
      },
      {
        name: `${element}Response`,
        label: {
          en: `${element}Response`,
        },
        type: {
          name: 'String',
        },
        inputHint: 'MultiLine',
        required: false,
      }
    )
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
      name: 'braintreeCustomerId',
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

  BRAINTREE_API_CUSTOMER_ENDPOINTS.forEach((element) =>
    fieldDefinitions.push(
      {
        name: `${element}Request`,
        label: {
          en: `${element}Request`,
        },
        type: {
          name: 'String',
        },
        inputHint: 'MultiLine',
        required: false,
      },
      {
        name: `${element}Response`,
        label: {
          en: `${element}Response`,
        },
        type: {
          name: 'String',
        },
        inputHint: 'MultiLine',
        required: false,
      }
    )
  );
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
