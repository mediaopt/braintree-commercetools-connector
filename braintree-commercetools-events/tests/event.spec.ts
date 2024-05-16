import { NextFunction, Request, Response } from 'express';
import { describe, expect, test } from '@jest/globals';

let api: any;
const addDeliveryDataCallback = jest.fn();
jest.mock('../src/client/create.client', () => ({
  createApiRoot: jest.fn(() => api),
}));
jest.mock('../src/services/braintree.service', () => ({
  addPackageTracking: addDeliveryDataCallback,
}));
import { post } from '../src/controllers/event.controller';
import { ParcelAddedToDeliveryMessagePayload } from '../src/types/index.types';
import { PaymentInteractionAddedMessagePayload } from '@commercetools/platform-sdk/dist/declarations/src/generated/models/message';
import { DeliveryItem } from '@commercetools/platform-sdk';

describe('Testing braintree-commercetools-events Controller', () => {
  function expectSuccessfulResponse(next: NextFunction, response: Response) {
    expect(next).toBeCalledTimes(0);
    expect(response.status).toBeCalledTimes(1);
    expect(response.status).toBeCalledWith(204);
    expect(response.send).toBeCalledTimes(1);
    expect(response.send).toBeCalledWith();
  }

  test.each([
    {
      name: 'with braintree customer and no custom field',
      executeResponse: { body: { custom: { fields: {} } } },
      postExecuted: true,
    },
    {
      name: 'with braintree customer and custom field',
      executeResponse: {
        body: { custom: { fields: { braintreeCustomerId: 123 } } },
      },
      postExecuted: false,
    },
  ])('$name', async ({ executeResponse, postExecuted }) => {
    api = {
      customers: jest.fn(() => api),
      withId: jest.fn(() => api),
      get: jest.fn(() => api),
      execute: jest.fn(() => executeResponse),
      post: jest.fn(() => api),
    };
    const message = {
      type: 'PaymentInteractionAdded',
      interaction: {
        type: {
          typeId: 'type',
          id: '123',
        },
        fields: {
          type: 'transactionSaleResponse',
          data: JSON.stringify({ customer: { id: '123' } }),
        },
      },
    } as PaymentInteractionAddedMessagePayload;
    const data = Buffer.from(JSON.stringify(message)).toString('base64');
    const request = {
      body: {
        message: {
          data: data,
        },
      },
    } as unknown as Request;
    const response = {
      status: jest.fn(() => response),
      send: jest.fn(),
    } as unknown as Response;
    const next = jest.fn();
    await post(request, response, next);
    expectSuccessfulResponse(next, response);
    expect(api.withId).toBeCalledWith({ ID: '123' });
    expect(api.post).toBeCalledTimes(postExecuted ? 1 : 0);
    expect(api.execute).toBeCalledTimes(1 + (postExecuted ? 1 : 0));
  });

  test('test parcel added', async () => {
    const parcelId = '6bc5da53-652e-4d15-bc91-ee4175cffa78';
    const BraintreeOrderId = 1234;
    const captureId = 12345;
    const orderId = '123';
    const lineItemId = '7046a534-61e6-48c2-bf0f-fc754a899432';
    api = {
      orders: jest.fn(() => api),
      withId: jest.fn(() => api),
      get: jest.fn(() => api),
      execute: jest.fn(() => ({
        body: {
          id: orderId,
          lineItems: [
            {
              id: lineItemId,
              name: {
                'en-US': 'Indoor Jute Planter',
                'en-GB': 'Indoor Jute Planter',
                'de-DE': 'Indoor Jute Blumentopf',
              },
              variant: {
                sku: 'IJP-03',
                images: [
                  {
                    url: 'https://storage.googleapis.com/merchant-center-europe/sample-data/goodstore/Indoor_Jute_Planter-1.1.jpeg',
                  },
                ],
              },
            },
          ],
          shippingAddress: { country: 'DE' },
          shippingInfo: {
            deliveries: [
              {
                items: [
                  {
                    id: lineItemId,
                    quantity: 1,
                  } as DeliveryItem,
                ],
                parcels: [
                  {
                    id: parcelId,
                  },
                ],
              },
            ],
          },
          paymentInfo: {
            payments: [
              {
                id: '12',
                obj: {
                  id: '12',
                  custom: { fields: { BraintreeOrderId } },
                  transactions: [{ type: 'Charge', interactionId: captureId }],
                },
              },
            ],
          },
        },
      })),
    };
    const trackingNumber = '123456';
    const message = {
      type: 'ParcelAddedToDelivery',
      notificationType: 'Message',
      id: '1',
      version: 1,
      sequenceNumber: 1,
      resource: {
        id: orderId,
        typeId: 'order',
      },
      resourceVersion: 1,
      parcel: {
        trackingData: {
          trackingId: trackingNumber,
          carrier: 'DHL',
        },
        key: '',
        id: parcelId,
      },
    } as ParcelAddedToDeliveryMessagePayload;
    const data = Buffer.from(JSON.stringify(message)).toString('base64');
    const request = {
      body: {
        message: {
          data,
        },
      },
    } as unknown as Request;
    const response = {
      status: jest.fn(() => response),
      send: jest.fn(),
    } as unknown as Response;
    const next = jest.fn();
    await post(request, response, next);
    expectSuccessfulResponse(next, response);
    expect(api.withId).toBeCalledWith({ ID: orderId });
    expect(addDeliveryDataCallback).toBeCalledTimes(1);
    expect(addDeliveryDataCallback).toBeCalledWith(captureId, {
      carrier: 'DHL',
      trackingNumber,
      lineItems: [
        {
          name: 'Indoor Jute Planter',
          quantity: 1,
          productCode: 'IJP-03',
          image_url:
            'https://storage.googleapis.com/merchant-center-europe/sample-data/goodstore/Indoor_Jute_Planter-1.1.jpeg',
        },
      ],
    });
  });
});

describe('Testing missing data', () => {
  test.each([
    {
      request: {},
      expectedError: 'Bad request: No Pub/Sub message was received',
    },
    {
      request: { body: {} },
      expectedError: 'Bad request: Wrong No Pub/Sub message format',
    },
    {
      request: { body: { message: {} } },
      expectedError: 'Bad request: No payload in the Pub/Sub message',
    },
  ])('test $expectedError', async ({ request, expectedError }) => {
    const response = {} as unknown as Response;
    const next = jest.fn();
    await post(request as Request, response, next);
    expect(next).toBeCalledTimes(1);
    expect(next).toBeCalledWith(new Error(expectedError));
  });
});
