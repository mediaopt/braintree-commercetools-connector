import * as dotenv from 'dotenv';

dotenv.config();

import { createApiRoot } from '../client/create.client';
import { assertError, assertString } from '../utils/assert.utils';
import {
  createCustomPaymentType,
  createBraintreeExtension,
  createCustomPaymentInteractionType,
  createCustomPaymentTransactionType,
  createCustomCustomerType,
} from './actions';

const CONNECT_APPLICATION_URL_KEY = 'CONNECT_SERVICE_URL';

async function postDeploy(properties: Map<string, unknown>): Promise<void> {
  const applicationUrl = properties.get(CONNECT_APPLICATION_URL_KEY);

  assertString(applicationUrl, CONNECT_APPLICATION_URL_KEY);

  const apiRoot = await createApiRoot();
  await createBraintreeExtension(apiRoot, applicationUrl);
  await createCustomPaymentType(apiRoot);
  await createCustomPaymentInteractionType(apiRoot);
  await createCustomPaymentTransactionType(apiRoot);
  await createCustomCustomerType(apiRoot);
}

async function run(): Promise<void> {
  try {
    const properties = new Map(Object.entries(process.env));
    await postDeploy(properties);
  } catch (error) {
    assertError(error);
    process.stderr.write(`Post-deploy failed: ${error.message}`);
    process.exitCode = 1;
  }
}

run();
