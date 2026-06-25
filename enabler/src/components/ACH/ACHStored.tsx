import { useEffect, useState, FC, PropsWithChildren, ChangeEvent, useRef } from "react";

import { usePayment } from "../../app/usePayment";
import { useNotifications } from "../../app/useNotifications";
import { useLoader } from "../../app/useLoader";

import { GeneralPayButtonProps } from "../../types";
import { HOSTED_FIELDS_LABEL } from "../../styles";

export type ACHStoredProps = Pick<
  GeneralPayButtonProps,
  "buttonText" | "fullWidth" | "useKount" | "shipping" | "onRegisterSubmit"
>;

export const ACHStored: FC<PropsWithChildren<ACHStoredProps>> = ({
  shipping,
  onRegisterSubmit,
}) => {
  const { handleTransactionSale, handleGetVaultedPaymentMethods, paymentInfo } = usePayment();
  const { notify } = useNotifications();
  const { isLoading } = useLoader();

  const [accounts, setAccounts] = useState<
    { token: string; displayOptions: { endDigits?: string; brand?: { key: string } } }[]
  >([]);

  const selectedTokenRef = useRef("");

  useEffect(() => {
    isLoading(true);
    handleGetVaultedPaymentMethods()
      .then((methods) => {
        setAccounts(
          methods
            .filter((m) => m.type === "UsBankAccount")
            .map(({ token, displayOptions }) => ({ token, displayOptions })),
        );
      })
      .finally(() => isLoading(false));

    onRegisterSubmit?.(async () => {
      if (!selectedTokenRef.current) {
        notify("Error", "Please select an account");
        return;
      }
      isLoading(true);
      await handleTransactionSale("", {
        paymentToken: selectedTokenRef.current,
        lineItems: paymentInfo.braintreeLineItems,
        shipping,
      });
      isLoading(false);
    });
  }, []);

  const changeAccount = (e: ChangeEvent<HTMLInputElement>) => {
    selectedTokenRef.current = e.target.value;
  };

  return (
    <>
      {!!accounts.length && (
        <div className="block w-full">
          {accounts.map((account, index) => (
            <div
              key={index}
              className="flex gap-x-5 justify-start content-center border p-2 border-gray-300 rounded my-4"
            >
              <input
                className="w-3 justify-self-center"
                id={`ach-account-${index}`}
                type="radio"
                name="select-ach-account"
                value={account.token}
                onChange={changeAccount}
              />
              <label htmlFor={`ach-account-${index}`} className="cursor-pointer w-full">
                <span className={HOSTED_FIELDS_LABEL}>{account.displayOptions.brand?.key}</span>
                <span className={HOSTED_FIELDS_LABEL}>******{account.displayOptions.endDigits}</span>
              </label>
            </div>
          ))}
        </div>
      )}
    </>
  );
};
