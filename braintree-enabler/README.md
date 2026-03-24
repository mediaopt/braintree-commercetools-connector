# Braintree client app

In here we explain how to use the client app and get payment methods to work.

## General properties

Each payment component takes a set of props that will be the same for everything. They are as follows:

- **createPaymentUrl**: `string`  
   _POST_-Request - we get a [_CreatePaymentResponse_](src/types/index.ts)  
   It is **your** responsibility to develop this API  
   The url that gets called to the endpoint of the connect app to create a payment in commerce tools. Communicates with CommerceTools backend  
   See the examples in our [CoFe integration example repository](https://github.com/mediaopt/braintree-commercetools-cofe-integration/tree/main/packages/poc/backend/payment-braintree)
- **getClientTokenUrl**: `string`  
   _POST_-Request - we get a [_ClientTokenResponse_](<(src/types/index.ts)>)  
   It is **your** responsibility to develop this API  
   The url that gets called to the endpoint of the connect app to get the client token. Communicates with CommerceTools backend
  See the examples in our [CoFe integration example repository](https://github.com/mediaopt/braintree-commercetools-cofe-integration/tree/main/packages/poc/backend/payment-braintree)
- **purchaseUrl**: `string`  
   _POST_-Request - we get a [_TransactionSaleRequest_](src/types/index.ts) that will be returned from the Braintree integration module  
   It is **your** responsibility to develop this API  
   The url that gets called to the endpoint of the connect app to make the purchase at. Communicates with CommerceTools backend
  See the examples in our [CoFe integration example repository](https://github.com/mediaopt/braintree-commercetools-cofe-integration/tree/main/packages/poc/backend/payment-braintree)
- **purchaseCallback**: `(result: any) => void`  
   Function to execute after a successful purchase.
- **fullWidth**: `boolean`  
   Makes the pay button use the full amount of width available (defaults to true).
- **buttonText**: `string`  
   The text to be shown on the pay button. Could be the final amount the customer has to pay.
- **shippingMethodId**: `string`  
  The id of the selected shipping. It will be sent back in the create purchase call to calculate the correct shipping costs.
- **cartInformation**: `object`  
  Information about the customers cart to crate payments with.
  Structure:
- **lineItems**: `object`  
   Line Items that will send as payload to createPaymentUrl. You can find the structure on [_LineItems_](src/types/index.ts).
- **shipping**: `object`  
   Shipping that will send as payload to createPaymentUrl. You can find the structure on [_Shipping_](src/types/index.ts).
- **useKount**: `boolean`  
   if you set useKount to true it will send the kount request to Braintree on the client side.
- **taxAmount**: `string`  
   `Tax amount` that will send as payload to createPaymentUrl.
- **shippingAmount**: `string`  
   `Shipping amount` that will send as payload to createPaymentUrl.
- **discountAmount**: `string`  
   `Discount amount` that will send as payload to createPaymentUrl.

```
account: {
  email: string;
};
billing: {
  firstName: string;
  lastName: string;
  streetName: string;
  streetNumber: string;
  city: string;
  country: string;
  postalCode: string;
};
shipping: {
  firstName: string;
  lastName: string;
  streetName: string;
  streetNumber: string;
  city: string;
  country: string;
  postalCode: string;
};
```

- **requestHeader**: `object`
  Information that you want to send to the server as a header.
  Structure for CoFe:

  ```
  "Frontastic-Session": string;
  "Commercetools-Frontend-Extension-Version": string;
  ```

## Payment specific properties

In addition, each payment component comes with its own specific properties.

### ApplePay

- **applePayDisplayName**: `string`  
   Name of your store.

### CreditCard

- **showPostalCode**: `boolean`  
  Show field for postal code in credit card mask.
- **showCardHoldersName**: `boolean`  
   Show field for name in credit card mask.
- **threeDSBillingAddress**: `object`  
   An optional [billingAddress](https://braintree.github.io/braintree-web/current/ThreeDSecure.html#~billingAddress) object for verification.
- **threeDSAdditionalInformation**: `object`  
   An optional [additionalInformation](https://braintree.github.io/braintree-web/current/ThreeDSecure.html#~additionalInformation) object for verification.
- **enableVaulting**: `boolean`  
   Displays a checkbox enabling the customer to store their card information in braintree.
- **continueOnLiabilityShiftPossible**: `boolean` - optional, default _false_  
  Card brands are recommending to ask the user to choose a different form of payment. However, it is still possible to continue. Refer to the [documentation](https://developer.paypal.com/braintree/docs/guides/3d-secure/client-side/javascript/v3/#advanced-client-side-options) for more information.
- **continueOnNoThreeDS**: `boolean` - optional, default _false_  
  This card was ineligible for 3D Secure, but you can still continue with this transaction. Refer to the [documentation](https://developer.paypal.com/braintree/docs/guides/3d-secure/client-side/javascript/v3/#advanced-client-side-options) for more information.

### GooglePay

- **environment**: `"PRODUCTION" | "TEST"`  
  Environment in which GooglePay operates in.
- **totalPriceStatus**: `"NOT_CURRENTLY_KNOWN" | "ESTIMATED" | "FINAL"`  
  Specifies the status of amount the shown amount. See [Googles reference](https://developers.google.com/pay/api/web/reference/request-objects#TransactionInfo) for more details.
- **googleMerchantId**: `string`  
  A Google merchant identifier issued after registration with the Google Pay and Wallet Console.
- **buttonTheme**: `google.payments.api.ButtonColor`  
  Sets the color theme of the button.
- **buttonType**: `google.payments.api.ButtonType`  
  Sets what kind of label the button will get.
- **phoneNumberRequired**: `booloean`  
  Customer has to provide their phone number in the GooglePay form.
- **billingAddressFormat**: `"FULL" | "MIN"`  
  Sets whether the customer is required to provide a full or minimal billing address.
- **billingAddressRequired**: `boolean`  
  Customer is required to provide a billing address in the GooglePay form.
- **acquirerCountryCode**: `string`  
  The ISO 3166-1 alpha-2 country code where the transaction is processed. Merchants must specify the acquirer bank country code.

### PayPal

- **flow**: `FlowType`  
  Set to _checkout_ for one-time payment flow, or _vault_ for Vault flow. If _vault_ is used with a client token generated with a customer ID, the PayPal account will be added to that customer as a saved payment method.
- **buttonColor**: `ButtonColorOption`  
  Sets the color theme of the PayPal button.
- **buttonLabel**: `ButtonLabelOption`  
  Sets what kind of label the PayPal button will get.
- **payLater**: `booloean`  
  Set to true to show an extra pay later button from PayPal.
- **payLaterButtonColor**: `ButtonColorOption`  
  Sets the color theme of the pay later button.
- **locale**: `string`  
  Sets the locale for PayPal buttons.
- **intent**: `Intent`  
  Sets the intent for PayPal buttons.
- **commit**: `boolean`  
  Sets the commit for PayPal buttons.
- **enableShippingAddress**: `boolean`  
  Sets the enableShippingAddress for PayPal buttons.
- **paypalLineItem**: `LineItem[]`  
  Sets the lineItens for PayPal buttons.
- **billingAgreementDescription**: `string`  
  Sets the billingAgreementDescription for PayPal buttons.
- **shippingAddressOverride**: `ShippingAddressOverride`  
  Sets the shippingAddressOverride for PayPal buttons.
- **shippingOptions**: `PayPalShippingOptions[]`  
  If you want to use `onShippingChange` feature of PayPal pass `shippingOptions` to the PayPal component. You can find the structure on [_PayPalShippingOptions_](src/types/index.ts).

You see information about all these options in the [PayPal official documents](https://braintree.github.io/braintree-web/3.34.0/PayPalCheckout.html#createPayment).

### Venmo

- **mobileWebFallBack**: `boolean`  
  Use this option when you want to use a web-login experience, such as if on mobile and the Venmo app isn't installed.
- **desktopFlow**: `"desktopWebLogin" | "desktopQRCode"`  
  Sets Venmos desktop usage.
  - _desktopWebLogin_ - the customer will authorize payment via a window popup that allows them to sign in to their Venmo account. This is used explicitly for customers operating from desktop browsers wanting to avoid the QR Code flow.
  - _desktopQRCode_ - render a scannable QR-code customers scan with their phone to approve via the mobile app.
- **paymentMethodUsage**: `"multi_use" | "single_use"`  
  The intended usage for the Venmo payment method nonce. Possible options are:
  - _single_use_ - intended as a one time transaction
  - _multi_use_ - intended to be vaulted and used for multiple transactions
- **allowNewBrowserTab**: `boolean`  
  This should be set to false if your payment flow requires returning to the same tab, e.g. single page applications. Doing so causes isBrowserSupported to return true only for mobile web browsers that support returning from the Venmo app to the same tab.
- **profile_id**: `string`  
  The Venmo profile ID to be used during payment authorization. Customers will see the business name and logo associated with this Venmo profile.
- **useTestNonce**: `boolean`  
  If set to true the component will use a test nonce and username to succeed the payment. Even if you cancel the login popup it will continue.
- **setVenmoUserName**: `(venmoName: string) => any`  
  Returns the Venmo username of the customer. Has to be shown in the checkout according to Venmo guidelines.
- **ignoreBowserSupport**: `boolean`  
  Venmo does check for browser support and won't load if it fails. You can ignore the check here. Useful for testing purposes, should not be used in production.

### Local Payments

Local payments group together multiple region specific payment methods. Each payment method is being exported as its own component wich restricts the possible options for _countryCode_, _currencyCode_ and _paymentType_ props. Please refer to the [braintree guidelines](https://developer.paypal.com/braintree/docs/guides/local-payment-methods/overview) for payment specific restrictions.  
They accept the following props:

- **saveLocalPaymentIdUrl**: `string`  
  It is **your** responsibility to develop this API  
  The url that gets called to the endpoint of the connect app to map the id of local payments to the transaction as recommended in Braintrees documentation. Communicates with CommerceTools backend
  See the examples in our [CoFe integration example repository](https://github.com/mediaopt/braintree-commercetools-cofe-integration/tree/main/packages/poc/backend/payment-braintree)
- **paymentType**: `any`  
  Determined by the specific payment method being used. Refer to [this table](https://developer.paypal.com/braintree/docs/guides/local-payment-methods/client-side-custom/javascript/v3/#render-local-payment-method-buttons).
- **countryCode**: `any`  
  Determined by the specific payment method being used. Refer to [this table](https://developer.paypal.com/braintree/docs/guides/local-payment-methods/client-side-custom/javascript/v3/#render-local-payment-method-buttons).
- **currencyCode**: `any`  
  Determined by the specific payment method being used. Refer to [this table](https://developer.paypal.com/braintree/docs/guides/local-payment-methods/client-side-custom/javascript/v3/#render-local-payment-method-buttons).
- **merchantAccountId**: `string` - optional  
  If not specified it will use the generated clientToken. Otherwise, it is possible to make the transaction to the merchant specified in here.
- **shippingAddressRequired**: `boolean` - optional, defaults to false  
  If you need a shipping address to ship physical goods, set shippingAddressRequired to true.
- **fallbackUrl**: `string`  
  Users with a mobile App will be redirected from their payment provider to this url where they can complete the payment
- **fallbackButtonText**: `string` - optional  
  The text to appear on the button

## Pure Vaulting

The Credit-Card and PayPal components can offer pure vaulting for registered customers, so they can go through checkouts faster in the future.  
In addition to the general payment properties mentioned earlier, both of them need:

- createPaymentForVault: `string`  
  _POST_-Request - we get a [_CreatePaymentResponse_](src/types/index.ts) with an amount of 0.  
  It is **your** responsibility to develop this API  
  The url that gets called to the endpoint of the connect app to create a payment in commerce tools. Communicates with CommerceTools backend  
  See the examples in our [CoFe integration example repository](https://github.com/mediaopt/braintree-commercetools-cofe-integration/tree/main/packages/poc/backend/payment-braintree)
- vaultPaymentMethodUrl: `string`  
  _POST_-Request - we get a success/fail that will be returned from the Braintree integration module  
  It is **your** responsibility to develop this API  
  The url that gets called to the endpoint of the connect app to vault the payment method for the current customer. Communicates with CommerceTools backend  
  See the examples in our [CoFe integration example repository](https://github.com/mediaopt/braintree-commercetools-cofe-integration/tree/main/packages/poc/backend/payment-braintree)
- isPureVault: `boolean`
  Must be true to enable pure vaulting.

## Braintree Commercetools Connector

In order to use this client package you need to run [braintree-commercetools-connector](https://github.com/mediaopt/braintree-commercetools-connector) connect app as well.

## Available Scripts

In the project directory, you can run:

### `npm start`

Runs the app in the development mode.\
Open [http://localhost:3000](http://localhost:3000) to view it in the browser.

The page will reload if you make edits.\
You will also see any lint errors in the console.

### `npm test`

Launches the test runner in the interactive watch mode.\
See the section about [running tests](https://facebook.github.io/create-react-app/docs/running-tests) for more information.

### `npm run build`

Builds the app for production to the `build` folder.\
It correctly bundles React in production mode and optimizes the build for the best performance.

The build is minified and the filenames include the hashes.\
Your app is ready to be deployed!

See the section about [deployment](https://facebook.github.io/create-react-app/docs/deployment) for more information.

### `npm run eject`

**Note: this is a one-way operation. Once you `eject`, you can’t go back!**

If you aren’t satisfied with the build tool and configuration choices, you can `eject` at any time. This command will remove the single build dependency from your project.

Instead, it will copy all the configuration files and the transitive dependencies (webpack, Babel, ESLint, etc) right into your project so you have full control over them. All of the commands except `eject` will still work, but they will point to the copied scripts so you can tweak them. At this point you’re on your own.

You don’t have to ever use `eject`. The curated feature set is suitable for small and middle deployments, and you shouldn’t feel obligated to use this feature. However we understand that this tool wouldn’t be useful if you couldn’t customize it when you are ready for it.
