import { useEffect } from "react";
import { usePayment } from "./usePayment";

export const useHandleGetClientToken = (
  disabled: boolean,
  merchantAccountId?: string,
  shippingMethodId?: string,
  vaultPayment?: boolean
) => {
  const { handleGetClientToken } = usePayment();

  useEffect(() => {
    if (disabled) return;

    handleGetClientToken(merchantAccountId, vaultPayment);
  }, [disabled, shippingMethodId]);
};
