import { useEffect, FC, PropsWithChildren } from "react";

import { usePayment } from "../../app/usePayment";
import { useNotifications } from "../../app/useNotifications";
import { useLoader } from "../../app/useLoader";

import { GeneralPayButtonProps } from "../../types";

export type CreditCardStoredProps = Pick<GeneralPayButtonProps, "onRegisterSubmit"> & {
  id?: string;
};

export const CreditCardStored: FC<PropsWithChildren<CreditCardStoredProps>> = ({
  onRegisterSubmit,
  id,
}) => {
  const { handleTransactionSale, paymentInfo } = usePayment();
  const { notify } = useNotifications();
  const { isLoading } = useLoader();

  useEffect(() => {
    onRegisterSubmit?.(async () => {
      if (!id) {
        notify("Error", "No stored payment method token provided");
        return;
      }
      isLoading(true);
      await handleTransactionSale("", {
        paymentToken: id,
        lineItems: paymentInfo.braintreeLineItems,
      });
      isLoading(false);
    });
  }, []);

  return null;
};
