# Project: Commercetools
# Braintree Commercetools API Postman collection

This Postman collection contains examples of requests and responses for most endpoints and commands of the Braintree extension for Commercetools. For every command the smallest possible payload is given. Please find optional fields in the related official documentation.

## Disclaimer

This is not the official Braintree documentation. Please see [here](http://docs.commercetools.com/)
for a complete and approved documentation of the Braintree.

## How to use

**:warning: Be aware that postman automatically synchronizes environment variables (including your API client credentials) to your workspace if logged in.****Use this collection only for development purposes and non-production projects.**

To use this collection in Postman please perform the following steps:

1. Download and install the Postman Client
2. Import the collection.json and [template.json](https://github.com/commercetools/commercetools-postman-collection/blob/master/api/template.json) in your postman application
3. In the Merchant Center, create a new API Client and fill in the client credentials in your environment
4. Obtain an access token by sending the "Authorization/Obtain access token" request at the bottom of the request list. Now you can use all other endpoints


Feel free to clone and modify this collection to your needs.

To automate frequent tasks the collection automatically manages commonly required values and parameters such
as resource ids, keys and versions in Postman environment variables for you.

Please see [http://docs.commercetools.com/](http://docs.commercetools.com/) for further information about the commercetools Plattform.
# 📁 Collection: Authorization


## End-point: Obtain access token
Use this request to obtain an access token for your commercetools platform project via Client Credentials Flow. As a prerequisite you must have filled out environment variables in Postman for projectKey, client_id and client_secret to use this.
### Method: POST
>```
>{{auth_url}}/oauth/token?grant_type=client_credentials
>```
### Body (**raw**)

```json

```

### Query Params

|Param|value|
|---|---|
|grant_type|client_credentials|


### 🔑 Authentication basic

|Param|value|Type|
|---|---|---|
|username|{{client_id}}|string|
|password|{{client_secret}}|string|


⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃

## End-point: Obtain access token through password flow
Use this request to obtain an access token for your commercetools platform project via Password Flow. As a prerequisite you must have filled out environment variables in Postman for projectKey, client_id, client_secret, user_email and user_password to use this.
### Method: POST
>```
>{{auth_url}}/oauth/{{project-key}}/customers/token?grant_type=password&username=&password=
>```
### Headers

|Content-Type|Value|
|---|---|
|||


### Body (**raw**)

```json

```

### Query Params

|Param|value|
|---|---|
|grant_type|password|
|username||
|password||


### 🔑 Authentication basic

|Param|value|Type|
|---|---|---|
|username|{{client_id}}|string|
|password|{{client_secret}}|string|


⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃

## End-point: Token for Anonymous Sessions
Use this request to obtain an access token for a anonymous session. As a prerequisite you must have filled out environment variables in Postman for projectKey, client_id and client_secret to use this.
### Method: POST
>```
>{{auth_url}}/oauth/{{project-key}}/anonymous/token?grant_type=client_credentials
>```
### Body (**raw**)

```json

```

### Query Params

|Param|value|
|---|---|
|grant_type|client_credentials|


### 🔑 Authentication basic

|Param|value|Type|
|---|---|---|
|username|{{client_id}}|string|
|password|{{client_secret}}|string|


⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃

## End-point: Token Introspection
Token introspection allows to determine the active state of an OAuth 2.0 access token and to determine meta-information about this accces token, such as the `scope`.
### Method: POST
>```
>{{auth_url}}/oauth/introspect?token={{ctp_access_token}}
>```
### Headers

|Content-Type|Value|
|---|---|
|Content-Type|application/json|


### Body (**raw**)

```json

```

### Query Params

|Param|value|
|---|---|
|token|{{ctp_access_token}}|


### 🔑 Authentication basic

|Param|value|Type|
|---|---|---|
|username|{{client_id}}|string|
|password|{{client_secret}}|string|


⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃
# 📁 Collection: Braintree


## End-point: SetCustomerId
Set the braintree customer id of a customer. This is only for testing. The braintree customer id is normally set when using the findCustomerRequest or createCustomerRequest.
### Method: POST
>```
>{{host}}/{{project-key}}/customers/{{customer-id}}
>```
### Headers

|Content-Type|Value|
|---|---|
|Content-Type|application/json|


### Body (**raw**)

```json
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

### Query Params

|Param|value|
|---|---|
|expand||


### 🔑 Authentication oauth2

|Param|value|Type|
|---|---|---|
|accessToken|{{ctp_access_token}}|string|
|addTokenTo|header|string|
|tokenType|Bearer|string|


⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃

## End-point: findCustomer
Find a customer in Braintree. To find the customer the customers braintreeCustomerId custom field is used or otherwise the customers id.
### Method: POST
>```
>{{host}}/{{project-key}}/customers/{{customer-id}}
>```
### Headers

|Content-Type|Value|
|---|---|
|Content-Type|application/json|


### Body (**raw**)

```json
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

### Query Params

|Param|value|
|---|---|
|expand||


### 🔑 Authentication oauth2

|Param|value|Type|
|---|---|---|
|accessToken|{{ctp_access_token}}|string|
|addTokenTo|header|string|
|tokenType|Bearer|string|


⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃

## End-point: vaultCustomer
Vault a payment method for a customer. If the customer does not exist as a Braintree customer yet, the customer will be created.
### Method: POST
>```
>{{host}}/{{project-key}}/customers/{{customer-id}}
>```
### Headers

|Content-Type|Value|
|---|---|
|Content-Type|application/json|


### Body (**raw**)

```json
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

### Query Params

|Param|value|
|---|---|
|expand||


### 🔑 Authentication oauth2

|Param|value|Type|
|---|---|---|
|accessToken|{{ctp_access_token}}|string|
|addTokenTo|header|string|
|tokenType|Bearer|string|

### Response: undefined
```json

```


⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃

## End-point: createCustomer
Create a customer in Braintree. The commercetools customer id serves as the Braintree customer id.
### Method: POST
>```
>{{host}}/{{project-key}}/customers/{{customer-id}}
>```
### Headers

|Content-Type|Value|
|---|---|
|Content-Type|application/json|


### Body (**raw**)

```json
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

### Query Params

|Param|value|
|---|---|
|expand||


### 🔑 Authentication oauth2

|Param|value|Type|
|---|---|---|
|accessToken|{{ctp_access_token}}|string|
|addTokenTo|header|string|
|tokenType|Bearer|string|

### Response: undefined
```json

```


⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃

## End-point: Refund
Refund a transaction.

You can refund transactions that have a status of settled or settling. If the transaction has not yet begun settlement, use Void instead. If you do not specify an amount to refund, the entire transaction amount will be refunded.

The payment needs at least one settled sale transaction. If there are multiple transactions, the newest one will be refunded. If you want to refund a specific transaction, provide the optional parameter transactionId (see Transaction Refund).
### Method: POST
>```
>{{host}}/{{project-key}}/payments/{{payment-id}}
>```
### Headers

|Content-Type|Value|
|---|---|
|Content-Type|application/json|


### Body (**raw**)

```json
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

### Query Params

|Param|value|
|---|---|
|expand||


### 🔑 Authentication oauth2

|Param|value|Type|
|---|---|---|
|accessToken|{{ctp_access_token}}|string|
|addTokenTo|header|string|
|tokenType|Bearer|string|


⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃

## End-point: Partial Refund
Refund a transaction.

You can refund transactions that have a status of settled or settling. If the transaction has not yet begun settlement, use Void instead. If you do not specify an amount to refund, the entire transaction amount will be refunded.

The payment needs at least one settled sale transaction. If there are multiple transactions, the newest one will be refunded. If you want to refund a specific transaction, provide the optional parameter transactionId (see Transaction Refund).
### Method: POST
>```
>{{host}}/{{project-key}}/payments/{{payment-id}}
>```
### Headers

|Content-Type|Value|
|---|---|
|Content-Type|application/json|


### Body (**raw**)

```json
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

### Query Params

|Param|value|
|---|---|
|expand||


### 🔑 Authentication oauth2

|Param|value|Type|
|---|---|---|
|accessToken|{{ctp_access_token}}|string|
|addTokenTo|header|string|
|tokenType|Bearer|string|


⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃

## End-point: SubmitForSettlement
Submit a transaction for settlement.

You can only submit transactions that have a status of authorized for settlement.

The payment needs at least one authorized transaction. If there are multiple transactions, the newest one will be submitted for settlement. If you want to submit a specific transaction, provide the optional parameter transactionId (see Transaction SubmitForSettlement).
### Method: POST
>```
>{{host}}/{{project-key}}/payments/{{payment-id}}
>```
### Headers

|Content-Type|Value|
|---|---|
|Content-Type|application/json|


### Body (**raw**)

```json
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

### Query Params

|Param|value|
|---|---|
|expand||


### 🔑 Authentication oauth2

|Param|value|Type|
|---|---|---|
|accessToken|{{ctp_access_token}}|string|
|addTokenTo|header|string|
|tokenType|Bearer|string|


⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃

## End-point: Void
Void a transaction.

You can void transactions that have a status of authorized, submitted for settlement, or - for PayPal - settlement pending. When the transaction is voided, we will perform an authorization reversal, if possible, to remove the pending charge from the customer's card.

The payment needs at least one authorized transaction. If there are multiple transactions, the newest one will be voided. If you want to void a specific transaction, provide the optional parameter transactionId (see Transaction Void).
### Method: POST
>```
>{{host}}/{{project-key}}/payments/{{payment-id}}
>```
### Headers

|Content-Type|Value|
|---|---|
|Content-Type|application/json|


### Body (**raw**)

```json
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

### Query Params

|Param|value|
|---|---|
|expand||


### 🔑 Authentication oauth2

|Param|value|Type|
|---|---|---|
|accessToken|{{ctp_access_token}}|string|
|addTokenTo|header|string|
|tokenType|Bearer|string|


⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃

## End-point: Partial SubmitForSettlement
Submit a transaction for settlement.

You can only submit transactions that have a status of authorized for settlement.

The payment needs at least one authorized transaction. If there are multiple transactions, the newest one will be submitted for settlement. If you want to submit a specific transaction, provide the optional parameter transactionId (see Transaction SubmitForSettlement).
### Method: POST
>```
>{{host}}/{{project-key}}/payments/{{payment-id}}
>```
### Headers

|Content-Type|Value|
|---|---|
|Content-Type|application/json|


### Body (**raw**)

```json
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

### Query Params

|Param|value|
|---|---|
|expand||


### 🔑 Authentication oauth2

|Param|value|Type|
|---|---|---|
|accessToken|{{ctp_access_token}}|string|
|addTokenTo|header|string|
|tokenType|Bearer|string|


⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃

## End-point: Transaction Refund
Refund a transaction.

You can refund transactions that have a status of settled or settling. If the transaction has not yet begun settlement, use Void instead. If you do not specify an amount to refund, the entire transaction amount will be refunded.
### Method: POST
>```
>{{host}}/{{project-key}}/payments/{{payment-id}}
>```
### Headers

|Content-Type|Value|
|---|---|
|Content-Type|application/json|


### Body (**raw**)

```json
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

### Query Params

|Param|value|
|---|---|
|expand||


### 🔑 Authentication oauth2

|Param|value|Type|
|---|---|---|
|accessToken|{{ctp_access_token}}|string|
|addTokenTo|header|string|
|tokenType|Bearer|string|


⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃

## End-point: Transaction SubmitForSettlement
Submit a transaction for settlement.

You can only submit transactions that have a status of authorized for settlement.
### Method: POST
>```
>{{host}}/{{project-key}}/payments/{{payment-id}}
>```
### Headers

|Content-Type|Value|
|---|---|
|Content-Type|application/json|


### Body (**raw**)

```json
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

### Query Params

|Param|value|
|---|---|
|expand||


### 🔑 Authentication oauth2

|Param|value|Type|
|---|---|---|
|accessToken|{{ctp_access_token}}|string|
|addTokenTo|header|string|
|tokenType|Bearer|string|


⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃

## End-point: TransactionSale
Make a transaction sale request.

The value of the transactionSaleRequest can be the paymentMethodNonce or a JSON containing at least the paymentMethodNonce.
### Method: POST
>```
>{{host}}/{{project-key}}/payments/{{payment-id}}
>```
### Headers

|Content-Type|Value|
|---|---|
|Content-Type|application/json|


### Body (**raw**)

```json
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

### Query Params

|Param|value|
|---|---|
|expand||


### 🔑 Authentication oauth2

|Param|value|Type|
|---|---|---|
|accessToken|{{ctp_access_token}}|string|
|addTokenTo|header|string|
|tokenType|Bearer|string|

### Response: undefined
```json

```


⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃

## End-point: GetClientToken
Get Client Token.

Returns a string which contains all authorization and configuration
information your client needs to initialize the client SDK to
communicate with Braintree.
### Method: POST
>```
>{{host}}/{{project-key}}/payments/{{payment-id}}
>```
### Headers

|Content-Type|Value|
|---|---|
|Content-Type|application/json|


### Body (**raw**)

```json
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

### Query Params

|Param|value|
|---|---|
|expand||


### 🔑 Authentication oauth2

|Param|value|Type|
|---|---|---|
|accessToken|{{ctp_access_token}}|string|
|addTokenTo|header|string|
|tokenType|Bearer|string|

### Response: undefined
```json

```


⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃

## End-point: FindTransaction
Find a transaction by the payments orderId.

Searchs for a transaction which has the orderId that is set in the custom field BraintreeOrderId of the payment.

The custom field needs to be set manually or by calling a transactionSaleRequest with the property orderId set.
### Method: POST
>```
>{{host}}/{{project-key}}/payments/{{payment-id}}
>```
### Headers

|Content-Type|Value|
|---|---|
|Content-Type|application/json|


### Body (**raw**)

```json
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

### Query Params

|Param|value|
|---|---|
|expand||


### 🔑 Authentication oauth2

|Param|value|Type|
|---|---|---|
|accessToken|{{ctp_access_token}}|string|
|addTokenTo|header|string|
|tokenType|Bearer|string|


⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃

## End-point: SetCustomType For Payment
Set the custom type of a payment to braintree-payment-type so that custom fields like getClientTokenRequest can be set.
### Method: POST
>```
>{{host}}/{{project-key}}/payments/{{payment-id}}
>```
### Headers

|Content-Type|Value|
|---|---|
|Content-Type|application/json|


### Body (**raw**)

```json
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

### Query Params

|Param|value|
|---|---|
|expand||


### 🔑 Authentication oauth2

|Param|value|Type|
|---|---|---|
|accessToken|{{ctp_access_token}}|string|
|addTokenTo|header|string|
|tokenType|Bearer|string|


⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃

## End-point: SetCustomType For Customer
Set the custom type of a payment to braintree-payment-type so that custom fields like getClientTokenRequest can be set.
### Method: POST
>```
>{{host}}/{{project-key}}/customers/{{customer-id}}
>```
### Headers

|Content-Type|Value|
|---|---|
|Content-Type|application/json|


### Body (**raw**)

```json
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

### Query Params

|Param|value|
|---|---|
|expand||


### 🔑 Authentication oauth2

|Param|value|Type|
|---|---|---|
|accessToken|{{ctp_access_token}}|string|
|addTokenTo|header|string|
|tokenType|Bearer|string|
_________________________________________________
