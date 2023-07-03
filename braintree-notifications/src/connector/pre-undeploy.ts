import dotenv from 'dotenv';
dotenv.config();

import { assertError } from '../utils/assert.utils';

async function preUndeploy(): Promise<void> {}

async function run(): Promise<void> {
  try {
    await preUndeploy();
  } catch (error) {
    assertError(error);
    process.stderr.write(`Post-undeploy failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}

run();
