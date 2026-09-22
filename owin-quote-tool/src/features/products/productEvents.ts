export const PRODUCTS_CHANGED_EVENT = 'owin-products-changed';

export function notifyProductsChanged(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(PRODUCTS_CHANGED_EVENT));
  }
}
