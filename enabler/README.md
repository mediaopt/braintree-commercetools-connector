# Braintree Client App

This is the frontend application for integrating Braintree payment methods into your checkout flow. It provides reusable payment components for various payment methods supported by Braintree.

For a complete integration the communication with Commercetools sessions API and processor module is required. See the index.js file for an example of how to integrate the payment components into your checkout page.

The cart data will be processed at the checkout module automatically.

## General Properties

Each payment component accepts a set of common properties that are shared across all components:

PROCESSOR_URL
sessionId
merchantAccountId

- **paymentMethodType**: `string` required
  - The type of the payment method that will be actually rendered. Available options:
    - `ACH` - ACH bank transfers
    - `ApplePay` - Apple Pay wallet
    - `CreditCard` - Credit or debit card (default)
    - `GooglePay` - Google Pay wallet
    - `PayPal` - PayPal, PayPal Pay Later, and PayPal Buy Now (express) buttons
    - `Venmo` - Venmo peer-to-peer payments
    - Local payment methods: in progress

- **builderType**: `string`
  - The type of the builder that will be used for render. By default component mode is used, express is supported for PayPal Buy Now button.

- **purchaseCallback**: `(result: any) => void`
  - Callback function executed after a successful purchase. If not provided the fallback redirect to MERCHANT_RETURN_URL set at the processor will be executed

- **useKount**: `boolean`
  - When set to `true`, sends a Kount request to Braintree on the client side

### Style Props

- **fullWidth**: `boolean`
  - Makes the pay button use the full available width (defaults to `true`)

- **buttonText**: `string`
  - Text displayed on the pay button (typically the payment amount)

### Cart Information

```typescript
account: {
  email: string;
}
billing: {
  firstName: string;
  lastName: string;
  streetName: string;
  streetNumber: string;
  city: string;
  country: string;
  postalCode: string;
}
shipping: {
  firstName: string;
  lastName: string;
  streetName: string;
  streetNumber: string;
  city: string;
  country: string;
  postalCode: string;
}
```

- **lineItems**: `object`
  - Line items to send as payload to `createPaymentUrl`
  - See the structure in [_LineItems_](src/types/index.ts)

- **shipping**: `object`
  - Shipping information to send as payload to `createPaymentUrl`
  - See the structure in [_Shipping_](src/types/index.ts)

- **taxAmount**: `string`
  - Tax amount to send as payload to `createPaymentUrl`

- **shippingAmount**: `string`
  - Shipping amount to send as payload to `createPaymentUrl`

- **discountAmount**: `string`
  - Discount amount to send as payload to `createPaymentUrl`

- **requestHeader**: `object`
  - Additional headers to send with requests to your server
  - Example structure for Commercetools Frontend:

```typescript
{
  "Frontastic-Session": string;
  "Commercetools-Frontend-Extension-Version": string;
}
```

## Payment-Specific Properties

In addition to the general properties, each payment component accepts additional configuration options specific to that payment method.

### ApplePay

- **applePayDisplayName**: `string`
  - Your store name displayed in the ApplePay interface

### CreditCard

- **showPostalCode**: `boolean`
  - Show postal code field in the credit card form

- **showCardHoldersName**: `boolean`
  - Show cardholder name field in the credit card form

- **threeDSBillingAddress**: `object`
  - Optional [billing address](https://braintree.github.io/braintree-web/current/ThreeDSecure.html#~billingAddress) for 3D Secure verification

- **threeDSAdditionalInformation**: `object`
  - Optional [additional information](https://braintree.github.io/braintree-web/current/ThreeDSecure.html#~additionalInformation) for 3D Secure verification

- **enableVaulting**: `boolean`
  - Display checkbox allowing customers to save their card information

- **continueOnLiabilityShiftPossible**: `boolean` (optional, defaults to `false`)
  - Allow transaction to continue if liability shift is possible but not guaranteed
  - See [Braintree documentation](https://developer.paypal.com/braintree/docs/guides/3d-secure/client-side/javascript/v3/#advanced-client-side-options) for details

- **continueOnNoThreeDS**: `boolean` (optional, defaults to `false`)
  - Allow transaction to continue if card is ineligible for 3D Secure
  - See [Braintree documentation](https://developer.paypal.com/braintree/docs/guides/3d-secure/client-side/javascript/v3/#advanced-client-side-options) for details

### GooglePay

- **environment**: `"PRODUCTION" | "TEST"`
  - GooglePay operating environment

- **totalPriceStatus**: `"NOT_CURRENTLY_KNOWN" | "ESTIMATED" | "FINAL"`
  - Status of the shown amount
  - See [Google's reference](https://developers.google.com/pay/api/web/reference/request-objects#TransactionInfo) for details

- **googleMerchantId**: `string`
  - Google merchant identifier from Google Pay and Wallet Console registration

- **buttonTheme**: `google.payments.api.ButtonColor`
  - Color theme for the GooglePay button

- **buttonType**: `google.payments.api.ButtonType`
  - Button label type

- **phoneNumberRequired**: `boolean`
  - Customer must provide phone number in GooglePay form

- **billingAddressFormat**: `"FULL" | "MIN"`
  - Whether customer provides full or minimal billing address

- **billingAddressRequired**: `boolean`
  - Customer is required to provide billing address in GooglePay form

- **acquirerCountryCode**: `string`
  - ISO 3166-1 alpha-2 country code where transaction is processed
  - Merchants must specify the acquirer bank country code

### PayPal

- **flow**: `FlowType`
  - Set to `checkout` for one-time payments or `vault` to save for future use
  - With `vault` flow and a customer ID, the PayPal account is saved as a payment method

- **buttonColor**: `ButtonColorOption`
  - Color theme for the PayPal button

- **buttonLabel**: `ButtonLabelOption`
  - Button label type

- **payLater**: `boolean`
  - Show PayPal pay later button option

- **payLaterButtonColor**: `ButtonColorOption`
  - Color theme for the pay later button

- **locale**: `string`
  - Locale for PayPal buttons

- **intent**: `Intent`
  - Payment intent for PayPal buttons

- **commit**: `boolean`
  - Commit setting for PayPal buttons

- **enableShippingAddress**: `boolean`
  - Allow shipping address selection in PayPal interface

- **paypalLineItem**: `LineItem[]`
  - Line items for PayPal buttons

- **billingAgreementDescription**: `string`
  - Billing agreement description for PayPal buttons

- **shippingAddressOverride**: `ShippingAddressOverride`
  - Override shipping address in PayPal interface

- **shippingOptions**: `PayPalShippingOptions[]`
  - Shipping options for PayPal's `onShippingChange` feature
  - See structure in [_PayPalShippingOptions_](src/types/index.ts)

For comprehensive information about all PayPal options, see the [PayPal official documentation](https://braintree.github.io/braintree-web/3.34.0/PayPalCheckout.html#createPayment).

### Venmo

- **mobileWebFallBack**: `boolean`
  - Enable web-login experience for mobile devices without Venmo app

- **desktopFlow**: `"desktopWebLogin" | "desktopQRCode"`
  - Venmo desktop flow type:
    - `desktopWebLogin` - popup window for signing into Venmo account
    - `desktopQRCode` - scannable QR code for mobile app approval

- **paymentMethodUsage**: `"multi_use" | "single_use"`
  - Intended usage for the Venmo payment method nonce:
    - `single_use` - one-time transaction
    - `multi_use` - vault and reuse for multiple transactions

- **allowNewBrowserTab**: `boolean`
  - Set to `false` for single-page applications requiring same-tab return
  - Affects `isBrowserSupported` behavior for mobile web browsers

- **profile_id**: `string`
  - Venmo profile ID for payment authorization
  - Customers see business name and logo associated with this profile

- **useTestNonce**: `boolean`
  - Use test nonce and username for payment success (even if popup is cancelled)
  - For testing purposes only

- **setVenmoUserName**: `(venmoName: string) => any`
  - Callback returning Venmo username of the customer
  - Must be displayed according to Venmo guidelines

- **ignoreBowserSupport**: `boolean`
  - Ignore browser support checks (Venmo skips unsupported browsers by default)
  - For testing purposes only, do not use in production

### Local Payments

Local payments group multiple region-specific payment methods. Each method is exported as its own component with restricted options for `countryCode`, `currencyCode`, and `paymentType`.

See [Braintree guidelines](https://developer.paypal.com/braintree/docs/guides/local-payment-methods/overview) for payment-specific restrictions.

Accepted properties:

- **saveLocalPaymentIdUrl**: `string`
  - Your responsibility to implement this API endpoint
  - Called to map local payment transactions
  - See examples in the [CoFe integration repository](https://github.com/mediaopt/braintree-commercetools-cofe-integration/tree/main/packages/poc/backend/payment-braintree)

- **paymentType**: `any`
  - Determined by specific payment method
  - See [Braintree payment method table](https://developer.paypal.com/braintree/docs/guides/local-payment-methods/client-side-custom/javascript/v3/#render-local-payment-method-buttons)

- **countryCode**: `any`
  - Determined by specific payment method
  - See [Braintree payment method table](https://developer.paypal.com/braintree/docs/guides/local-payment-methods/client-side-custom/javascript/v3/#render-local-payment-method-buttons)

- **currencyCode**: `any`
  - Determined by specific payment method
  - See [Braintree payment method table](https://developer.paypal.com/braintree/docs/guides/local-payment-methods/client-side-custom/javascript/v3/#render-local-payment-method-buttons)

- **merchantAccountId**: `string` (optional)
  - If not specified, uses the client token's merchant account
  - Otherwise, transaction processes under specified merchant account

- **shippingAddressRequired**: `boolean` (optional, defaults to `false`)
  - Require shipping address for physical goods

- **fallbackUrl**: `string`
  - URL for redirecting users from payment provider back to checkout

- **fallbackButtonText**: `string` (optional)
  - Text displayed on the fallback button

## Pure Vaulting

Credit Card and PayPal components support pure vaulting for registered customers to enable faster future checkouts.

In addition to general properties, both components require:

- **createPaymentForVault**: `string`
  - _POST_ request that returns [_CreatePaymentResponse_](src/types/index.ts) with amount of 0
  - Your responsibility to implement this API endpoint
  - Called to create a payment for vaulting
  - See examples in the [CoFe integration repository](https://github.com/mediaopt/braintree-commercetools-cofe-integration/tree/main/packages/poc/backend/payment-braintree)

- **vaultPaymentMethodUrl**: `string`
  - _POST_ request returning success/failure response
  - Your responsibility to implement this API endpoint
  - Called to vault the payment method for current customer
  - See examples in the [CoFe integration repository](https://github.com/mediaopt/braintree-commercetools-cofe-integration/tree/main/packages/poc/backend/payment-braintree)

- **isPureVault**: `boolean`
  - Must be `true` to enable pure vaulting

## Braintree Commercetools Connector

This client package requires the [braintree-commercetools-connector](https://github.com/mediaopt/braintree-commercetools-connector) connect app to be running.

## Available Scripts

In the project directory, you can run:

### `npm start`

Runs the app in development mode.\
Open [http://localhost:3000](http://localhost:3000) to view it in the browser.

The page will reload if you make edits.\
Lint errors will be displayed in the console.

### `npm test`

Launches the test runner in interactive watch mode.\
See the section about [running tests](https://facebook.github.io/create-react-app/docs/running-tests) for more information.

### `npm run build`

Builds the app for production to the `build` folder.\
React is correctly bundled in production mode and the build is optimized for best performance.

The build is minified and filenames include hashes.\
Your app is ready to be deployed!

See the section about [deployment](https://facebook.github.io/create-react-app/docs/deployment) for more information.

### `npm run eject`

**Note: this is a one-way operation. Once you `eject`, you can't go back!**

If you are unsatisfied with the build tool and configuration choices, you can `eject` at any time. This removes the single build dependency from your project.

Instead, it copies all configuration files and transitive dependencies (webpack, Babel, ESLint, etc) into your project for full control. All commands except `eject` will still work, but will point to the copied scripts for you to modify. At this point, you are on your own.

You do not need to ever use `eject`. The curated feature set is suitable for small and middle deployments and you are not obligated to use this feature. However, we understand this tool would not be useful if you could not customize it when ready.
