import { useEffect, useState, FC, PropsWithChildren, ChangeEvent, useRef } from "react";

import { usePayment } from "../../app/usePayment";
import { useNotifications } from "../../app/useNotifications";
import { useLoader } from "../../app/useLoader";

import { GeneralPayButtonProps } from "../../types";
import { HOSTED_FIELDS_LABEL } from "../../styles";

export type PayPalStoredProps = Pick<
  GeneralPayButtonProps,
  "buttonText" | "fullWidth" | "useKount" | "shipping" | "onRegisterSubmit"
>;

export const PayPalStored: FC<PropsWithChildren<PayPalStoredProps>> = ({
  shipping,
  onRegisterSubmit,
}) => {
  const { handleTransactionSale, handleGetVaultedPaymentMethods, paymentInfo } = usePayment();
  const { notify } = useNotifications();
  const { isLoading } = useLoader();

  const [accounts, setAccounts] = useState<{ token: string; displayOptions: { email?: string } }[]>([]);
  const selectedAccountRef = useRef("");

  useEffect(() => {
    isLoading(true);
    handleGetVaultedPaymentMethods()
      .then((methods) => {
        setAccounts(
          methods
            .filter((m) => m.type === "PayPal")
            .map(({ token, displayOptions }) => ({ token, displayOptions })),
        );
      })
      .finally(() => isLoading(false));

    onRegisterSubmit?.(async () => {
      if (!selectedAccountRef.current) {
        notify("Error", "Please select an account");
        return;
      }
      isLoading(true);
      await handleTransactionSale("", {
        paymentToken: selectedAccountRef.current,
        lineItems: paymentInfo.braintreeLineItems,
        shipping,
      });
      isLoading(false);
    });
  }, []);

  const changeAccount = (e: ChangeEvent<HTMLInputElement>) => {
    selectedAccountRef.current = e.target.value;
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
                id={`paypal-account-${index}`}
                type="radio"
                name="select-paypal-account"
                value={account.token}
                onChange={changeAccount}
              />
              <label htmlFor={`paypal-account-${index}`} className="cursor-pointer w-full">
                <span className={HOSTED_FIELDS_LABEL}>{account.displayOptions.email}</span>
              </label>
            </div>
          ))}
        </div>
      )}
    </>
  );
};
