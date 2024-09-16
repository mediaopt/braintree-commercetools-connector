<p align="center">
  <a href="https://commercetools.com/">
    <img alt="commercetools logo" src="https://unpkg.com/@commercetools-frontend/assets/logos/commercetools_primary-logo_horizontal_RGB.png">
  </a><br>
  <a href="https://www.braintreepayments.com/">
    <img alt="braintree logo" src="https://www.braintreepayments.com/images/braintree-logo-black.png">
  </a><br>
</p>

This is a [connect application](https://marketplace.commercetools.com/) to integrate Braintree into Commercetools. It follows the folder structure to ensure certification & deployment from commercetools connect team as stated [here](https://github.com/commercetools/connect-application-kit#readme).

[PayPal Braintree commercetools connector](https://marketplace.commercetools.com/integration/paypal-braintree) is available in the commercetools marketplace.

The payments demo and integration to the commercetools frontend can be seen at https://poc-mediaopt.frontend.site/ and [github](https://github.com/mediaopt/braintree-commercetools-cofe-integration).

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

## Instructions

- `cd braintree-extension`
- run `yarn` to install the dependencies
- insert commercetools credentials to `.env` file
- run `./bin/ngrok.sh` to start ngrok and insert the dynamic url in the `.env` file
- run `yarn connector:post-deploy` to register the extension with the public ngrok url
- run `ỳarn start:dev` to build the application

## Technology Stack

The connector is written in TypeScript and yarn is used as the package manager.

## Contributing

Feel free to contribute to the project by opening an issue.

## Additional information

In the docs folder you can find:

- description of each application included (README.md)
- architecture of the connector (Architecture.pdf)
- documented PayPal Braintree Commercetools API Postman collection (Braintree.md, Braintree.postman_collection.json)
