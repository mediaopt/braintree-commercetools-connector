import { useEffect } from "react";
import { usePayment } from "./usePayment";

export const useHandleInitPayment = (
  disabled: boolean,
  merchantAccountId?: string,
  shippingMethodId?: string,
  vaultPayment?: boolean,
) => {
  const { handleInitPayment } = usePayment();

  useEffect(() => {
    if (disabled) return;

    handleInitPayment(merchantAccountId, vaultPayment);
  }, [disabled, shippingMethodId]);
};
