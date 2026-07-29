import { TypedMoney } from '@commercetools/platform-sdk';
import { mapCommercetoolsMoneyToBraintreeMoney } from 'common-connect/dist';

export const toNum = (money: TypedMoney | undefined): number =>
  money ? Number(mapCommercetoolsMoneyToBraintreeMoney(money)) : 0;
