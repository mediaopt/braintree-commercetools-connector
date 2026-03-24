import { FC } from "react";

import { NotificationsProvider } from "../../app/useNotifications";
import { PaymentProvider } from "../../app/usePayment";
import { LoaderProvider } from "../../app/useLoader";
import { RenderPurchase } from "../RenderPurchase";

import { GeneralComponentsProps } from "../../types";

export const RenderTemplate: FC<
  React.PropsWithChildren<GeneralComponentsProps>
> = ({
  children,
  getClientTokenUrl,
  createPaymentUrl,
  createPaymentForVault,
  purchaseUrl,
  vaultPaymentMethodUrl,
  purchaseCallback,
  cartInformation,
  taxAmount,
  shippingAmount,
  discountAmount,
  shippingMethodId,
  requestHeader,
}) => {
  return (
    <NotificationsProvider>
      <LoaderProvider>
        <PaymentProvider
          getClientTokenUrl={getClientTokenUrl}
          createPaymentUrl={createPaymentUrl}
          createPaymentForVault={createPaymentForVault}
          purchaseUrl={purchaseUrl}
          vaultPaymentMethodUrl={vaultPaymentMethodUrl}
          purchaseCallback={purchaseCallback}
          cartInformation={cartInformation}
          taxAmount={taxAmount}
          shippingAmount={shippingAmount}
          discountAmount={discountAmount}
          shippingMethodId={shippingMethodId}
          requestHeader={requestHeader}
        >
          <RenderPurchase>{children}</RenderPurchase>
        </PaymentProvider>
      </LoaderProvider>
    </NotificationsProvider>
  );
};
