import { ByProjectKeyRequestBuilder } from '@commercetools/platform-sdk/dist/declarations/src/generated/client/by-project-key-request-builder';
import {
  FieldDefinition,
  TypeAddFieldDefinitionAction,
  TypeDraft,
  TypeRemoveFieldDefinitionAction,
  TypeUpdateAction,
} from '@commercetools/platform-sdk/dist/declarations/src/generated/models/type';
import { ExtensionDraft, LocalizedString } from '@commercetools/platform-sdk';
import { logger } from '../utils/logger.utils';

export const BRAINTREE_EXTENSION_KEY = 'braintree-extension';
export const BRAINTREE_CUSTOMER_EXTENSION_KEY = 'braintree-customer-extension';

export type ExtensionKey =
  | typeof BRAINTREE_EXTENSION_KEY
  | typeof BRAINTREE_CUSTOMER_EXTENSION_KEY;

export const BRAINTREE_PAYMENT_TYPE_KEY = 'braintree-payment-type';
export const BRAINTREE_PAYMENT_INTERACTION_TYPE_KEY =
  'braintree-payment-interaction-type';
export const BRAINTREE_PAYMENT_TRANSACTION_TYPE_KEY =
  'braintree-payment-transaction-type';
export const BRAINTREE_CUSTOMER_TYPE_KEY = 'braintree-customer-type';

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

export const BRAINTREE_API_PAYMENT_TRANSACTION_ENDPOINTS = [
  'refund',
  'submitForSettlement',
  'void',
];

export const BRAINTREE_API_CUSTOMER_ENDPOINTS = [
  'find',
  'create',
  'vault',
  'updatePayment',
  'deletePayment',
];

type EndpointData = {
  resourceTypeId: string;
  condition: string;
  timeoutInMs: number;
};

function mapEndpointsToCondition(endpoints: string[]) {
  return (
    'custom is defined AND custom(fields is defined) AND (' +
    endpoints
      .map((endpoint) => `custom(fields(${endpoint}Request is defined))`)
      .join(' or ') +
    ')'
  );
}

const extensionData: Record<ExtensionKey, EndpointData> = {
  [BRAINTREE_EXTENSION_KEY]: {
    resourceTypeId: 'payment',
    condition: mapEndpointsToCondition(BRAINTREE_API_PAYMENT_ENDPOINTS),
    timeoutInMs: 10000,
  },
  [BRAINTREE_CUSTOMER_EXTENSION_KEY]: {
    resourceTypeId: 'customer',
    condition: mapEndpointsToCondition(BRAINTREE_API_CUSTOMER_ENDPOINTS),
    timeoutInMs: 2000,
  },
};

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

const newExtensionBody = (
  key: ExtensionKey,
  applicationUrl: string
): ExtensionDraft => {
  const { resourceTypeId, condition, timeoutInMs } = extensionData[key];
  return {
    key: key,
    timeoutInMs,
    destination: {
      type: 'HTTP',
      url: applicationUrl,
    },
    triggers: [
      {
        actions: ['Update'],
        resourceTypeId,
        condition,
      },
    ],
  };
};

export async function createExtension(
  apiRoot: ByProjectKeyRequestBuilder,
  applicationUrl: string,
  extensionKey: ExtensionKey
) {
  await deleteExtensionIfExist(apiRoot, extensionKey);
  await apiRoot
    .extensions()
    .post({ body: newExtensionBody(extensionKey, applicationUrl) })
    .execute();
  logger.info(`extension with key ${extensionKey} is created`);
}

export type BraintreeCustomTypeKeys =
  | typeof BRAINTREE_PAYMENT_TYPE_KEY
  | typeof BRAINTREE_PAYMENT_INTERACTION_TYPE_KEY
  | typeof BRAINTREE_PAYMENT_TRANSACTION_TYPE_KEY
  | typeof BRAINTREE_CUSTOMER_TYPE_KEY;

const brainreeCustomTypeKeys: BraintreeCustomTypeKeys[] = [
  BRAINTREE_PAYMENT_TYPE_KEY,
  BRAINTREE_PAYMENT_INTERACTION_TYPE_KEY,
  BRAINTREE_PAYMENT_TRANSACTION_TYPE_KEY,
  BRAINTREE_CUSTOMER_TYPE_KEY,
];

type FieldDefinitionData = {
  name: string;
  label?: LocalizedString;
  typeName?: 'String' | 'DateTime';
  inputHint?: 'SingleLine' | 'MultiLine';
};

const apiCallNameToFieldData = (apiCallName: string): FieldDefinitionData[] => [
  {
    name: `${apiCallName}Request`,
    inputHint: 'MultiLine',
  },
  {
    name: `${apiCallName}Response`,
    inputHint: 'MultiLine',
  },
];

const customFieldsDefinitionData: Record<
  BraintreeCustomTypeKeys,
  FieldDefinitionData[]
> = {
  [BRAINTREE_PAYMENT_TYPE_KEY]: [
    {
      name: `LocalPaymentMethodsPaymentId`,
      label: {
        en: `Payment Id of a local payment method (Bancontact, iDEAL, ...)`,
        de: `Payment Id einer lokalen Zahlungsart (Bancontact, iDEAL, ...)`,
      },
    },
    {
      name: `BraintreeOrderId`,
      label: {
        en: `Order Id`,
        de: 'Bestellnummer',
      },
    },
    ...BRAINTREE_API_PAYMENT_ENDPOINTS.map((endpoint) =>
      apiCallNameToFieldData(endpoint)
    ).flat(),
  ],
  [BRAINTREE_PAYMENT_INTERACTION_TYPE_KEY]: [
    { name: 'type', inputHint: 'SingleLine' },
    { name: 'data', inputHint: 'MultiLine' },
    { name: 'timestamp', typeName: 'DateTime' },
  ],
  [BRAINTREE_PAYMENT_TRANSACTION_TYPE_KEY]: [
    ...BRAINTREE_API_PAYMENT_TRANSACTION_ENDPOINTS.map((endpoint) =>
      apiCallNameToFieldData(endpoint)
    ).flat(),
  ],
  [BRAINTREE_CUSTOMER_TYPE_KEY]: [
    {
      name: 'braintreeCustomerId',
      label: {
        en: 'Braintree customer Id',
      },
      inputHint: 'SingleLine',
    },
    ...BRAINTREE_API_CUSTOMER_ENDPOINTS.map((endpoint) =>
      apiCallNameToFieldData(endpoint)
    ).flat(),
  ],
};

const fieldCredentialsToDefinition = ({
  name,
  label,
  typeName,
  inputHint,
}: FieldDefinitionData): FieldDefinition => ({
  name,
  label: label ?? { en: name },
  type: { name: typeName ?? 'String' },
  inputHint,
  required: false,
});

const customTypesNames: Record<
  BraintreeCustomTypeKeys,
  { name: LocalizedString; resourceTypeIds: string[] }
> = {
  [BRAINTREE_PAYMENT_TYPE_KEY]: {
    name: {
      en: 'Custom payment type to braintree fields',
    },
    resourceTypeIds: ['payment'],
  },
  [BRAINTREE_PAYMENT_INTERACTION_TYPE_KEY]: {
    name: {
      en: 'Custom payment interaction type to braintree fields',
    },
    resourceTypeIds: ['payment-interface-interaction'],
  },
  [BRAINTREE_PAYMENT_TRANSACTION_TYPE_KEY]: {
    name: {
      en: 'Custom payment transaction type to braintree fields',
    },
    resourceTypeIds: ['transaction'],
  },
  [BRAINTREE_CUSTOMER_TYPE_KEY]: {
    name: {
      en: 'Custom customer type to braintree fields',
    },
    resourceTypeIds: ['customer'],
  },
};

const customTypeDataToCustomType = (
  key: BraintreeCustomTypeKeys
): TypeDraft => ({
  ...customTypesNames[key],
  key,
  fieldDefinitions: customFieldsDefinitionData[key].map(
    fieldCredentialsToDefinition
  ),
});

const customTypesDrafts = Object.fromEntries(
  brainreeCustomTypeKeys.map((key) => [key, customTypeDataToCustomType(key)])
);

async function queryTypesByResourceId(
  apiRoot: ByProjectKeyRequestBuilder,
  resourceTypeId: string
) {
  const {
    body: { results: types },
  } = await apiRoot
    .types()
    .get({
      queryArgs: {
        where: `resourceTypeIds contains any ("${resourceTypeId}")`,
      },
    })
    .execute();
  return types;
}

const findMatchingDefinitions = (
  newDefinitions: FieldDefinition[],
  existingDefinitions: FieldDefinition[],
  alreadyExisting = false
) =>
  newDefinitions.filter((newFieldDefinition: FieldDefinition): boolean => {
    const alreadyExists = existingDefinitions.some(
      (existingFieldDefinition: FieldDefinition): boolean =>
        newFieldDefinition.name === existingFieldDefinition.name
    );
    return alreadyExisting ? alreadyExists : !alreadyExists;
  });

async function updateType(
  apiRoot: ByProjectKeyRequestBuilder,
  key: string,
  version: number,
  actions: TypeUpdateAction[]
) {
  await apiRoot
    .types()
    .withKey({ key })
    .post({
      body: {
        version,
        actions,
      },
    })
    .execute();
}

export async function addOrUpdateCustomType(
  apiRoot: ByProjectKeyRequestBuilder,
  customTypeKey: BraintreeCustomTypeKeys
): Promise<void> {
  const customTypeDraft = customTypesDrafts[customTypeKey];
  const types = await queryTypesByResourceId(
    apiRoot,
    customTypeDraft.resourceTypeIds[0]
  );
  for (const type of types) {
    const updates = findMatchingDefinitions(
      customTypeDraft.fieldDefinitions ?? [],
      type.fieldDefinitions,
      false
    ).map((fieldDefinition: FieldDefinition): TypeAddFieldDefinitionAction => {
      return {
        action: 'addFieldDefinition',
        fieldDefinition: fieldDefinition,
      };
    });
    if (updates.length > 0) {
      await updateType(apiRoot, type.key, type.version, updates);
      logger.info(`existing type ${type.key} is updated`);
    }
  }
  if (!types.find((type) => type.key === customTypeKey)) {
    await apiRoot
      .types()
      .post({
        body: customTypeDraft,
      })
      .execute();
    logger.info(`type ${customTypeKey} is created`);
  }
}

export async function deleteOrUpdateCustomType(
  apiRoot: ByProjectKeyRequestBuilder,
  customType: BraintreeCustomTypeKeys
) {
  const customTypeDraft = customTypesDrafts[customType];
  const types = await queryTypesByResourceId(
    apiRoot,
    customTypeDraft.resourceTypeIds[0]
  );
  for (const type of types) {
    const { key, version, fieldDefinitions } = type;
    const updates = findMatchingDefinitions(
      customTypeDraft.fieldDefinitions ?? [],
      fieldDefinitions,
      true
    ).map(
      (fieldDefinition: FieldDefinition): TypeRemoveFieldDefinitionAction => ({
        action: 'removeFieldDefinition',
        fieldName: fieldDefinition.name,
      })
    );
    if (type.fieldDefinitions?.length === updates.length) {
      try {
        await apiRoot
          .types()
          .withKey({ key })
          .delete({
            queryArgs: {
              version,
            },
          })
          .execute();
        logger.info(`custom type with key ${key} is deleted`);
      } catch (e) {
        logger.warn(
          `could not delete custom type ${key}: error "${
            (e as Error).message
          }" received`
        );
      }
    } else {
      if (updates.length) {
        await updateType(apiRoot, key, version, updates);
        logger.info(
          `only fields related to custom type ${customType} of type ${key} were removed`
        );
      } else
        logger.info(
          `type ${key} had no fields that match the custom type ${customType}`
        );
    }
  }
}
