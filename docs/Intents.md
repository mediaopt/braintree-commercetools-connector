# Payment Intents

How this connector maps the commercetools
[Payment Intents API operations](https://docs.commercetools.com/checkout/payment-intents-api#ctp:checkout:type:PaymentIntentOperation)
onto Braintree.

## Entry point

The merchant calls the Payment Intents API on commercetools' Checkout host, which forwards the request to the
processor's `POST /operations/payment-intents/:id` route. On a deployed connector, the operation needs a valid
commercetools Checkout order behind the payment. Call the processor route directly only for local tests.

## Mapping

| commercetools action | Braintree call                                                                                       |
| -------------------- | ---------------------------------------------------------------------------------------------------- |
| `capturePayment`     | `submitForSettlement` or `submitForPartialSettlement` (see [Capture](#capture))                      |
| `refundPayment`      | `refund`                                                                                             |
| `cancelPayment`      | `void`                                                                                               |
| `reversePayment`     | `refund` or `void`, depending on the target transaction's Braintree status (see [Reverse](#reverse)) |

## Call parameters

Full shape of an action, as sent to the Payment Intents API:

```json
{
  "action": "capturePayment",
  "amount": {
    "centAmount": 10000,
    "currencyCode": "EUR"
  },
  "merchantReference": "example-reference"
}
```

- `amount` is required by, and supported only for, `capturePayment` and `refundPayment`. If you need an amount for
  other actions, request amount support from commercetools first, then please open an issue in this repository.
- `transactionId` is optional and used only by `refundPayment`. It's the Braintree transaction id of the capture to
  refund.
- `cancelPayment` and `reversePayment` have no `transactionId`. To target a specific Braintree transaction (e.g. one
  of several partial captures), pass its Braintree transaction id as `merchantReference`.
- A `transactionId` or `merchantReference` is resolved as follows:
  - it matches a transaction on the payment → that transaction is the target
  - otherwise → rejected
  - none given → the default target of the operation (see [Refund](#refund), [Cancel](#cancel), [Reverse](#reverse))
- `capturePayment` always targets the payment's Authorization.
- The connector doesn't validate what the merchant sends. Matching `amount` and `currencyCode` to the payment and
  picking the right transaction is the merchant's responsibility. Merchants who want the connector to handle a full
  capture or refund automatically can use the `braintree-extension` custom-field requests instead.

## How this connector answers

The outcome values are defined by commercetools (see the link above). This connector answers as follows:

- **A Braintree call failed**, including a decline, since a Braintree response with `success: false` counts as a
  failure. The answer is rejected, logged with `logger.error`, and recorded on the payment as the `{operation}Response`
  custom field plus pspInteractions. There is no retry and no follow-up lookup on Braintree.
- **The operation is impossible in the payment's current state** (nothing suitable to act on, already fully
  refunded, a `transactionId` or `merchantReference` that doesn't belong to the payment, more than one capture to refund or
  reverse without a target, a Braintree status that can't be reversed). The answer is rejected, logged with `logger.warn`.
- **Already refunded, checked on commercetools only.** Before calling Braintree, refund and reverse are rejected
  (`logger.warn`) when the payment itself proves they can't succeed. That's only the case when the target is the
  payment's only Charge and its Success and Pending Refunds already cover it, or, for refund, leave less than the
  requested amount. With more than one Charge, a Refund can't be attributed to a capture, so Braintree decides.
- **Otherwise**, the outcome follows the Braintree status of the resulting transaction.

## Braintree parent and child transactions

A partial capture creates a child transaction with its own id and changes the state of the parent (the
authorization). See Braintree's
[Submit for partial settlement](https://developer.paypal.com/braintree/docs/reference/request/transaction/submit-for-partial-settlement/node).
On commercetools, the Authorization transaction carries the parent's id and each Charge carries its child's id.

## Rules per operation

### Capture

- The first capture of the full authorized amount uses `submitForSettlement`. No child is created, so the payment
  keeps a single Braintree transaction.
- Any other capture uses `submitForPartialSettlement`, which creates a child.

### Refund

- Targets the capture given as `transactionId`. Without it, the payment's single active capture (a Charge that
  hasn't failed); with more than one active capture → rejected.
- Braintree refunds one transaction at a time, up to what's left on it. A refund bigger than any single capture has
  to be split by the merchant into one `refundPayment` per capture, each with its `transactionId`. The connector
  doesn't split amounts.

### Cancel

- Voids the transaction given as `merchantReference`, otherwise the parent (Authorization).
- For voiding a parent that already has partial captures, see Braintree's
  [Submit for partial settlement](https://developer.paypal.com/braintree/docs/reference/request/transaction/submit-for-partial-settlement/node).

### Reverse

- Targets the transaction given as `merchantReference`. Without it, the single active capture, or the parent when
  there is no capture; with more than one active capture → rejected.
- The target's live Braintree status decides:
  - `authorized`, `submitted_for_settlement`, `settlement_pending` → void
  - `settling`, `settled`, `settlement_confirmed` → refund without an amount, so Braintree refunds what is left on
    that transaction
  - anything else → rejected

### After a void

- If the voided transaction has a Pending Charge on commercetools, that Charge is moved to Failure, since no
  settlement webhook will ever arrive for it.

### Payment status fields

- `statusInterfaceCode` and `statusInterfaceText` hold the Braintree status of the last operation, the same as in
  `braintree-extension`. The state of each capture is in the payment's transactions.

## ACH micro-deposit verification

This flow applies only to ACH with micro-deposit verification (see Braintree's
[ACH verification](https://developer.paypal.com/braintree/docs/guides/ach/overview#verification)). Until verification
completes, Braintree has no transaction, only the vaulted bank account, and the payment carries a placeholder
Authorization instead.

- Cancel and reverse write a cancel marker on commercetools (a CancelAuthorization carrying the placeholder's marker
  id). There's nothing to void on Braintree.
- If the marker can't be written, the answer is rejected.
- The processor's `transactionSale` refuses a payment carrying the marker, so the cancelled Order can't be charged
  once the micro-deposits are verified.
