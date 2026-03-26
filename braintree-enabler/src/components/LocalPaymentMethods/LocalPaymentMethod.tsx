import { FC } from "react";

import { RenderTemplate } from "../RenderTemplate";
import { isPayButtonDisabled } from "../PayButton";

import { LocalPaymentMethodButton } from "./LocalPaymentMethodButton";

import { GeneralComponentsProps, LocalPaymentMethodsType } from "../../types";

type LocalPaymentMethodType = GeneralComponentsProps & LocalPaymentMethodsType;

export const LocalPaymentMethod: FC<LocalPaymentMethodType> = ({
  processorUrl,
  purchaseCallback,
  cartInformation,
  paymentType,
  countryCode,
  currencyCode,
  fullWidth,
  merchantAccountId,
  fallbackUrl,
  fallbackButtonText,
  shippingAddressRequired,
  useKount,
  lineItems,
  shipping,
  taxAmount,
  shippingAmount,
  discountAmount,
  shippingMethodId,
  requestHeader,
}: LocalPaymentMethodType) => {
  return (
    <RenderTemplate
      processorUrl={processorUrl}
      requestHeader={requestHeader}
      purchaseCallback={purchaseCallback}
      cartInformation={cartInformation}
      taxAmount={taxAmount}
      shippingAmount={shippingAmount}
      discountAmount={discountAmount}
      shippingMethodId={shippingMethodId}
    >
      <LocalPaymentMethodButton
        processorUrl={processorUrl}
        paymentType={paymentType}
        countryCode={countryCode}
        currencyCode={currencyCode}
        disabled={isPayButtonDisabled(cartInformation)}
        fullWidth={fullWidth}
        merchantAccountId={merchantAccountId}
        fallbackUrl={fallbackUrl}
        fallbackButtonText={fallbackButtonText}
        shippingAddressRequired={shippingAddressRequired}
        useKount={useKount}
        lineItems={lineItems}
        shipping={shipping}
        shippingMethodId={shippingMethodId}
      />
    </RenderTemplate>
  );
};
