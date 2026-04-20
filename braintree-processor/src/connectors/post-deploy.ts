import * as dotenv from 'dotenv';
dotenv.config();

/**
 * Note: Custom types are managed by the extension module's post-deploy script
 * to prevent concurrent modification issues
 */

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function postDeploy(_properties: Map<string, unknown>) {}

async function runPostDeployScripts() {
  try {
    const properties = new Map(Object.entries(process.env));
    await postDeploy(properties);
  } catch (error) {
    if (error instanceof Error) {
      process.stderr.write(`Post-deploy failed: ${error.message}\n`);
    }
    process.exitCode = 1;
  }
}

runPostDeployScripts();
