import { FC } from "react";

import { usePayment } from "../../app/usePayment";

import { GooglePayMask } from "./GooglePayMask";
import { GeneralPayButtonProps, GooglePayTypes } from "../../types";

type GooglePayButtonProps = GooglePayTypes & GeneralPayButtonProps;

export const GooglePayButton: FC<GooglePayButtonProps> = ({
  fullWidth = true,
  googleMerchantId,
  environment,
  totalPriceStatus,
  buttonType,
  buttonTheme,
  billingAddressFormat,
  billingAddressRequired,
  phoneNumberRequired,
  acquirerCountryCode,
  lineItems,
  shipping,
}: GooglePayButtonProps) => {
  const { clientToken, handleInitPayment } = usePayment();
  handleInitPayment()

  return clientToken ? (
    <GooglePayMask
      environment={environment}
      totalPriceStatus={totalPriceStatus}
      googleMerchantId={googleMerchantId}
      buttonTheme={buttonTheme}
      buttonType={buttonType}
      billingAddressRequired={billingAddressRequired}
      billingAddressFormat={billingAddressFormat}
      phoneNumberRequired={phoneNumberRequired}
      acquirerCountryCode={acquirerCountryCode}
      fullWidth={fullWidth}
      lineItems={lineItems}
      shipping={shipping}
    />
  ) : (
    <></>
  );
};
