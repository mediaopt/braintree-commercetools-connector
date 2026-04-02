import { useEffect } from "react";
import { usePayment } from "./usePayment";
import { useNotifications } from "./useNotifications";

export const useHandleInitPayment = (
  disabled: boolean,
  merchantAccountId?: string,
  vaultPayment?: boolean,
) => {
  const { handleInitPayment } = usePayment();
  const { notify } = useNotifications();

  useEffect(() => {
    if (disabled) {
      notify("Error", "Email and/or address is required");
      return;
    }

    handleInitPayment(merchantAccountId, vaultPayment);
  }, [disabled]);
};
