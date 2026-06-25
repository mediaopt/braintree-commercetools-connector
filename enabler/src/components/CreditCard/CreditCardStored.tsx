import { useEffect, useState, FC, PropsWithChildren, ChangeEvent, useRef } from "react";

import { usePayment } from "../../app/usePayment";
import { useNotifications } from "../../app/useNotifications";
import { useLoader } from "../../app/useLoader";

import { GeneralPayButtonProps } from "../../types";
import { HOSTED_FIELDS_LABEL } from "../../styles";

export type CreditCardStoredProps = Pick<
  GeneralPayButtonProps,
  "buttonText" | "fullWidth" | "useKount" | "onRegisterSubmit"
>;

export const CreditCardStored: FC<PropsWithChildren<CreditCardStoredProps>> = ({
  onRegisterSubmit,
}) => {
  const { handleTransactionSale, handleGetVaultedPaymentMethods, paymentInfo } = usePayment();
  const { notify } = useNotifications();
  const { isLoading } = useLoader();

  const [cards, setCards] = useState<
    { token: string; displayOptions: { endDigits?: string; brand?: { key: string }; expiryMonth?: number; expiryYear?: number } }[]
  >([]);

  const selectedTokenRef = useRef("");

  useEffect(() => {
    isLoading(true);
    handleGetVaultedPaymentMethods()
      .then((methods) => {
        setCards(
          methods
            .filter((m) => m.type === "CreditCard")
            .map(({ token, displayOptions }) => ({ token, displayOptions })),
        );
      })
      .finally(() => isLoading(false));

    onRegisterSubmit?.(async () => {
      if (!selectedTokenRef.current) {
        notify("Error", "Please select a card");
        return;
      }
      isLoading(true);
      await handleTransactionSale("", {
        paymentToken: selectedTokenRef.current,
        lineItems: paymentInfo.braintreeLineItems,
      });
      isLoading(false);
    });
  }, []);

  const changeCard = (e: ChangeEvent<HTMLInputElement>) => {
    selectedTokenRef.current = e.target.value;
  };

  return (
    <>
      {!!cards.length && (
        <div className="block w-full">
          {cards.map((card, index) => (
            <div
              key={index}
              className="flex gap-x-5 justify-start content-center border p-2 border-gray-300 rounded mt-4"
            >
              <input
                className="w-3 justify-self-center"
                id={`credit-card-${index}`}
                type="radio"
                name="select-credit-card"
                value={card.token}
                onChange={changeCard}
              />
              <label htmlFor={`credit-card-${index}`} className="cursor-pointer w-full">
                <span className={HOSTED_FIELDS_LABEL}>{card.displayOptions.brand?.key}</span>
                <span className={HOSTED_FIELDS_LABEL}>**** **** **** {card.displayOptions.endDigits}</span>
                <span className={HOSTED_FIELDS_LABEL}>
                  {card.displayOptions.expiryMonth} / {card.displayOptions.expiryYear}
                </span>
              </label>
            </div>
          ))}
        </div>
      )}
    </>
  );
};
