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
  "merchantReference": "<Braintree transaction id>"
}
```

- `amount` is required by, and supported only for, `capturePayment` and `refundPayment`. If you need an amount for
  other actions, request amount support from commercetools first, then please open an issue in this repository.
- `transactionId` is optional and used only by `refundPayment`. It's the Braintree transaction id of the capture to
  refund. `refundPayment` doesn't use `merchantReference`.
- `cancelPayment` and `reversePayment` have no `transactionId`. To target a specific Braintree transaction (e.g. one
  of several partial captures), pass its Braintree transaction id as `merchantReference`.
- `capturePayment` targets an Authorization: the one whose Braintree transaction id is given as `merchantReference`,
  otherwise the payment's last Authorization. A `merchantReference` that isn't an Authorization of the payment →
  rejected.
- For refund, cancel and reverse, a `transactionId` or `merchantReference` is resolved as follows:
  - it matches a transaction on the payment, of any type → that transaction is the target. Whether the operation
    applies to it is Braintree's decision, as in `braintree-extension`; e.g. cancel or reverse with a refund's id voids
    that refund while it's unsettled
  - otherwise → rejected
  - none given → the default target of the operation (see [Refund](#refund), [Cancel](#cancel), [Reverse](#reverse))
- Using the right Payment Intents action with the right parameters is the merchant's responsibility. The connector
  doesn't validate what the merchant sends, e.g. whether `amount` and `currencyCode` match the payment. Merchants
  who want the connector to handle a full capture or refund automatically can use the `braintree-extension`
  custom-field requests instead.
- The Braintree transaction id for `transactionId` or `merchantReference` is the `interactionId` of the
  transaction in the commercetools payment's transactions list. Its full details (the complete Braintree request
  and response) are in the payment's interface interactions.

## How this connector answers

The outcome values are defined by commercetools (see the link above). This connector answers as follows:

- **A Braintree call failed**, including a decline, since a Braintree response with `success: false` counts as a
  failure. The answer is rejected and logged with `logger.error`. The failure is recorded on the payment as the
  custom field named after the Braintree call (`submitForSettlementResponse`, `refundResponse`, `voidResponse`,
  `findTransactionResponse`) plus pspInteractions, best effort: if that commercetools write fails, the answer is
  still rejected and only the log remains. The Braintree call isn't retried, and there's no follow-up lookup on
  Braintree.
- **The payment doesn't carry the Braintree payment custom type**, which this connector sets when it creates a
  payment: either another system created the payment, or its type was overwritten later. The answer is rejected and
  logged with `logger.error`. If you are sure it's a Braintree checkout payment with a missing type, set that type
  with a raw commercetools call, (see `braintree-extension`). The checkout flow only sets one type for payment and
  it is the Braintree type on creation. So if this type is overwritten by some other part of your system it is your
  responsibility to prevent the override in the future. If the connector can't look up its payment type on
  commercetools, the answer is rejected and logged with `logger.error` too; the next call tries the lookup again.
- **The operation is impossible in the payment's current state** (nothing suitable to act on, already fully
  refunded, a `transactionId` or `merchantReference` that doesn't belong to the payment, a capture `merchantReference`
  that isn't an Authorization of the payment, more than one capture to refund or reverse without a target, a Braintree status that
  can't be reversed). The answer is rejected, logged with `logger.warn`.
- **Checked on commercetools only.** Before calling Braintree, an operation is rejected (`logger.warn`) when the
  payment itself grants it can't succeed:
  - refund and reverse: the target is the payment's only Charge and its Success and Pending Refunds already cover
    it, or, for refund, leave less than the requested amount. With more than one Charge, a Refund can't be
    attributed to a capture, so Braintree decides.
  - capture, cancel and reverse: the target Authorization already failed (a declined sale), or the target was
    already voided.
- **Otherwise**, the outcome follows the Braintree status of the resulting transaction.

## Braintree parent and child transactions

A partial capture creates a child transaction with its own id and changes the state of the parent (the
authorization). See Braintree's
[Submit for partial settlement](https://developer.paypal.com/braintree/docs/reference/request/transaction/submit-for-partial-settlement/node).
On commercetools, the Authorization transaction carries the parent's id and each Charge carries its child's id.

## Rules per operation

### Capture

- The first capture of an Authorization's full amount uses `submitForSettlement`. No child is created, so the
  Authorization keeps a single Braintree transaction.
- Any other capture uses `submitForPartialSettlement`, which creates a child.
- `submitForPartialSettlement` requires partial settlement to be enabled for your Braintree merchant account, see
  Braintree's
  [Submit for partial settlement](https://developer.paypal.com/braintree/docs/reference/request/transaction/submit-for-partial-settlement/node).
  Without it, Braintree refuses every capture except the first capture of an Authorization's full amount, and the
  answer is rejected. Contact Braintree to enable it, or capture the full authorized amount.
- The Payment Intents API requires an `amount` on every capture. A first capture of the Authorization's full amount
  is still sent to Braintree without an amount (`submitForSettlement`), so it works without partial settlement — the
  same as a `braintree-extension` capture request without an amount.
- Whether an Authorization was captured before is decided from the payment's transactions: a full capture's Charge
  carries the Authorization's id, while a partial capture's Charge carries its child's id, which can't be attributed
  to an Authorization. So once any Authorization of the payment was captured partially, every later capture uses
  `submitForPartialSettlement`. This only matters for a payment with several Authorizations (e.g. after a repeated
  sale on the same payment).
- Issues caused by modifying the payment outside the commercetools Checkout ecosystem can be solved in the Braintree
  control panel.

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

- The void is recorded as a new CancelAuthorization carrying the voided transaction's id, as in
  `braintree-extension`, also when a refund was voided.
- If the voided transaction has a Pending Charge or Refund on commercetools, it is moved to Failure, since no
  settlement webhook will ever arrive for it (a voided refund never reached the customer).

### Payment status fields

- `statusInterfaceCode` and `statusInterfaceText` hold the Braintree status of the last operation, the same as in
  `braintree-extension`. The state of each capture is in the payment's transactions.

## ACH micro-deposit verification

This flow applies only to ACH with micro-deposit verification (see Braintree's
[ACH verification](https://developer.paypal.com/braintree/docs/guides/ach/overview#verification)). Until verification
completes, Braintree has no transaction, only the vaulted bank account, and the payment carries a placeholder
Authorization instead.

- Cancel and reverse without a `merchantReference` write a cancel marker on commercetools (a CancelAuthorization
  carrying the placeholder's marker id). There's nothing to void on Braintree.
- If the marker can't be written, the answer is rejected.
- The processor's `transactionSale` refuses a payment carrying the marker, so the cancelled Order can't be charged
  once the micro-deposits are verified.
- Calling the operations that correspond to the commercetools Payment Intents cancel/reverse and capture at the same
  time is a merchant integration issue. On an unverified ACH payment the capture side is the post-verification
  `transactionSale`; a Payment Intents capture is rejected here, since there's no Braintree transaction to capture.
  The connector never triggers either call itself: both come from the merchant's integration, so preventing the
  overlap is the merchant's responsibility.
  - Each operation goes through when Braintree permits it, and Payment Intents answers approved when Braintree
    approves it. A cancel of the placeholder makes no Braintree call, so it's approved once the marker is written.
  - The conflict only shows after that approval. The connector logs it with `logger.error`, together with the
    commercetools payment id and, on the sale side, the Braintree transaction id, so the merchant can find the
    payment and resolve it manually.
  - The connector can't tell which call was triggered by mistake and which one was intended, so it doesn't undo
    either.
