import { NextFunction, Request, Response } from 'express';
import { describe, expect, test } from '@jest/globals';
let api: any;
jest.mock('../src/client/create.client', () => ({
  createApiRoot: jest.fn(() => api),
}));
import { post } from '../src/controllers/event.controller';
import { PaymentInteractionAddedMessagePayload } from '@commercetools/platform-sdk/dist/declarations/src/generated/models/message';

describe('Testing braintree-commercetools-events Controller', () => {
  function expectSuccessfulResponse(next: NextFunction, response: Response) {
    expect(next).toBeCalledTimes(0);
    expect(response.status).toBeCalledTimes(1);
    expect(response.status).toBeCalledWith(200);
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
