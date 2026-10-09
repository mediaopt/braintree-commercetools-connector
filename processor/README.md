# Payment Integration Processor
This module provides an application based on [commercetools Connect](https://docs.commercetools.com/connect), which is triggered by HTTP requests from Checkout UI for payment operations.

The corresponding payment, cart or order details would be fetched from composable commerce platform, and then be sent to external PSPs for various payment operations such as create/capture/cancel/refund payment.

The module also provides template scripts for post-deployment and pre-undeployment action. After deployment or before undeployment via connect service completed, customized actions can be performed based on users' needs.

## Getting Started

These instructions will get you up and running on your local machine for development and testing purposes.
Please run following npm commands under `processor` folder.

#### Install PSP SDK
In case SDK is provided by payment service provider for communication purpose, you can import the SDK by following commands
```
$ npm install <psp-sdk>
```
#### Install dependencies
```
$ npm install
```
#### Build the application in local environment. NodeJS source codes are then generated under dist folder
```
$ npm run build
```
#### Run automation test
```
$ npm run test
```
#### Run the application in local environment. Remind that the application has been built before it runs
```
$ npm run start
```
#### Fix the code style
```
$ npm run lint:fix
```
#### Verify the code style
```
$ npm run lint
```
#### Run post-deploy script in local environment
```
$ npm run connector:post-deploy
```
#### Run pre-undeploy script in local environment
```
$ npm run connector:pre-undeploy
```

## Running application

Setup correct environment variables: check `processor/src/config/config.ts` for default values.

Make sure commercetools client credential have at least the following permissions:

* `manage_payments`
* `manage_checkout_payment_intents`
* `view_sessions`
* `introspect_oauth_tokens`

```
npm run dev
```

## Authentication

The processor uses the authentication mechanisms of the commercetools [connect-payment-integration-template](https://github.com/commercetools/connect-payment-integration-template): `oauth2`, `session` and `jwt`. See the template's [processor README](https://github.com/commercetools/connect-payment-integration-template/blob/main/processor/README.md#authentication) for how to obtain each of them for local development. This repository follows the template as closely as possible. It differs in the JWT mock that `docker compose up` starts: its own `docker-dev/jwt-mock` replaces the template's `jwt-mock-server` package and runs on port `9002` (the template uses `9000`), as some IDEs reserve 9000 for their internal operations.
