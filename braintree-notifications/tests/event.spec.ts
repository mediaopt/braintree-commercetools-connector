import { Request, Response } from 'express';
import { describe, expect, test } from '@jest/globals';
import { post } from '../src/controllers/notifications.controller';

describe('Testing successful webhook call', () => {
  test('POST `/braintree-notifications` route', async () => {
    const request = {
      body: {
        bt_signature:
          'y9hzdq5d4cjn2367|851194485b07f8bf26b0976178ef1c0621b2ae0d',
        bt_payload:
          'PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiPz4KPG5vdGlm\naWNhdGlvbj4KICA8a2luZD5jaGVjazwva2luZD4KICA8dGltZXN0YW1wIHR5\ncGU9ImRhdGV0aW1lIj4yMDIzLTA3LTI2VDExOjA2OjEyWjwvdGltZXN0YW1w\nPgogIDxzdWJqZWN0PgogICAgPGNoZWNrIHR5cGU9ImJvb2xlYW4iPnRydWU8\nL2NoZWNrPgogIDwvc3ViamVjdD4KPC9ub3RpZmljYXRpb24+Cg==\n',
      },
    } as unknown as Request;
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
