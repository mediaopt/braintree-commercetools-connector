import { FC, PropsWithChildren } from "react";

import { NotificationsProvider } from "../../app/useNotifications";
import { PaymentProvider } from "../../app/usePayment";
import { LoaderProvider } from "../../app/useLoader";
import { RenderPurchase } from "../RenderPurchase";

import { GeneralComponentsProps } from "../../types";

export const RenderTemplate: FC<PropsWithChildren<GeneralComponentsProps>> = ({
  children,
  processorUrl,
  sessionId,
  purchaseCallback,
  cartInformation,
  taxAmount,
  shippingAmount,
  discountAmount,
  shippingMethodId,
}) => {
  return (
    <NotificationsProvider>
      <LoaderProvider>
        <PaymentProvider
          processorUrl={processorUrl}
          sessionId={sessionId}
          purchaseCallback={purchaseCallback}
          cartInformation={cartInformation}
          taxAmount={taxAmount}
          shippingAmount={shippingAmount}
          discountAmount={discountAmount}
          shippingMethodId={shippingMethodId}
        >
          <RenderPurchase>{children}</RenderPurchase>
        </PaymentProvider>
      </LoaderProvider>
    </NotificationsProvider>
  );
};
