import * as dotenv from 'dotenv';

dotenv.config();

import { createApiRoot } from '../client/create.client';
import { assertError, assertString } from '../utils/assert.utils';
import {
  addOrUpdateCustomType,
  BRAINTREE_CUSTOMER_EXTENSION_KEY,
  BRAINTREE_CUSTOMER_TYPE_KEY,
  BRAINTREE_EXTENSION_KEY,
  BRAINTREE_PAYMENT_INTERACTION_TYPE_KEY,
  BRAINTREE_PAYMENT_TRANSACTION_TYPE_KEY,
  BRAINTREE_PAYMENT_TYPE_KEY,
  createExtension,
} from './actions';

const CONNECT_APPLICATION_URL_KEY = 'CONNECT_SERVICE_URL';

async function postDeploy(properties: Map<string, unknown>): Promise<void> {
  const applicationUrl = properties.get(CONNECT_APPLICATION_URL_KEY);

  assertString(applicationUrl, CONNECT_APPLICATION_URL_KEY);

  const apiRoot = createApiRoot();
  await createExtension(apiRoot, applicationUrl, BRAINTREE_EXTENSION_KEY);
  await createExtension(
    apiRoot,
    applicationUrl,
    BRAINTREE_CUSTOMER_EXTENSION_KEY
  );
  await addOrUpdateCustomType(apiRoot, BRAINTREE_PAYMENT_TYPE_KEY);
  await addOrUpdateCustomType(apiRoot, BRAINTREE_PAYMENT_INTERACTION_TYPE_KEY);
  await addOrUpdateCustomType(apiRoot, BRAINTREE_PAYMENT_TRANSACTION_TYPE_KEY);
  await addOrUpdateCustomType(apiRoot, BRAINTREE_CUSTOMER_TYPE_KEY);
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
