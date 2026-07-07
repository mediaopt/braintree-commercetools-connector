# Braintree Enabler

The enabler is the frontend component library for the commercetools Checkout-compatible Braintree connector. Together with the `processor` module, it replaces the functionality of the discontinued [`braintree-commercetools-client`](https://www.npmjs.com/package/braintree-commercetools-client) npm package. The enabler renders the buttons and talks to the browser-side Braintree/PayPal SDKs, and the `processor` module handles server-side (creating commercetools payments, calling Braintree, syncing state back to commercetools).

`BraintreePaymentEnabler` (`src/payment-enabler/payment-enabler-braintree.ts`) is the entry point. It fetches configuration from the processor (`GET /operations/config`) at construction time, then exposes three builder factories:

- `createComponentBuilder(type)` — standard payment methods (Credit Card, PayPal, Google Pay, Apple Pay, Venmo, ACH, local payment methods)
- `createStoredPaymentMethodBuilder(type)` — stored/vaulted methods (Credit Card; please open an issue if you need PayPal or ACH)
- `createExpressBuilder(type)` — PayPal Express (Buy Now)

See the root [`README.md`](../README.md#payment-methods-and-their-restrictions) for the full list of supported payment methods, their `paymentMethodType` values, and country/currency requirements.

## General properties

Every component needs at minimum:

- **`processorUrl`**: `string` — base URL of your deployed `processor` instance.
- **`sessionId`**: `string` — the commercetools Checkout session ID.
- **`purchaseCallback`**: `(result, options?) => void` — called after a transaction completes. If omitted, the enabler falls back to redirecting to `MERCHANT_RETURN_URL` (configured on the processor).
- **`paymentMethodType`**: which component to render (see the payment-methods table linked above).
- **`builderType`**: `"express"` (optional) — distinguishes the PayPal Express flow from standard rendering.

## Button styling and per-method identifiers come from the processor

Nearly everything that makes a button look and behave a specific way — colors, labels, `googleMerchantId`, `venmo.profileId`, the vault-checkbox label text, and so on — is **not configured here in the enabler**. It's computed on the processor from the `BRAINTREE_BUTTON_STYLES` and `BRAINTREE_PER_METHOD_CONFIG` environment variables and delivered to the enabler through `GET /operations/config`. See `processor/.env.template` for the full reference, and the root [`README.md`](../README.md#button-customization) for example values and override precedence.

## Example: how a `processorUrl` becomes real requests

Previously required custom bff endpoints now are handled by the processor. The enabler builds every processor request URL from the single `processorUrl` you pass into `build(...)`, via `processorUrls()` (`src/components/constants.ts`):

```ts
processorUrls("https://your-processor.example.com");
// => {
//   createPaymentUrl:          "https://your-processor.example.com/payments",
//   expressClientTokenUrl:     "https://your-processor.example.com/payments/expressClientToken",
//   transactionSaleUrl:        "https://your-processor.example.com/payments/transactionSale",
//   getAchVaultTokenURL:       "https://your-processor.example.com/payments/getAchVaultToken",
//   updateCartShippingUrl:     "https://your-processor.example.com/payments/updateCartShipping",
//   getStoredPaymentMethodsURL: "https://your-processor.example.com/stored-payment-methods",
// }
```

## Pure vaulting

Vault-without-purchase ("Pure Vault") is currently disabled in code (`PURE_VAULT_DISABLED`), pending commercetools Checkout SDK support.
