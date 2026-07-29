/**
 * Note: Custom types are managed by the extension module's post-deploy script
 * to prevent concurrent modification issues, so this file is intentionally left blank
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
