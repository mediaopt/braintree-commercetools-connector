This connector has one application:

# braintree-extension

- this extension handles updates of payments of the type `braintree-payment-type` and customers of type `braintree-customer-type`.
- Updates to the fields `getClientTokenRequest`, `transactionSaleRequest`, etc. will be handled by calling the corresponding Braintree endpoint and returning the reponse in the corresponding custom fields (e.g. `getClientTokenResponse`)
- the docs provide a [postman collection](Braintree.postman_collection.json) to illustrate the payment and customer update actions to use. The documentation for the collection can be found [here](Braintree.md).

# braintree-notifications

- this extension handles webhook messages from braintree
- messages of type check will result in a status 200 response
- all other messages will result in a status 200 response
- you need to register the url of the extension in the braintree control panel:
  - Log into the Control Panel
  - Click on the gear icon in the top right corner
  - Click API from the drop-down menu
  - Click on Webhooks and create a new Webhook
  - Provide the extension URL as the Destination URL and add the Local Payments webhook messages
  - After creating the webhook you can test the URL by selecting Check URL

# braintree-commercetools-events

- this event application listens for message of the type PaymentInteractionAdded
- whenever a payment interaction for a transactionSaleResponse is set, it will check whether a customer id is included
- if so, the corresponding customer in commercetools is loaded to check if the braintree customer id is already set
- if not, it will be set by the application