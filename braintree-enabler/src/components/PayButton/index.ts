import { CartInformation } from "../../types";
export {
  PayButton,
  PAY_BUTTON_TEXT_FALLBACK,
  VAULT_BUTTON_TEXT_FALLBACK,
} from "./PayButton";

export type { PayButtonProps } from "./PayButton";

export const isPayButtonDisabled = (cartInformation: CartInformation) =>
  !cartInformation.account ||
  !cartInformation.billing ||
  !cartInformation.shipping;
