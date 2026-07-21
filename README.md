<p align="center">
  <a href="https://commercetools.com/">
    <img alt="commercetools logo" src="https://unpkg.com/@commercetools-frontend/assets/logos/commercetools_primary-logo_horizontal_RGB.png">
  </a><br>
  <a href="https://www.braintreepayments.com/">
    <img alt="braintree logo" src="https://www.braintreepayments.com/images/braintree-logo-black.png">
  </a><br>
</p>

This is a checkout compatible [connect application](https://marketplace.commercetools.com/) to integrate Braintree into Commercetools.

[PayPal Braintree commercetools connector](https://marketplace.commercetools.com/integration/paypal-braintree) is available in the commercetools marketplace.

The payments demo can be seen at https://mediaopt.github.io/braintree-demo and [GitHub](https://github.com/mediaopt/braintree-demo).

## For Existing Users

**ALL EXISTING FUNCTIONALITY OF EXTENSION, NOTIFICATIONS AND EVENTS MODULES IS PRESERVED UPON UPGRADE TO COMMERCETOOLS CHECKOUT COMPATIBLE EDITION.**

### Using the connector without the checkout mode

- The configuration values that are same for different modules are now submitted once as [inheritAs.configuration](https://docs.commercetools.com/connect/development#configure-connectyaml).
- During installation the warning "Missing env variables for processor and enabler, skipping deployment of these modules" will be shown, but you can safely ignore it.
- If you deploy the connector yourself (both via commercetools connect API and using other services)
  - you **can**:
    - remove the processor and enabler parts from connect.yaml to speed up the installation.
    - if processor and enabler are removed you can also remove the processor and enabler modules from your repository. common-connect should remain as is now required for the extension module.
  - if you don't use npm (i.e. use **yarn**) as package manager - you **must** replace the imports for common-connect module in the braintree-extension and processor (if it is not removed already) with the package manager standard, (i.e. for yarn: "common-connect": "link:../common-connect").

### Using the [Braintree npm client](https://www.npmjs.com/package/braintree-commercetools-client)

The client is discontinued due to low interest. The core functionality is transferred to the checkout compatible connector edition enabler and processor modules. The following functionality is not included in this build:

- Storing a new PayPal account or ACH bank account, and reusing a previously saved one — please open an issue if you need this.
- Vault without purchase (Pure Vault) — please open an issue if you need this.

#### Migrating to the checkout compatible connector

The processor module now provides the synchronization that was previously the merchant responsibility and had to be built on the bff side, therefore previous link-based properties related to interactions with the Braintree API are now replaced with one link to the installed processor application. All customization of the payment buttons is now done at the processor side as well. Please see the section Checkout mode and [github](https://github.com/mediaopt/braintree-demo) for implementation details.

## Checkout Mode

The connector includes a checkout mode for faster, streamlined payment processing:

- **PayPal SDK Frontend**: The enabler module provides a frontend based on the PayPal SDK for quick checkout integration.
- **Performance Optimized**: The processor module uses the Commercetools Checkout API for faster cart and payment API interactions.
- **Limited Scope**: The processor is designed to be used together with the `enabler` to drive the [checkout flow](https://docs.commercetools.com/learning-implement-checkout/implement-commercetools-checkout/intro-to-commercetools-checkout); the only part of the processor API meant to be triggered manually, not through the enabler, is the [Payment Intents API](https://docs.commercetools.com/checkout/payment-intents-api) (`POST /operations/payment-intents/:id`) — see the "Checkout" → "Payment Intents" folder of the [Postman collection](docs/Braintree.postman_collection.json) for request examples.

**Note**: The main purpose of processor and enabler modules is to provide full compatibility with commercetools checkout. Previously existing fine-grained API control and customization is still available via extension module.

To be fully compatible with the checkout SDK, the PayPal Express button supports deferred cart creation: when no cart exists yet (e.g. a product page or mini-cart button), it creates the commercetools cart on first click, immediately before the payment sheet opens.

### Checkout mode installation and configuration

To use the checkout compatible connector please create a checkout application in the [merchant center](https://docs.commercetools.com/checkout/overview#merchant-center-configuration). In the application payment integrations you can select this connector and configure payment methods available. Please note that the connector only supports standard payments and express payments. It is your responsibility to configure the relevant restriction for your payment methods. This includes, but doesn't limit to, local payment methods (Example: for Przelewy24 country PL is required, set it as billingAddress.country = "PL".

#### Payment methods and their restrictions

| Category | Method              | previous name (npm client)         | checkout reference | Country requirement                                           | Currency requirement           | Recommended predicates                                                                          |
| -------- | ------------------- | ---------------------------------- | ------------------ | ------------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------ |
| Standard | Credit Card         | `CreditCard`                       | `card`             | None enforced by the connector                                | None enforced by the connector | None needed                                                                                       |
| Standard | PayPal              | `PayPal`                           | `paypal`           | None enforced by the connector                                | None enforced by the connector | None needed                                                                                       |
| Standard | Google Pay          | `GooglePay`                        | `googlepay`        | None enforced by the connector                                | None enforced by the connector | None needed                                                                                       |
| Standard | Apple Pay           | `ApplePay`                         | `applepay`         | None enforced by the connector                                | None enforced by the connector | None needed                                                                                       |
| Standard | Venmo               | `Venmo`                            | *Venmo*¹           | None enforced by the connector                                | None enforced by the connector | None needed                                                                                       |
| Standard | ACH                 | `ACH`                              | *ACH*¹             | US bank account by design; no country code is checked in code | None enforced by the connector | `customerId != null and billingAddress.country = "US"` (ACH requires a logged-in, vaultable customer) |
| Stored   | Credit Card (saved) | `CreditCardStored`                 | `card`             | None enforced by the connector                                | None enforced by the connector | None needed                                                                                       |
| Express  | PayPal Buy Now      | `PayPal` (via the express builder) | `paypal`           | None enforced by the connector                                | None enforced by the connector | None needed                                                                                       |
| Local    | Bancontact          | `bancontact`                       | `bancontactcard`   | BE                                                            | EUR                            | `billingAddress.country = "BE" and totalPrice.currencyCode = "EUR"`                                |
| Local    | Blik                | `blik`                             | `blik`             | PL                                                            | PLN                            | `billingAddress.country = "PL" and totalPrice.currencyCode = "PLN"`                                |
| Local    | EPS                 | `eps`                              | `eps`              | AT                                                            | EUR                            | `billingAddress.country = "AT" and totalPrice.currencyCode = "EUR"`                                |
| Local    | iDEAL               | `ideal`                            | `ideal`            | NL                                                            | EUR                            | `billingAddress.country = "NL" and totalPrice.currencyCode = "EUR"`                                |
| Local    | MyBank              | `mybank`                           | *mybank*¹          | IT                                                            | EUR                            | `billingAddress.country = "IT" and totalPrice.currencyCode = "EUR"`                                |
| Local    | Przelewy24          | `p24`                              | `przelewy24`       | PL                                                            | EUR or PLN                     | `billingAddress.country = "PL" and (totalPrice.currencyCode = "EUR" or totalPrice.currencyCode = "PLN")` |

¹ Venmo, ACH, and MyBank don't have a commercetools Checkout key yet, so no UI defaults are provided at the moment in merchant center. These methods are supposed to be included in future commercetools releases and when the proper key will be available the merchant center reference will be set to match.

This is your responsibility to configure in the merchant center → checkout application → payment integration the relevant payment methods based on your Braintree account settings, using [payment integration predicates](https://docs.commercetools.com/checkout/payment-integration-predicates#predicate-syntax) — the connector doesn't enforce any of these server-side. The "Recommended predicates" column above shows a starting point for each method: for local payment methods, it's the country/currency pairing the method is fixed to; for ACH, it restricts the method to logged-in customers, since ACH requires vaulting to a Braintree customer and a guest checkout can't complete it even though this connector doesn't block guests from seeing the option.

Express methods only include PayPal Buy Now today.

##### Local payment methods not offered

A few Braintree local payment method types exist in the underlying SDK but are intentionally excluded from this connector:

- **Sofort**, **Giropay** — obsolete: Braintree no longer supports them.
- **Trustly** — was not a part of previous integration — please open an issue if you are interested in this payment method.
- **GrabPay** — not currently requested or confirmed as needed — please open an issue if you are interested in this payment method.

#### Stored payment methods

Set `STORED_PAYMENT_METHODS_ENABLED=true` on the processor to let customers save and reuse a payment
method (`GET /stored-payment-methods`, `DELETE /stored-payment-methods/:id`). Only **credit cards**
(`CreditCardStored`) are offered — this is a hard limit of the commercetools Checkout SDK, whose own
UI only supports displaying and reusing stored credit cards.

Braintree remains the authoritative source for everything it has vaulted, including PayPal accounts
and ACH bank accounts saved through other means (e.g. the extension/connector mode) — but this
checkout-compatible build does not surface those as stored payment methods, since commercetools
Checkout has no UI to display them. Please open an issue if you are interested in this.

#### Button customization

Per-method button styling and functional identifiers (colors, labels, `googleMerchantId`, `venmo.profileId`, vault-checkbox label text, etc.) are configured on the processor via two environment variables and served to the enabler through `GET /operations/config` — see `processor/.env.template` for the full reference. Example values:

```
BRAINTREE_BUTTON_STYLES={"paypal":{"buttonColor":"gold","buttonLabel":"pay","shape":"pill","size":"responsive"},"paypalExpress":{"buttonColor":"gold","buttonLabel":"buynow","shape":"pill","size":"responsive"},"ach":{"mandateText":"set your own ACH mandate text"},"applePay":{"applePayDisplayName":"set your own store name"},"googlePay":{"buttonTheme":"black","buttonType":"buy"},"venmo":{"desktopFlow":"desktopWebLogin"},"creditCard":{"showPostalCode":false}}

BRAINTREE_PER_METHOD_CONFIG={"googlePay":{"googleMerchantId":"[your-google-merchant-id]","acquirerCountryCode":"[merchant-country-code]"},"venmo":{"profileId":"[optional-venmo-profile-id]"},"creditCard":{"vaultLabel":"Save my card"},"paypal":{"vaultLabel":"Save my PayPal account"}}
```

## Prerequisites

To use the connector you need to have the following:

- commercetools Composable Commerce account and [API client](https://docs.commercetools.com/api/projects/api-clients#apiclient) credentials, namely:
  - region (CTP_REGION) - region, in which your commercetools project is hosted
  - project key (CTP_PROJECT_KEY) - the key of your commercetools project
  - client ID (CTP_CLIENT_ID) - the ID of your commercetools API client
  - client secret (CTP_CLIENT_SECRET) - the secret of your commercetools API client
  - scope (CTP_SCOPE) - the scope of your commercetools API client
- [Braintree merchant account](https://developer.paypal.com/braintree/articles/get-started/overview) and [Braintree gateway credentials](https://developer.paypal.com/braintree/articles/control-panel/important-gateway-credentials), namely:
  - merchant ID (BRAINTREE_MERCHANT_ID)
  - public key (BRAINTREE_PUBLIC_KEY)
  - private key (BRAINTREE_PRIVATE_KEY)
  - environment (BRAINTREE_ENVIRONMENT) - the environment of your Braintree API client (production or sandbox)

Please keep in mind, that the parameter [merchant account id](https://developer.paypal.com/braintree/articles/control-panel/important-gateway-credentials#merchant-account-id-versus-merchant-id) (BRAINTREE_MERCHANT_ACCOUNT) differs from merchant ID and is optional.

Please set the following parameters according to your project requirements:

- BRAINTREE_SEND_TRACKING
- BRAINTREE_PAYPAL_DESCRIPTION
- BRAINTREE_VALIDATE_CARD
- BRAINTREE_AUTOCAPTURE

### Braintree webhooks

The `braintree-notifications` module listens for [Braintree webhooks](https://developer.paypal.com/braintree/docs/guides/webhooks/overview); the connector currently supports listening for local payment methods and ACH Direct Debit notifications.

The URL required to enable these webhooks on the Braintree side is only available once the connector is installed: in the merchant center, go to the connector installation page → **Apps** → `braintree-notifications` to find it.

### Checkout options

- CTP_CHECKOUT_URL - the URL of the commercetools checkout (required)
- CTP_JWKS_URL - the URL of the JWKs endpoint for JWT verification (required)
- CTP_JWT_ISSUER - the expected issuer of the JWTs (required)
- VITE_ENABLER_URL and VITE_PROCESSOR_URL - will be available after connector deployment on commercetools

- MERCHANT_RETURN_URL - the URL to which the user will be redirected after the payment is processed.

The connector mode requires braintree-extension, braintree-notification and braintree-events to be installed.
The checkout mode requires all modules to be installed.

# Local development

## Connector mode

- `cd common-connect`
- run `npm install` to install the dependencies
- run `npm run build` to build the package
- `cd ../braintree-extension`
- run `npm install` to install the dependencies
- insert commercetools credentials to `.env` file
- run `./bin/ngrok.sh` to start ngrok and insert the dynamic url in the `.env` file
- run `npm run connector:post-deploy` to register the extension with the public ngrok url
- run `npm run start:dev` to build the application

## Checkout mode

Ensure that the env variables for processor and enabler are set to
CTP_JWKS_URL=http://localhost:9002/jwt/.well-known/jwks.json
and
VITE_PROCESSOR_URL=http://localhost:8080
correspondingly.

- `cd common-connect`
- run `npm install` to install the dependencies
- run `build` to install the dependencies
- `cd ..`
- run `docker compose up` to start the local JWT mock server, enabler and processor.

## Technology Stack

The connector is written in TypeScript and npm is used as the package manager.

## Contributing

Feel free to contribute to the project by opening an issue.

## Additional information

In the docs folder you can find:

- description of each application included (README.md)
- architecture of the connector (Architecture.pdf)
- documented PayPal Braintree Commercetools API Postman collection (Braintree.md, Braintree.postman_collection.json)
