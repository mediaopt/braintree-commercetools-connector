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

The payments demo and integration to the commercetools frontend can be seen at https://mediaopt.github.io/braintree-demo and [github](https://github.com/mediaopt/braintree-demo).

## For Existing Users

**ALL EXISTING FUNCTIONALITY OF EXTENSION, NOTIFICATIONS AND EVENTS MODULES IS PRESERVED UPON UPGRADE TO COMMERCETOOLS CHECKOUT COMPATIBLE EDITION.**

### Using the connector without the checkout mode

- The configuration values that are same for different modules are now submitted once as [inheritAs.configuration](https://docs.commercetools.com/connect/development#configure-connectyaml).
- During installation the warning "Missing env variables for processor and enabler, skipping deployment of these modules" will be shown, but you can safely ignore it.
- If you deploy the connector yourself (both via commercetools connect API and using other services)
  - you **can**:
    - remove the processor and enabler parts from connect.yaml to speed up the installation.
    - if processor and enabler are removed you can also remove the processor and enabler modules from your repository. common-connect is now required for the extension module.
  - if you don't use npm (i.e. use **yarn**) as package manager - you **must** replace the imports for common-connect module in the braintree-extension and processor (if it is not removed already) with the package manager standard, (i.e. for yarn: "common-connect": "link:../common-connect").

### Using the [braintree npm client](https://www.npmjs.com/package/braintree-commercetools-client)

The client is discontinued due to low interest. The core functionality is transferred to the checkout compatible connector edition enabler and processor modules. Due to checkout SDK limitations at the moment the following functionality is excluded:

- Vaulting PayPal and ACH payment methods
- Vault without purchase (Pure Vault)

If you are interested in some of these methods please open the issue.

#### Migrating to the checkout compatible connector

The processor module now provides the synchronization that was previously the merchant responsibility and had to be built on the bff side, therefore previous link-based properties related to interactions with the Braintree API are now replaced with one link to the installed processor application. All customization of the payment buttons is now done at the processor side as well. Please see the section Checkout mode and [github](https://github.com/mediaopt/braintree-demo) for implementation details.

## Checkout Mode

The connector includes a checkout mode for faster, streamlined payment processing:

- **PayPal SDK Frontend**: The enabler module provides a frontend based on the PayPal SDK for quick checkout integration.
- **Performance Optimized**: The processor module uses the Commercetools Checkout API for faster cart and payment API interactions.
- **Limited API Scope**: Some operations available in connector mode (extension module) are not implemented in checkout mode because they are handled directly or not supported by Braintree frontend components.

**Note**: The main purpose of processor and enabler modules is to provide full compatibility with commercetools checkout. Previously existing fine-grained API control and customization is still available via extension module. To provide the full compatibility with the checkout SDK the PayPal express button now has a build in property for recreating a cart on first click.

### Installation and configuration

To use the checkout compatible connector please create a checkout application in the [merchant center](https://docs.commercetools.com/checkout/overview#merchant-center-configuration). In the application payment integrations you can select this connector and configure payment methods available. Please note that the connector only supports standard payments and express payments. It is your responsibility to configure the relevant restriction for your payment methods. This includes, but doesn't limit to, local payment methods (Example: for Przelewy24 country PL is required, set it as billingAddress.country = "PL".

#### Standard payment methods with restrictions

Express methods only include PayPal Buy Now.

## Prerequisites

To use the connector you need to have the following:

- commercetools Composable Commerce account and [API client](https://docs.commercetools.com/api/projects/api-clients#apiclient) credentials, namely:
  - region (CTP_REGION) - region, in which your commercetools project is hosted
  - project key (CTP_PROJECT_KEY) - the key of your commercetools project
  - client ID (CTP_CLIENT_ID) - the ID of your commercetools API client
  - client secret (CTP_CLIENT_SECRET) - the secret of your commercetools API client
  - scope (CTP_SCOPE) - the scope of your commercetools API client
- [Braintree merchant account](https://developer.paypal.com/braintree/articles/get-started/overview) and [Braintee gateway credentials](https://developer.paypal.com/braintree/articles/control-panel/important-gateway-credentials), namely:
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
