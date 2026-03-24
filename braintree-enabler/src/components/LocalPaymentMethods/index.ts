import {
  LocalPaymentMethod as LocalBancontact,
  LocalPaymentMethod as LocalP24,
  LocalPaymentMethod as LocalBLIK,
  LocalPaymentMethod as LocalEPS,
  LocalPaymentMethod as LocalGiropay,
  LocalPaymentMethod as LocalGrabpay,
  LocalPaymentMethod as LocalIdeal,
  LocalPaymentMethod as LocalMyBank,
  LocalPaymentMethod as LocalSofort,
} from "./LocalPaymentMethod";
import {
  LocalPaymentBancontactType,
  LocalPaymentBLIKType,
  LocalPaymentEPSType,
  LocalPaymentGiropayType,
  LocalPaymentGrabpayType,
  LocalPaymentIDealType,
  LocalPaymentMyBankType,
  LocalPaymentP24Type,
  LocalPaymentSofortType,
} from "../../types";
export const Bancontact = LocalBancontact as LocalPaymentBancontactType;
export const P24 = LocalP24 as LocalPaymentP24Type;
export const Sofort = LocalSofort as LocalPaymentSofortType;
export const BLIK = LocalBLIK as LocalPaymentBLIKType;
export const EPS = LocalEPS as LocalPaymentEPSType;
export const Giropay = LocalGiropay as LocalPaymentGiropayType;
export const Grabpay = LocalGrabpay as LocalPaymentGrabpayType;
export const IDeal = LocalIdeal as LocalPaymentIDealType;
export const MyBank = LocalMyBank as LocalPaymentMyBankType;
