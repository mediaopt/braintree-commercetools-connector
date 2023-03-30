import { ByProjectKeyRequestBuilder } from '@commercetools/platform-sdk/dist/declarations/src/generated/client/by-project-key-request-builder';

const BRAINTREE_EXTENSION_KEY = 'braintree-extension';
const BRAINTREE_PAYMENT_TYPE_KEY = 'braintree-payment-type';

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
  const {
    body: { results: types },
  } = await apiRoot
    .types()
    .get({
      queryArgs: {
        where: `key = "${BRAINTREE_PAYMENT_TYPE_KEY}"`,
      },
    })
    .execute();

  if (types.length > 0) {
    const type = types[0];

    await apiRoot
      .types()
      .withKey({ key: BRAINTREE_PAYMENT_TYPE_KEY })
      .delete({
        queryArgs: {
          version: type.version,
        },
      })
      .execute();
  }

  await apiRoot
    .types()
    .post({
      body: {
        key: BRAINTREE_PAYMENT_TYPE_KEY,
        name: {
          en: 'Custom payment type to braintree fields',
        },
        resourceTypeIds: ['payment'],
        fieldDefinitions: [],
      },
    })
    .execute();
}
