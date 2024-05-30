# Commercetools

# Braintree Commercetools API Postman collection

This Postman collection contains examples of requests and responses for most endpoints and commands of the Braintree extension for Commercetools. For every command the smallest possible payload is given. Please find optional fields in the related official documentation.

## Disclaimer

This is not the official Braintree documentation. Please see [here](http://docs.commercetools.com/) for a complete and approved documentation of the Braintree.

## How to use

**:warning: Be aware that postman automatically synchronizes environment variables (including your API client credentials) to your workspace if logged in.** **Use this collection only for development purposes and non-production projects.**

To use this collection in Postman please perform the following steps:

1. Download and install the Postman Client
2. Import the collection.json and [template.json](https://github.com/commercetools/commercetools-postman-collection/blob/master/api/template.json) in your postman application
3. In the Merchant Center, create a new API Client and fill in the client credentials in your environment
4. Obtain an access token by sending the "Authorization/Obtain access token" request at the bottom of the request list. Now you can use all other endpoints

Feel free to clone and modify this collection to your needs.

To automate frequent tasks the collection automatically manages commonly required values and parameters such as resource ids, keys and versions in Postman environment variables for you.

Please see [http://docs.commercetools.com/](http://docs.commercetools.com/) for further information about the commercetools Platform.

## Endpoints

- [Authorization](#authorization)
  1. [Obtain access token](#1-obtain-access-token)
  2. [Obtain access token through password flow](#2-obtain-access-token-through-password-flow)
  3. [Token for Anonymous Sessions](#3-token-for-anonymous-sessions)
  4. [Token Introspection](#4-token-introspection)
- [Braintree](#braintree)
  1. [SetCustomerId](#1-setcustomerid)
  2. [findCustomer](#2-findcustomer)
  3. [vaultCustomer](#3-vaultcustomer)
     - [Processor declined](#i-example-request-processor-declined)
     - [Valid Visa Nonce](#ii-example-request-valid-visa-nonce)
  4. [createCustomer](#4-createcustomer)
     - [Validation Error](#i-example-request-validation-error)
  5. [Refund](#5-refund)
  6. [Partial Refund](#6-partial-refund)
  7. [SubmitForSettlement](#7-submitforsettlement)
  8. [AddPackageTracking](#8-addPackageTracking)
  9. [Void](#9-void)
  10. [Partial SubmitForSettlement](#10-partial-submitforsettlement)
  11. [Transaction Refund](#11-transaction-refund)
  12. [Transaction SubmitForSettlement](#12-transaction-submitforsettlement)
  13. [TransactionSale](#13-transactionsale)
      - [TransactionSale US Merchant](#i-example-request-transactionsale-us-merchant)
      - [Gateway Declined](#ii-example-request-gateway-declined)
      - [SoftDecline](#iii-example-request-softdecline)
      - [VaultedCard](#iv-example-request-vaultedcard)
      - [Authorizaton](#v-example-request-authorizaton)
  14. [GetClientToken](#14-getclienttoken)
      - [GetClientToken US Merchant](#i-example-request-getclienttoken-us-merchant)
  15. [FindTransaction](#15-findtransaction)
  16. [SetCustomType For Payment](#16-setcustomtype-for-payment)
  17. [SetCustomType For Customer](#17-setcustomtype-for-customer)

---

## Authorization

### 1. Obtain access token

Use this request to obtain an access token for your commercetools platform project via Client Credentials Flow. As a prerequisite you must have filled out environment variables in Postman for projectKey, client_id and client_secret to use this.

**_Endpoint:_**

```bash
Method: POST
Type: RAW
URL: {{auth_url}}/oauth/token
```

**_Query params:_**

| Key        | Value              |
| ---------- | ------------------ |
| grant_type | client_credentials |


**_🔑 Authentication basic_**

| Key      | Value             |
|----------|-------------------|
| username | {{client_id}}     |
| password | {{client_secret}} |

<br>

### 2. Obtain access token through password flow

Use this request to obtain an access token for your commercetools platform project via Password Flow. As a prerequisite you must have filled out environment variables in Postman for projectKey, client_id, client_secret, user_email and user_password to use this.

**_Endpoint:_**

```bash
Method: POST
Type: RAW
URL: {{auth_url}}/oauth/{{project-key}}/customers/token
```

**_Query params:_**

| Key        | Value    |
| ---------- | -------- |
| grant_type | password |
| username   |          |
| password   |          |

**_🔑 Authentication basic_**

| Key      | Value             |
|----------|-------------------|
| username | {{client_id}}     |
| password | {{client_secret}} |

<br>

### 3. Token for Anonymous Sessions

Use this request to obtain an access token for a anonymous session. As a prerequisite you must have filled out environment variables in Postman for projectKey, client_id and client_secret to use this.

**_Endpoint:_**

```bash
Method: POST
Type: RAW
URL: {{auth_url}}/oauth/{{project-key}}/anonymous/token
```

**_Query params:_**

| Key        | Value              |
| ---------- | ------------------ |
| grant_type | client_credentials |

**_🔑 Authentication basic_**

| Key      | Value             |
|----------|-------------------|
| username | {{client_id}}     |
| password | {{client_secret}} |

<br>

### 4. Token Introspection

Token introspection allows to determine the active state of an OAuth 2.0 access token and to determine meta-information about this accces token, such as the `scope`.

**_Endpoint:_**

```bash
Method: POST
Type: RAW
URL: {{auth_url}}/oauth/introspect
```

**_Headers:_**

| Key          | Value            |
| ------------ | ---------------- |
| Content-Type | application/json |

**_Query params:_**

| Key   | Value                |
| ----- | -------------------- |
| token | {{ctp_access_token}} |

**_🔑 Authentication basic_**

| Key      | Value             |
|----------|-------------------|
| username | {{client_id}}     |
| password | {{client_secret}} |

<br>

## Braintree

The Braintree endpoint gives examples how to trigger certain Braintree events using the connect application. When a payment has the custom type with the key "braintree-payment-type", there are custom fields to set (e.g. getClientTokenRequest, transactionSaleRequest, ...) so that the extension will call the Braintree API and return the response in a corresponding custom field (e.g. getClientTokenResponse, ...). Additionally the request and response is stored in the payment interactions of that payment and for certain calls a transaction is created in the payment object (e.g. transactionSale, refund, submitForSettlement, ...).

The request data needs to be provided as an json encoded string.

### 1. SetCustomerId

Set the braintree customer id of a customer. This is only for testing. The braintree customer id is normally set when using the findCustomerRequest or createCustomerRequest.

**_Endpoint:_**

```bash
Method: POST
Type: RAW
URL: {{host}}/{{project-key}}/customers/{{customer-id}}
```

**_Headers:_**

| Key          | Value            |
| ------------ | ---------------- |
| Content-Type | application/json |

**_Body:_**

```js
{
    "version": {{customer-version}},
    "actions": [
        {
            "action" : "setCustomType",
            "type" : {
              "key" : "braintree-customer-type",
              "typeId" : "type"
            },
            "fields" : {
              "braintreeCustomerId" : "{{customer-id}}"
            }
          }
    ]
}
```

**_🔑 Authentication oauth2_**

| Key         | Value                |
|-------------|----------------------|
| accessToken | {{ctp_access_token}} |
| addTokenTo  | header               |
| tokenType   | Bearer               |

<br>

### 2. findCustomer

Find a customer in Braintree. To find the customer the customers braintreeCustomerId custom field is used or otherwise the customers id.

**_Endpoint:_**

```bash
Method: POST
Type: RAW
URL: {{host}}/{{project-key}}/customers/{{customer-id}}
```

**_Headers:_**

| Key          | Value            |
| ------------ | ---------------- |
| Content-Type | application/json |

**_Body:_**

```js
{
    "version": {{customer-version}},
    "actions": [
        {
            "action" : "setCustomField",
            "name" : "findRequest",
            "value" : "{}"
          }
    ]
}
```

**_🔑 Authentication oauth2_**

| Key         | Value                |
|-------------|----------------------|
| accessToken | {{ctp_access_token}} |
| addTokenTo  | header               |
| tokenType   | Bearer               |

<br>

### 3. vaultCustomer

Vault a payment method for a customer. If the customer does not exist as a Braintree customer yet, the customer will be created.

**_Endpoint:_**

```bash
Method: POST
Type: RAW
URL: {{host}}/{{project-key}}/customers/{{customer-id}}
```

**_Headers:_**

| Key          | Value            |
| ------------ | ---------------- |
| Content-Type | application/json |

**_Body:_**

```js
{
    "version": {{customer-version}},
    "actions": [
        {
            "action" : "setCustomField",
            "name" : "vaultRequest",
            "value" : "fake-valid-nonce"
          }
    ]
}
```

**_🔑 Authentication oauth2_**

| Key         | Value                |
|-------------|----------------------|
| accessToken | {{ctp_access_token}} |
| addTokenTo  | header               |
| tokenType   | Bearer               |

<br>

**_More example Requests/Responses:_**

#### I. Example Request: Processor declined

**_Headers:_**

| Key          | Value            |
| ------------ | ---------------- |
| Content-Type | application/json |

**_Body:_**

```js
{
    "version": {{customer-version}},
    "actions": [
        {
            "action" : "setCustomField",
            "name" : "vaultRequest",
            "value" : "fake-processor-declined-mastercard-nonce"
          }
    ]
}
```

**_🔑 Authentication oauth2_**

| Key         | Value                |
|-------------|----------------------|
| accessToken | {{ctp_access_token}} |
| addTokenTo  | header               |
| tokenType   | Bearer               |

**_Status Code:_** 0

<br>

#### II. Example Request: Valid Visa Nonce

**_Headers:_**

| Key          | Value            |
| ------------ | ---------------- |
| Content-Type | application/json |

**_Body:_**

```js
{
    "version": {{customer-version}},
    "actions": [
        {
            "action" : "setCustomField",
            "name" : "vaultRequest",
            "value" : "fake-valid-nonce"
          }
    ]
}
```

**_🔑 Authentication oauth2_**

| Key         | Value                |
|-------------|----------------------|
| accessToken | {{ctp_access_token}} |
| addTokenTo  | header               |
| tokenType   | Bearer               |

**_Status Code:_** 0

<br>

### 4. createCustomer

Create a customer in Braintree. The commercetools customer id serves as the Braintree customer id.

**_Endpoint:_**

```bash
Method: POST
Type: RAW
URL: {{host}}/{{project-key}}/customers/{{customer-id}}
```

**_Headers:_**

| Key          | Value            |
| ------------ | ---------------- |
| Content-Type | application/json |

**_Body:_**

```js
{
    "version": {{customer-version}},
    "actions": [
        {
            "action" : "setCustomField",
            "name" : "createRequest",
            "value" : "{}"
          }
    ]
}
```

**_🔑 Authentication oauth2_**

| Key         | Value                |
|-------------|----------------------|
| accessToken | {{ctp_access_token}} |
| addTokenTo  | header               |
| tokenType   | Bearer               |

<br>


**_More example Requests/Responses:_**

#### I. Example Request: Validation Error

**_Headers:_**

| Key          | Value            |
| ------------ | ---------------- |
| Content-Type | application/json |

**_Body:_**

```js
{
    "version": {{customer-version}},
    "actions": [
        {
            "action" : "setCustomField",
            "name" : "createRequest",
            "value" : "{\"email\": \"invalidEmail\",\"creditCard\": {\"number\": \"notNumeric\",\"billingAddress\": {\"countryName\": \"notAValidCountry\"}}}"
          }
    ]
}
```

**_🔑 Authentication oauth2_**

| Key         | Value                |
|-------------|----------------------|
| accessToken | {{ctp_access_token}} |
| addTokenTo  | header               |
| tokenType   | Bearer               |


**_Status Code:_** 0

<br>

### 5. Refund

Refund a transaction.

You can refund transactions that have a status of settled or settling. If the transaction has not yet begun settlement, use Void instead. If you do not specify an amount to refund, the entire transaction amount will be refunded.

The payment needs at least one settled sale transaction. If there are multiple transactions, the newest one will be refunded. If you want to refund a specific transaction, provide the optional parameter transactionId (see Transaction Refund).

**_Endpoint:_**

```bash
Method: POST
Type: RAW
URL: {{host}}/{{project-key}}/payments/{{payment-id}}
```

**_Headers:_**

| Key          | Value            |
| ------------ | ---------------- |
| Content-Type | application/json |

**_Body:_**

```js
{
    "version": {{payment-version}},
    "actions": [
        {
            "action" : "setCustomField",
            "name" : "refundRequest",
            "value" : "{}"
          }
    ]
}
```

**_🔑 Authentication oauth2_**

| Key         | Value                |
|-------------|----------------------|
| accessToken | {{ctp_access_token}} |
| addTokenTo  | header               |
| tokenType   | Bearer               |

<br>

### 6. Partial Refund

Refund a transaction.

You can refund transactions that have a status of settled or settling. If the transaction has not yet begun settlement, use Void instead. If you do not specify an amount to refund, the entire transaction amount will be refunded.

The payment needs at least one settled sale transaction. If there are multiple transactions, the newest one will be refunded. If you want to refund a specific transaction, provide the optional parameter transactionId (see Transaction Refund).

**_Endpoint:_**

```bash
Method: POST
Type: RAW
URL: {{host}}/{{project-key}}/payments/{{payment-id}}
```

**_Headers:_**

| Key          | Value            |
| ------------ | ---------------- |
| Content-Type | application/json |

**_Body:_**

```js
{
    "version": {{payment-version}},
    "actions": [
        {
            "action" : "setCustomField",
            "name" : "refundRequest",
            "value" : "{\"amount\": 1}"
          }
    ]
}
```

**_🔑 Authentication oauth2_**

| Key         | Value                |
|-------------|----------------------|
| accessToken | {{ctp_access_token}} |
| addTokenTo  | header               |
| tokenType   | Bearer               |

<br>


### 7. SubmitForSettlement

Submit a transaction for settlement.

You can only submit transactions that have a status of authorized for settlement.

The payment needs at least one authorized transaction. If there are multiple transactions, the newest one will be submitted for settlement. If you want to submit a specific transaction, provide the optional parameter transactionId (see Transaction SubmitForSettlement).

**_Endpoint:_**

```bash
Method: POST
Type: RAW
URL: {{host}}/{{project-key}}/payments/{{payment-id}}
```

**_Headers:_**

| Key          | Value            |
| ------------ | ---------------- |
| Content-Type | application/json |

**_Body:_**

```js
{
    "version": {{payment-version}},
    "actions": [
        {
            "action" : "setCustomField",
            "name" : "submitForSettlementRequest",
            "value" : "{}"
          }
    ]
}
```

**_🔑 Authentication oauth2_**

| Key         | Value                |
|-------------|----------------------|
| accessToken | {{ctp_access_token}} |
| addTokenTo  | header               |
| tokenType   | Bearer               |

<br>

### 8. AddPackageTracking

Create Tracking Data for Payment.

The order id will be read from the payment object and the capture_id will be used from the transactions.

Please provide a trackingNumber and carrier.

Custom items can be submitted at your own responsibility.

**_Endpoint:_**

```bash
Method: POST
Type: RAW
URL: {{host}}/{{project-key}}/payments/{{payment-id}}
```

**_Headers:_**

| Key          | Value            |
| ------------ | ---------------- |
| Content-Type | application/json |

**_Body:_**

```js
{
    "version": {{payment-version}},
    "actions": [
        {
            "action" : "setCustomField",
            "name" : "addPackageTrackingRequest",
            "value" : "{\"carrier\": \"DHL\", \"trackingNumber\":\"1234567\"}"
          }
    ]
}
```

**_🔑 Authentication oauth2_**

| Key         | Value                |
|-------------|----------------------|
| accessToken | {{ctp_access_token}} |
| addTokenTo  | header               |
| tokenType   | Bearer               |

<br>


### 9. Void

Void a transaction.

You can void transactions that have a status of authorized, submitted for settlement, or - for PayPal - settlement pending. When the transaction is voided, we will perform an authorization reversal, if possible, to remove the pending charge from the customer's card.

The payment needs at least one authorized transaction. If there are multiple transactions, the newest one will be voided. If you want to void a specific transaction, provide the optional parameter transactionId (see Transaction Void).

**_Endpoint:_**

```bash
Method: POST
Type: RAW
URL: {{host}}/{{project-key}}/payments/{{payment-id}}
```

**_Headers:_**

| Key          | Value            |
| ------------ | ---------------- |
| Content-Type | application/json |

**_Body:_**

```js
{
    "version": {{payment-version}},
    "actions": [
        {
            "action" : "setCustomField",
            "name" : "voidRequest",
            "value" : "{}"
          }
    ]
}
```

**_🔑 Authentication oauth2_**

| Key         | Value                |
|-------------|----------------------|
| accessToken | {{ctp_access_token}} |
| addTokenTo  | header               |
| tokenType   | Bearer               |

<br>

### 10. Partial SubmitForSettlement

Submit a transaction for settlement.

You can only submit transactions that have a status of authorized for settlement.

The payment needs at least one authorized transaction. If there are multiple transactions, the newest one will be submitted for settlement. If you want to submit a specific transaction, provide the optional parameter transactionId (see Transaction SubmitForSettlement).

**_Endpoint:_**

```bash
Method: POST
Type: RAW
URL: {{host}}/{{project-key}}/payments/{{payment-id}}
```

**_Headers:_**

| Key          | Value            |
| ------------ | ---------------- |
| Content-Type | application/json |

**_Body:_**

```js
{
    "version": {{payment-version}},
    "actions": [
        {
            "action" : "setCustomField",
            "name" : "submitForSettlementRequest",
            "value" : "{\"amount\": 1}"
          }
    ]
}
```

**_🔑 Authentication oauth2_**

| Key         | Value                |
|-------------|----------------------|
| accessToken | {{ctp_access_token}} |
| addTokenTo  | header               |
| tokenType   | Bearer               |

<br>

### 11. Transaction Refund

Refund a transaction.

You can refund transactions that have a status of settled or settling. If the transaction has not yet begun settlement, use Void instead. If you do not specify an amount to refund, the entire transaction amount will be refunded.

**_Endpoint:_**

```bash
Method: POST
Type: RAW
URL: {{host}}/{{project-key}}/payments/{{payment-id}}
```

**_Headers:_**

| Key          | Value            |
| ------------ | ---------------- |
| Content-Type | application/json |

**_Body:_**

```js
{
    "version": {{payment-version}},
    "actions": [
        {
            "action" : "setTransactionCustomType",
            "transactionId": "{{transaction-id}}",
            "type" : {
              "key" : "braintree-payment-transaction-type",
              "typeId" : "type"
            },
            "fields" : {
              "refundRequest" : "{}"
            }
          }
    ]
}
```

**_🔑 Authentication oauth2_**

| Key         | Value                |
|-------------|----------------------|
| accessToken | {{ctp_access_token}} |
| addTokenTo  | header               |
| tokenType   | Bearer               |

<br>

### 12. Transaction SubmitForSettlement

Submit a transaction for settlement.

You can only submit transactions that have a status of authorized for settlement.

**_Endpoint:_**

```bash
Method: POST
Type: RAW
URL: {{host}}/{{project-key}}/payments/{{payment-id}}
```

**_Headers:_**

| Key          | Value            |
| ------------ | ---------------- |
| Content-Type | application/json |

**_Body:_**

```js
{
    "version": {{payment-version}},
    "actions": [
        {
            "action" : "setTransactionCustomType",
            "transactionId": "{{transaction-id}}",
            "type" : {
              "key" : "braintree-payment-transaction-type",
              "typeId" : "type"
            },
            "fields" : {
              "submitForSettlementRequest" : "{}"
            }
          }
    ]
}
```

**_🔑 Authentication oauth2_**

| Key         | Value                |
|-------------|----------------------|
| accessToken | {{ctp_access_token}} |
| addTokenTo  | header               |
| tokenType   | Bearer               |

<br>

### 13. TransactionSale

Make a transaction sale request.

The value of the transactionSaleRequest can be the paymentMethodNonce or a JSON containing at least the paymentMethodNonce.

**_Endpoint:_**

```bash
Method: POST
Type: RAW
URL: {{host}}/{{project-key}}/payments/{{payment-id}}
```

**_Headers:_**

| Key          | Value            |
| ------------ | ---------------- |
| Content-Type | application/json |

**_Body:_**

```js
{
    "version": {{payment-version}},
    "actions": [
        {
            "action" : "setCustomField",
            "name" : "transactionSaleRequest",
            "value" : "{\"paymentMethodNonce\": \"fake-valid-nonce\""
          }
    ]
}
```

**_🔑 Authentication oauth2_**

| Key         | Value                |
|-------------|----------------------|
| accessToken | {{ctp_access_token}} |
| addTokenTo  | header               |
| tokenType   | Bearer               |

<br>

**_More example Requests/Responses:_**

#### I. Example Request: TransactionSale US Merchant

**_Headers:_**

| Key          | Value            |
| ------------ | ---------------- |
| Content-Type | application/json |

**_Body:_**

```js
{
    "version": {{payment-version}},
    "actions": [
        {
            "action" : "setCustomField",
            "name" : "transactionSaleRequest",
            "value" : "{\"amount\": 1497, \"paymentMethodNonce\": \"fake-valid-nonce\", \"merchantAccountId\": \"us-merchant\"}"
          }
    ]
}
```

**_🔑 Authentication oauth2_**

| Key         | Value                |
|-------------|----------------------|
| accessToken | {{ctp_access_token}} |
| addTokenTo  | header               |
| tokenType   | Bearer               |

**_Status Code:_** 0

<br>

#### II. Example Request: Gateway Declined

**_Headers:_**

| Key          | Value            |
| ------------ | ---------------- |
| Content-Type | application/json |

**_Body:_**

```js
{
    "version": {{payment-version}},
    "actions": [
        {
            "action" : "setCustomField",
            "name" : "transactionSaleRequest",
            "value" : "{\"amount\": 497, \"paymentMethodNonce\": \"fake-consumed-nonce\"}"
          }
    ]
}
```

**_🔑 Authentication oauth2_**

| Key         | Value                |
|-------------|----------------------|
| accessToken | {{ctp_access_token}} |
| addTokenTo  | header               |
| tokenType   | Bearer               |

**_Status Code:_** 0

<br>

#### III. Example Request: SoftDecline

**_Headers:_**

| Key          | Value            |
| ------------ | ---------------- |
| Content-Type | application/json |

**_Body:_**

```js
{
    "version": {{payment-version}},
    "actions": [
        {
            "action" : "setCustomField",
            "name" : "transactionSaleRequest",
            "value" : "{\"amount\": 2001, \"paymentMethodNonce\": \"fake-valid-nonce\"}"
          }
    ]
}
```

**_🔑 Authentication oauth2_**

| Key         | Value                |
|-------------|----------------------|
| accessToken | {{ctp_access_token}} |
| addTokenTo  | header               |
| tokenType   | Bearer               |

**_Status Code:_** 0

<br>

#### IV. Example Request: VaultedCard

**_Headers:_**

| Key          | Value            |
| ------------ | ---------------- |
| Content-Type | application/json |

**_Body:_**

```js
{
    "version": {{payment-version}},
    "actions": [
        {
            "action" : "setCustomField",
            "name" : "transactionSaleRequest",
            "value" : "{\"amount\": 1497, \"paymentMethodToken\": \"1353sahg\"}"
          }
    ]
}
```

**_🔑 Authentication oauth2_**

| Key         | Value                |
|-------------|----------------------|
| accessToken | {{ctp_access_token}} |
| addTokenTo  | header               |
| tokenType   | Bearer               |

**_Status Code:_** 0

<br>

#### V. Example Request: Authorizaton

**_Headers:_**

| Key          | Value            |
| ------------ | ---------------- |
| Content-Type | application/json |

**_Body:_**

```js
{
    "version": {{payment-version}},
    "actions": [
        {
            "action" : "setCustomField",
            "name" : "transactionSaleRequest",
            "value" : "{\"amount\": 1497, \"paymentMethodNonce\": \"fake-valid-nonce\", \"options\":{\"submitForSettlement\": false}}"
          }
    ]
}
```

**_🔑 Authentication oauth2_**

| Key         | Value                |
|-------------|----------------------|
| accessToken | {{ctp_access_token}} |
| addTokenTo  | header               |
| tokenType   | Bearer               |

**_Status Code:_** 0

<br>

### 14. GetClientToken

Get Client Token.

Returns a string which contains all authorization and configuration  
information your client needs to initialize the client SDK to  
communicate with Braintree.

**_Endpoint:_**

```bash
Method: POST
Type: RAW
URL: {{host}}/{{project-key}}/payments/{{payment-id}}
```

**_Headers:_**

| Key          | Value            |
| ------------ | ---------------- |
| Content-Type | application/json |

**_Body:_**

```js
{
    "version": {{payment-version}},
    "actions": [
        {
            "action" : "setCustomField",
            "name" : "getClientTokenRequest",
            "value" : "{}"
          }
    ]
}
```

**_🔑 Authentication oauth2_**

| Key         | Value                |
|-------------|----------------------|
| accessToken | {{ctp_access_token}} |
| addTokenTo  | header               |
| tokenType   | Bearer               |

**_More example Requests/Responses:_**

#### I. Example Request: GetClientToken US Merchant

**_Headers:_**

| Key          | Value            |
| ------------ | ---------------- |
| Content-Type | application/json |

**_Body:_**

```js
{
    "version": {{payment-version}},
    "actions": [
        {
            "action" : "setCustomField",
            "name" : "getClientTokenRequest",
            "value" : "{\"merchantAccountId\": \"us-merchant\"}"
          }
    ]
}
```

**_🔑 Authentication oauth2_**

| Key         | Value                |
|-------------|----------------------|
| accessToken | {{ctp_access_token}} |
| addTokenTo  | header               |
| tokenType   | Bearer               |

**_Status Code:_** 0

<br>

### 15. FindTransaction

Find a transaction by the payments orderId.

Searchs for a transaction which has the orderId that is set in the custom field BraintreeOrderId of the payment.

The custom field needs to be set manually or by calling a transactionSaleRequest with the property orderId set.

**_Endpoint:_**

```bash
Method: POST
Type: RAW
URL: {{host}}/{{project-key}}/payments/{{payment-id}}
```

**_Headers:_**

| Key          | Value            |
| ------------ | ---------------- |
| Content-Type | application/json |

**_Body:_**

```js
{
    "version": {{payment-version}},
    "actions": [
        {
            "action" : "setCustomField",
            "name" : "findTransactionRequest",
            "value" : "{}"
          }
    ]
}
```

**_🔑 Authentication oauth2_**

| Key         | Value                |
|-------------|----------------------|
| accessToken | {{ctp_access_token}} |
| addTokenTo  | header               |
| tokenType   | Bearer               |

<br>

### 16. SetCustomType For Payment

Set the custom type of a payment to braintree-payment-type so that custom fields like getClientTokenRequest can be set.

**_Endpoint:_**

```bash
Method: POST
Type: RAW
URL: {{host}}/{{project-key}}/payments/{{payment-id}}
```

**_Headers:_**

| Key          | Value            |
| ------------ | ---------------- |
| Content-Type | application/json |

**_Body:_**

```js
{
    "version": {{payment-version}},
    "actions": [
        {
            "action" : "setCustomType",
            "type" : {
              "key" : "braintree-payment-type",
              "typeId" : "type"
            }
          }
    ]
}
```

**_🔑 Authentication oauth2_**

| Key         | Value                |
|-------------|----------------------|
| accessToken | {{ctp_access_token}} |
| addTokenTo  | header               |
| tokenType   | Bearer               |

<br>

### 17. SetCustomType For Customer

Set the custom type of a payment to braintree-payment-type so that custom fields like getClientTokenRequest can be set.

**_Endpoint:_**

```bash
Method: POST
Type: RAW
URL: {{host}}/{{project-key}}/customers/{{customer-id}}
```

**_Headers:_**

| Key          | Value            |
| ------------ | ---------------- |
| Content-Type | application/json |

**_Body:_**

```js
{
    "version": {{customer-version}},
    "actions": [
        {
            "action" : "setCustomType",
            "type" : {
              "key" : "braintree-customer-type",
              "typeId" : "type"
            }
          }
    ]
}
```

**_🔑 Authentication oauth2_**

| Key         | Value                |
|-------------|----------------------|
| accessToken | {{ctp_access_token}} |
| addTokenTo  | header               |
| tokenType   | Bearer               |

---

[Back to top](#commercetools)
