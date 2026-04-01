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
}) => {
  return (
    <NotificationsProvider>
      <LoaderProvider>
        <PaymentProvider
          processorUrl={processorUrl}
          sessionId={sessionId}
          purchaseCallback={purchaseCallback}
        >
          <RenderPurchase>{children}</RenderPurchase>
        </PaymentProvider>
      </LoaderProvider>
    </NotificationsProvider>
  );
};
