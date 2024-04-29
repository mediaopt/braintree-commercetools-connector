import { DeliveryItem, Order } from '@commercetools/platform-sdk';
import { LineItem } from '../types/index.types';

export function mapItems(order: Order, items: DeliveryItem[]): LineItem[] {
  return items
    .map((deliveryItem) => {
      const item = order.lineItems.find(
        (lineItem) => lineItem.id === deliveryItem.id
      );
      if (!item) {
        return undefined;
      }
      return {
        name: item.name[order.locale ?? Object.keys(item.name)[0]],
        quantity: deliveryItem.quantity,
        productCode: item.variant.sku,
        image_url: item.variant.images ? item.variant.images[0].url : undefined,
      } as LineItem;
    })
    .filter((item) => !!item) as LineItem[];
}
