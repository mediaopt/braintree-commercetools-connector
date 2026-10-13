import { useEffect, FC, PropsWithChildren } from "react";

import { usePayment } from "../../app/usePayment";
import { useNotifications } from "../../app/useNotifications";
import { useLoader } from "../../app/useLoader";

import { GeneralPayButtonProps } from "../../types";
import { reportSaleFailure } from "../../helpers/submitError";

export type CreditCardStoredProps = Pick<GeneralPayButtonProps, "onRegisterSubmit" | "onError"> & {
  id?: string;
};

export const CreditCardStored: FC<PropsWithChildren<CreditCardStoredProps>> = ({
  onRegisterSubmit,
  onError,
  id,
}) => {
  const { handleTransactionSale, paymentInfo } = usePayment();
  const { notify } = useNotifications();
  const { isLoading } = useLoader();

  useEffect(() => {
    onRegisterSubmit?.(async () => {
      // Only a guard: Checkout always has a stored method selected here (with even one available,
      // it is selected automatically), so submit() can't be reached without an id.
      if (!id) {
        notify("Error", "No stored payment method token provided");
        return;
      }
      isLoading(true);
      await reportSaleFailure(
        handleTransactionSale("", {
          paymentToken: id,
          lineItems: paymentInfo.braintreeLineItems,
        }),
        onError,
      );
      isLoading(false);
    });
  }, []);

  return null;
};
