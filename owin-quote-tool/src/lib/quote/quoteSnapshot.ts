import type { CalculatedQuote, CalculatedQuoteItem, QuoteSnapshotData } from '@/types/models';

const COMPANY_DEFAULT = {
  name: 'HOÀNG ANH OWIN',
  phone: '0799040616',
  email: '',
  address: 'Tiên Điền – Nghi Xuân – Hà Tĩnh',
  logo: 'owin-user-assets/logo/logo.webp',
};

function addStructuredAliases(item: CalculatedQuoteItem): CalculatedQuoteItem {
  return {
    ...item,
    quoteItemCode: item.quoteItemCode || item.productCode,
    productName: item.productName || item.itemName,
    groupName: item.groupName || item.category || '',
    productType: item.productType || '',
    image: item.image || item.coverImagePath || null,
    coverImagePath: item.coverImagePath || item.image || null,
    categoryImagePath: item.categoryImagePath || item.categoryImage || null,
    categoryImage: item.categoryImage || item.categoryImagePath || null,
    companyLogo: item.companyLogo || null,
    numericId: item.numericId || null,
    mainTotal: item.productSubtotalVnd,
    accessoryTotal: item.accessorySubtotalVnd,
    itemTotal: item.itemTotalVnd,
  };
}

export function generateSnapshot(
  quote: CalculatedQuote,
  quoteCode: string,
  createdAt: Date = new Date(),
): QuoteSnapshotData {
  return {
    quoteCode,
    createdAt: createdAt.toISOString(),
    company: COMPANY_DEFAULT,
    customerId: quote.customerId || null,
    customerName: quote.customerName,
    customerPhone: quote.customerPhone,
    customerEmail: quote.customerEmail || null,
    customerAddress: quote.customerAddress,
    quoteDate: quote.quoteDate || createdAt.toISOString(),
    depositVnd: quote.depositVnd,
    items: quote.items.map(addStructuredAliases),
    summary: quote.summary,
  };
}
