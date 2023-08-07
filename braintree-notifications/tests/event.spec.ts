import { Request, Response } from 'express';
import { describe, expect, test, jest } from '@jest/globals';

import { post } from '../src/controllers/notifications.controller';
import { getBraintreeGateway } from '../src/service/braintree.service';

let api: any;
jest.mock('../src/client/create.client', () => ({
  createApiRoot: jest.fn(() => api),
}));

jest.mock('../src/service/commercetools.service', () => ({
  handleLocalPaymentCompleted: jest.fn(() => {
    return;
  }),
}));

type WebhookNotificationKind = 'check' | 'local_payment_completed';

const getRequest = async (kind: WebhookNotificationKind): Promise<Request> => {
  const gateway = getBraintreeGateway();

  const { bt_payload, bt_signature } =
    await gateway.webhookTesting.sampleNotification(kind, 'testId');

  return {
    body: {
      bt_signature,
      bt_payload,
    },
  } as unknown as Request;
};

describe('Testing missing data', () => {
  test.each([
    {
      request: {},
      expectedError: 'Bad request: Missing body',
    },
    {
      request: { body: {} },
      expectedError: 'Bad request: Missing signature',
    },
    {
      request: { body: { bt_signature: 'lorem ipsum' } },
      expectedError: 'Bad request: Missing payload',
    },
    {
      request: {
        body: { bt_signature: 'lorem ipsum', bt_payload: 'lorem ipsum' },
      },
      expectedError: 'payload contains illegal characters',
    },
  ])('test $expectedError', async ({ request, expectedError }) => {
    const response = {} as unknown as Response;
    const next = jest.fn();
    await post(request as Request, response, next);
    expect(next).toBeCalledTimes(1);
    expect(next).toBeCalledWith(new Error(expectedError));
  });
});

describe('Testing webhooks', () => {
  test.each([
    {
      kind: 'check',
      title: 'check',
    },
    {
      kind: 'local_payment_completed',
      title: 'completed',
    },
  ])('Testing $title webhook call', async ({ kind }) => {
    const request = await getRequest(kind as WebhookNotificationKind);

    const response = {
      status: jest.fn(() => response),
      send: jest.fn(),
    } as unknown as Response;

    const next = jest.fn();
    await post(request, response, next);
    expect(next).toBeCalledTimes(0);
    expect(response.status).toBeCalledTimes(1);
    expect(response.status).toBeCalledWith(200);
    expect(response.send).toBeCalledTimes(1);
    expect(response.send).toBeCalledWith();
  });
});
