This connector has one application:

# braintree-extension

- this extension handles updates of payments of the type `braintree-payment-type`.
- Updates to the fields `getClientTokenRequest`, `transactionSaleRequest`, etc. will be handled by calling the corresponding Braintree endpoint and returning the reponse in the corresponding custom fields (e.g. `getClientTokenResponse`)
- the docs provide a [postman collection](Braintree.postman_collection.json) to illustrate the payment update actions to use. The documentation for the collection can be found [here](Braintree.md).