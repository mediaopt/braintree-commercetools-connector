/**
 * Note: processor's connectors/post-deploy.ts creates/updates only its own fields on the shared
 * custom types (never the types themselves). Deleting/cleaning those types up is left entirely to
 * braintree-extension's own pre-undeploy (deleteOrUpdateCustomType), which owns them — that
 * removes whatever processor added too, so this file is intentionally left blank.
 */

async function preUndeploy() {}

async function run() {
  try {
    await preUndeploy();
  } catch (error) {
    if (error instanceof Error) {
      process.stderr.write(`Post-undeploy failed: ${error.message}\n`);
    }
    process.exitCode = 1;
  }
}
run();
