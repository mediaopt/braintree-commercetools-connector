import { ByProjectKeyRequestBuilder } from '@commercetools/platform-sdk/dist/declarations/src/generated/client/by-project-key-request-builder';
import { MessageSubscription } from '@commercetools/platform-sdk';

const PAYMENT_UPDATE_SUBSCRIPTION_KEY =
  'braintree-commercetools-events-payment-update-subscription';
export const BRAINTREE_PARCEL_ADDED_TO_DELIVERY_KEY =
  'braintree-commercetools-events-parcelAddedToDelivery';

export const BRAINTREE_CUSTOMER_TYPE_KEY = 'braintree-customer-type';

export async function createPaymentInteractionAddedSubscription(
  apiRoot: ByProjectKeyRequestBuilder,
  topicName: string,
  projectId: string
): Promise<void> {
  await createSubscription(
    PAYMENT_UPDATE_SUBSCRIPTION_KEY,
    {
      resourceTypeId: 'payment',
      types: ['PaymentInteractionAdded'],
    },
    apiRoot,
    topicName,
    projectId
  );
}

export async function deleteCustomerCreateSubscription(
  apiRoot: ByProjectKeyRequestBuilder
): Promise<void> {
  return await deleteSubscription(PAYMENT_UPDATE_SUBSCRIPTION_KEY, apiRoot);
}

export async function createParcelAddedToDeliverySubscription(
  apiRoot: ByProjectKeyRequestBuilder,
  topicName: string,
  projectId: string
): Promise<void> {
  await createSubscription(
    BRAINTREE_PARCEL_ADDED_TO_DELIVERY_KEY,
    {
      resourceTypeId: 'order',
      types: ['ParcelAddedToDelivery'],
    },
    apiRoot,
    topicName,
    projectId
  );
  await deleteParcelAddedToDeliverySubscription(apiRoot);

  await apiRoot
    .subscriptions()
    .post({
      body: {
        key: BRAINTREE_PARCEL_ADDED_TO_DELIVERY_KEY,
        destination: {
          type: 'GoogleCloudPubSub',
          topic: topicName,
          projectId,
        },
        messages: [
          {
            resourceTypeId: 'order',
            types: ['ParcelAddedToDelivery'],
          },
        ],
      },
    })
    .execute();
}

export async function deleteParcelAddedToDeliverySubscription(
  apiRoot: ByProjectKeyRequestBuilder
): Promise<void> {
  return await deleteSubscription(
    BRAINTREE_PARCEL_ADDED_TO_DELIVERY_KEY,
    apiRoot
  );
}

async function createSubscription(
  subscriptionKey: string,
  message: MessageSubscription,
  apiRoot: ByProjectKeyRequestBuilder,
  topicName: string,
  projectId: string
): Promise<void> {
  await deleteSubscription(subscriptionKey, apiRoot);

  await apiRoot
    .subscriptions()
    .post({
      body: {
        key: subscriptionKey,
        destination: {
          type: 'GoogleCloudPubSub',
          topic: topicName,
          projectId,
        },
        messages: [message],
      },
    })
    .execute();
}

async function deleteSubscription(
  subscriptionKey: string,
  apiRoot: ByProjectKeyRequestBuilder
): Promise<void> {
  const {
    body: { results: subscriptions },
  } = await apiRoot
    .subscriptions()
    .get({
      queryArgs: {
        where: `key = "${subscriptionKey}"`,
      },
    })
    .execute();

  if (subscriptions.length > 0) {
    const subscription = subscriptions[0];

    await apiRoot
      .subscriptions()
      .withKey({ key: subscriptionKey })
      .delete({
        queryArgs: {
          version: subscription.version,
        },
      })
      .execute();
  }
}
