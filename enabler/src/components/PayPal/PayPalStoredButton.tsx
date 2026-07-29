// PAYPAL_STORED_DISABLED: unreachable in this build. Reusing a saved PayPal account is out of
// scope for the commercetools Checkout SDK (it only supports storing/reusing credit cards) — see
// the disabled "PayPal" branch in payment-enabler-braintree.ts's createStoredPaymentMethodBuilder,
// and the commented "PayPalStored" case in RenderTemplate.tsx, for where this component would be
// wired back in. This component itself is untouched/working — kept for a possible future
// non-Checkout-SDK frontend. Please open an issue if you are interested in this payment method.

import { FC } from "react";

import { PayPalStored, PayPalStoredProps } from "./PayPalStored";
import { PAY_BUTTON_TEXT_FALLBACK } from "../PayButton";

export const PayPalStoredButton: FC<PayPalStoredProps> = ({
  fullWidth = true,
  buttonText,
  useKount,
  shipping,
  onRegisterSubmit,
}: PayPalStoredProps) => {
  return (
    <PayPalStored
      fullWidth={fullWidth}
      buttonText={buttonText ?? PAY_BUTTON_TEXT_FALLBACK}
      useKount={useKount}
      shipping={shipping}
      onRegisterSubmit={onRegisterSubmit}
    />
  );
};
