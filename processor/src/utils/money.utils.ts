import { TypedMoney } from '@commercetools/platform-sdk';
import { mapCommercetoolsMoneyToBraintreeMoney } from 'common-connect/dist';

export const toNum = (money: TypedMoney | undefined): number =>
  money ? Number(mapCommercetoolsMoneyToBraintreeMoney(money)) : 0;

export const toMoneyStr = (money: TypedMoney | undefined, fractionDigitsRef: TypedMoney): string =>
  mapCommercetoolsMoneyToBraintreeMoney(money ?? { ...fractionDigitsRef, centAmount: 0 });
