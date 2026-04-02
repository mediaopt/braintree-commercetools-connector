import { FC, PropsWithChildren } from "react";
import classNames from "classnames";
import { usePayment } from "../../app/usePayment";

import { GeneralPayButtonProps } from "../../types";

export const PAY_BUTTON_TEXT_FALLBACK = "Purchase";
export const VAULT_BUTTON_TEXT_FALLBACK = "Save for future use";

export const PayButton: FC<PropsWithChildren<GeneralPayButtonProps>> = ({
  fullWidth = true,
  buttonText = PAY_BUTTON_TEXT_FALLBACK,
}) => {
  const { handleInitPayment } = usePayment();

  //todo - rewrite button tests taking into account new error functionality
  return (
    <button
      className={classNames({
        "justify-center align-center rounded-md px-4 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 text-white bg-blue-500 hover:bg-blue-600  shadow-sm": true,
        "w-full": fullWidth,
      })}
      onClick={() => handleInitPayment()}
    >
      {buttonText}
    </button>
  );
};
