import { describe, expect, test } from '@jest/globals';
import { getClientToken } from '../src/service/braintree.service';

describe('Testing Braintree GetClient Token', () => {
  test('create client token', async () => {
    await expect(getClientToken({})).resolves.toMatch(/.*==/);
  });
  test.each([
    {
      name: 'makeDefault',
      option: { makeDefault: true },
    },
    {
      name: 'verifyCard',
      option: { verifyCard: true },
    },
    {
      name: 'failOnDuplicatePaymentMethod',
      option: { failOnDuplicatePaymentMethod: true },
    },
    {
      name: 'unknown user',
      option: { customerId: '123' },
    },
  ])('create client token with $name', async ({ option }) => {
    await expect(getClientToken({ options: option })).rejects.toBeInstanceOf(
      Error
    );
  });
});
