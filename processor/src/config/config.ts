import {
  BRAINTREE_PAYMENT_TYPE_KEY,
  BRAINTREE_PAYMENT_INTERACTION_TYPE_KEY,
  resolveTypeKey,
} from 'common-connect/dist';

export const config = {
  // Required by Payment SDK
  projectKey: process.env.CTP_PROJECT_KEY || 'payment-integration',
  clientId: process.env.CTP_CLIENT_ID || 'xxx',
  clientSecret: process.env.CTP_CLIENT_SECRET || 'xxx',
  jwksUrl: process.env.CTP_JWKS_URL || 'https://mc-api.europe-west1.gcp.commercetools.com/.well-known/jwks.json',
  jwtIssuer: process.env.CTP_JWT_ISSUER || 'https://mc-api.europe-west1.gcp.commercetools.com',
  authUrl: process.env.CTP_AUTH_URL || 'https://auth.europe-west1.gcp.commercetools.com',
  apiUrl: process.env.CTP_API_URL || 'https://api.europe-west1.gcp.commercetools.com',
  sessionUrl: process.env.CTP_SESSION_URL || 'https://session.europe-west1.gcp.commercetools.com/',
  checkoutUrl: process.env.CTP_CHECKOUT_URL || 'https://checkout.europe-west1.gcp.commercetools.com',

  healthCheckTimeout: parseInt(process.env.HEALTH_CHECK_TIMEOUT || '5000'),

  // Required by logger
  loggerLevel: process.env.LOGGER_LEVEL || 'info',

  // Required for Braintree
  braintreePublicKey: process.env.BRAINTREE_PUBLIC_KEY,
  braintreePrivateKey: process.env.BRAINTREE_PRIVATE_KEY,
  braintreeEnvironment: process.env.BRAINTREE_ENVIRONMENT || 'Sandbox',
  //recommended for Braintree
  braintreeMerchantId: process.env.BRAINTREE_MERCHANT_ID,
  merchantAccountId: process.env.BRAINTREE_MERCHANT_ACCOUNT || undefined, //required for local payment methods, recommended for all

  // Payment Providers config
  returnUrl: process.env.MERCHANT_RETURN_URL || '',
  localPaymentFallbackUrl: process.env.LOCAL_PAYMENT_FALLBACK_URL || '', //required for local payment methods
  paymentInterface: 'Braintree',

  // `supportedUIElements`, `enableStoreDetails`, `sellerReturnUrl` from
  // commercetools' connect-payment-integration-template are intentionally
  // omitted: they are unimplemented boilerplate with no functioning upstream
  // usage, so `enableVaulting` below was kept as the relevant, working
  // setting instead. Please open an issue if you have a concrete need for
  // any of these.

  // env variables related to stored payment methods feature
  storedPaymentMethodsEnabled: process.env.STORED_PAYMENT_METHODS_ENABLED || 'false',
  storedPaymentMethodsPaymentInterface: process.env.STORED_PAYMENT_METHODS_PAYMENT_INTERFACE || 'Braintree',
  storedPaymentMethodsInterfaceAccount: process.env.STORED_PAYMENT_METHODS_INTERFACE_ACCOUNT || undefined,

  // General feature flags
  autoCapture: process.env.BRAINTREE_AUTOCAPTURE === 'true',
  enableVaulting: process.env.STORED_PAYMENT_METHODS_ENABLED === 'true',

  // Custom type keys for processor-owned audit logging (see connectors/post-deploy.ts) — same
  // env-override/fallback resolution as braintree-extension's own type key resolution, so both
  // modules resolve to the same custom types when both are installed on the same project.
  paymentTypeKey: resolveTypeKey(BRAINTREE_PAYMENT_TYPE_KEY),
  interactionTypeKey: resolveTypeKey(BRAINTREE_PAYMENT_INTERACTION_TYPE_KEY),

  // Per-button style overrides forwarded via /operations/config → enabler baseOptions → RenderTemplate buttonStyleOverrides
  // Format: JSON object with keys: paypal, paypalExpress, paypalVault, ach, applePay, googlePay, venmo, creditCard — all optional
  buttonStyleOverrides: process.env.BRAINTREE_BUTTON_STYLES
    ? JSON.parse(process.env.BRAINTREE_BUTTON_STYLES)
    : undefined,

  // Per-method required config (non-style, method-specific identifiers)
  // Format: JSON object, e.g. {"googlePay":{"googleMerchantId":"...","acquirerCountryCode":"DE"},"venmo":{"profileId":"..."}}
  perMethodConfig: process.env.BRAINTREE_PER_METHOD_CONFIG
    ? JSON.parse(process.env.BRAINTREE_PER_METHOD_CONFIG)
    : undefined,
};

export const getConfig = () => {
  return config;
};
