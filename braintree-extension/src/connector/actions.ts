import { ByProjectKeyRequestBuilder } from '@commercetools/platform-sdk/dist/declarations/src/generated/client/by-project-key-request-builder';
import {
  FieldDefinition,
  TypeAddFieldDefinitionAction,
  TypeDraft,
  TypeRemoveFieldDefinitionAction,
  TypeUpdateAction,
} from '@commercetools/platform-sdk/dist/declarations/src/generated/models/type';
import { ExtensionDraft } from '@commercetools/platform-sdk';
import {
  logger,
  BRAINTREE_PAYMENT_TYPE_KEY,
  BRAINTREE_PAYMENT_INTERACTION_TYPE_KEY,
  BRAINTREE_PAYMENT_TRANSACTION_TYPE_KEY,
  BRAINTREE_CUSTOMER_TYPE_KEY,
  BraintreeCustomTypeKeys,
  FieldDefinitionData,
  CUSTOM_TYPE_DESCRIPTORS,
  PAYMENT_INTERACTION_TYPE_FIELDS,
  apiCallNameToFieldData,
  resolveTypeKey,
  toFieldDefinition,
} from 'common-connect/dist';
export const BRAINTREE_EXTENSION_KEY = 'braintree-extension';
export const BRAINTREE_CUSTOMER_EXTENSION_KEY = 'braintree-customer-extension';

export type ExtensionKey =
  | typeof BRAINTREE_EXTENSION_KEY
  | typeof BRAINTREE_CUSTOMER_EXTENSION_KEY;

export { BRAINTREE_PAYMENT_TRANSACTION_TYPE_KEY, BRAINTREE_CUSTOMER_TYPE_KEY };

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

export type { BraintreeCustomTypeKeys };

const brainreeCustomTypeKeys: BraintreeCustomTypeKeys[] = [
  BRAINTREE_PAYMENT_TYPE_KEY,
  BRAINTREE_PAYMENT_INTERACTION_TYPE_KEY,
  BRAINTREE_PAYMENT_TRANSACTION_TYPE_KEY,
  BRAINTREE_CUSTOMER_TYPE_KEY,
];

// The full field set per type — this extension's own schema (every field it provisions). Note
// apiCallNameToFieldData() is called without isProcessor here, so it only ever contributes
// Request+Response fields — the ProcessorRequest field per endpoint is processor's own to
// provision (see processor/src/connectors/post-deploy.ts), not extension's.
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
    ...BRAINTREE_API_PAYMENT_ENDPOINTS.flatMap((endpoint) =>
      apiCallNameToFieldData(endpoint)
    ),
  ],
  [BRAINTREE_PAYMENT_INTERACTION_TYPE_KEY]: PAYMENT_INTERACTION_TYPE_FIELDS,
  [BRAINTREE_PAYMENT_TRANSACTION_TYPE_KEY]: [
    ...BRAINTREE_API_PAYMENT_TRANSACTION_ENDPOINTS.flatMap((endpoint) =>
      apiCallNameToFieldData(endpoint)
    ),
  ],
  [BRAINTREE_CUSTOMER_TYPE_KEY]: [
    {
      name: 'braintreeCustomerId',
      label: {
        en: 'Braintree customer Id',
      },
      inputHint: 'SingleLine',
    },
    ...BRAINTREE_API_CUSTOMER_ENDPOINTS.flatMap((endpoint) =>
      apiCallNameToFieldData(endpoint)
    ),
  ],
};

// Looks up name/resourceTypeIds directly off CUSTOM_TYPE_DESCRIPTORS and resolves the key through
// common-connect — to ensure processor's compatibility.
const customTypeDataToCustomType = (
  key: BraintreeCustomTypeKeys
): TypeDraft => {
  const { name, resourceTypeIds } = CUSTOM_TYPE_DESCRIPTORS[key];
  return {
    key: resolveTypeKey(key),
    name,
    resourceTypeIds,
    fieldDefinitions: customFieldsDefinitionData[key].map(toFieldDefinition),
  };
};

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
  if (!types.find((type) => type.key === customTypeDraft.key)) {
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
