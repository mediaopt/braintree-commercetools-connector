// When the lookup asks for a challenge, it must appear within this time: if Songbird is blocked or
// fails to set up, the SDK never shows it and verifyCard hangs. 10 s is the budget commercetools
// sets for payment-related API extensions:
// https://docs.commercetools.com/api/releases/2021-12-09-increased-maximum-timeout-for-payment-related-api-extensions
export const CHALLENGE_SHOW_TIMEOUT_MS = 10000;

export const THREEDS_CONTAINER_ID = "braintree-3ds-container";

// the vault checkbox's label when PerMethodConfig.creditCard.vaultLabel isn't set
export const DEFAULT_VAULT_LABEL = "Save my card";
