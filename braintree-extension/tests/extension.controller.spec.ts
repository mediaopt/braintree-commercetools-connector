import { Request, Response } from 'express';
import { post } from '../src/controllers/extension.controller';
import { expect } from '@jest/globals';

describe('test controller with wrong requests', () => {
  test.each([
    {
      action: 'Create',
      type: 'payment',
    },
    {
      action: 'Create',
      type: 'customer',
    },
    {
      action: 'Update',
      type: 'order',
    },
  ])('call $action $type', async ({ action, type }) => {
    const request = ({
      body: {
        action: action,
        resource: {
          typeId: type,
        },
      },
    } as unknown) as Request;
    const response = ({} as unknown) as Response;
    const next = jest.fn();
    await post(request, response, next);
    expect(next).toBeCalledTimes(1);
  });
});
