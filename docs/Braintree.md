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



⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃
# 📁 Collection: Braintree 


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
            "value" : "{\"transactionId\": \"a5q49fs3\", \"amount\": 10}"
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



⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃

## End-point: TransactionSale
post Payments
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



⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃

## End-point: SetCustomType
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
              "id" : "braintree-payment-type",
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

_________________________________________________
