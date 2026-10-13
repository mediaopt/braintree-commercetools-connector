# Braintree Enabler

The enabler is the frontend component library for the commercetools Checkout-compatible Braintree connector. It renders payment buttons and talks to the browser-side Braintree/PayPal SDKs; together with the `processor` module, which handles server-side logic (creating commercetools payments, calling Braintree, syncing state back to commercetools), it forms the checkout mode integration.

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

## ACH

You must contact Braintree to enable the required verification method for the checkout flow.

| Value                                     | Status                             |
| ----------------------------------------- | ---------------------------------- |
| `instant_verification_account_validation` | Supported                          |
| `micro_transfers`                         | Open issue if you need this method |
| `network_check` (the default if unset)    | Supported                          |

Then the relevant value must be submitted to the processor configuration as
`ach.usBankAccountVerificationMethod` under `BRAINTREE_PER_METHOD_CONFIG` (see the root
[`README.md`](../README.md#button-customization) for example values).

The ACH mandate text shown to the shopper and sent to Braintree is built automatically using
`ach.businessName` and `ach.actionLabel` from `BRAINTREE_PER_METHOD_CONFIG` — providing `businessName`
and keeping `actionLabel` in sync with your checkout button's label (if customized in the merchant
center) is your responsibility.

To fully replace the mandate text instead, set `ach.mandateText` under `BRAINTREE_BUTTON_STYLES` —
when present, it's used verbatim. In that case, following
[Braintree's ACH mandate text requirements](https://developer.paypal.com/braintree/docs/guides/ach/client-side/javascript/v3/)
is your responsibility.

## Credit Card

3D Secure verification is enabled by default. It can be disabled or reconfigured via your Braintree
account's [Rules Manager](https://developer.paypal.com/braintree/docs/guides/3d-secure/rules-manager/javascript/v3/).

3D Secure loads Cardinal's Songbird script and frames into your storefront page. If that page sends a
Content Security Policy, it must allow the hosts Braintree lists for your environment in its
[Content Security Policy guide](https://braintree.github.io/braintree-web/current/#content-security-policy).
Otherwise the 3D Secure challenge can't be shown. The connector can't set this policy for you,
because a CSP applies to the page that loads the scripts, not to the connector's own responses.
Payments that need no challenge aren't affected by anything below.

- **Challenge not shown in time.** When Braintree requests a challenge and it isn't shown within
  10 seconds, the payment is rejected: `onError` receives `THREEDS_SONGBIRD_NOT_LOADED` (Cardinal's
  script didn't load) or `THREEDS_CHALLENGE_NOT_SHOWN`, and the browser console logs the same message.
- **Challenge that arrives late.** If Cardinal's script was only slow, a challenge that becomes
  available after that is never shown: the browser console logs a warning if it arrives within
  10 seconds after 3D Secure has finished loading; a later one is visible only in the browser's
  network tab.
- **Retry while 3D Secure is still loading.** Until that late challenge arrives, or for those
  10 seconds if it doesn't, a new payment attempt is rejected before the card is tokenized: `onError`
  receives `THREEDS_STILL_LOADING` and the shopper is asked to try again in a moment.

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
