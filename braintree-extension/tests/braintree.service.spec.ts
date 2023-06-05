import { describe, expect, test } from '@jest/globals';
import { getClientToken } from '../src/service/braintree.service';

describe('Testing Braintree GetClient Token', () => {
  test('create client token', async () => {
    await expect(getClientToken({})).resolves.toMatch(/.*==/);
  });
  test('create client token with makeDefault', async () => {
    await expect(
      getClientToken({ options: { makeDefault: true } })
    ).rejects.toBeInstanceOf(Error);
  });
  test('create client token with verifyCard', async () => {
    await expect(
      getClientToken({ options: { verifyCard: true } })
    ).rejects.toBeInstanceOf(Error);
  });
  test('create client token with failOnDuplicatePaymentMethod', async () => {
    await expect(
      getClientToken({ options: { failOnDuplicatePaymentMethod: true } })
    ).rejects.toBeInstanceOf(Error);
  });
  test('create client token with unknown user', async () => {
    await expect(getClientToken({ customerId: '123' })).rejects.toBeInstanceOf(
      Error
    );
  });
});
