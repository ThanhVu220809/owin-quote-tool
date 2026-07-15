/**
 * One-shot: import Mrs Oanh + A Công Nguyên Word quotes into Supabase.
 * Run: node scripts/import-customer-quotes.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import PizZip from 'pizzip';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  try {
    const raw = readFileSync(join(__dirname, '../.env'), 'utf8');
    for (const line of raw.split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!m) continue;
      if (!process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
  } catch {
    // optional
  }
}

loadEnv();

const URL = process.env.VITE_SUPABASE_URL || 'https://axicqoptcnkwkdinleko.supabase.co';
const ANON = process.env.VITE_SUPABASE_ANON_KEY || '';
const EMAIL = process.env.OWIN_ADMIN_EMAIL || 'hoanganhowin@gmail.com';
const PASSWORD = process.env.OWIN_ADMIN_PASSWORD || 'hoanganhowin';

const FILES = [
  {
    path: '/home/thanhvu/chị oanh -kì anh pa9.docx',
    code: 'OWIN-BG-20260708-OANH',
  },
  {
    path: '/home/thanhvu/A Công Nguyên PA 4 (1).docx',
    code: 'OWIN-BG-20260708-NGUYEN',
  },
];

function unescapeXml(text) {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

function joinCellText(tcXml) {
  let txt = '';
  const tokens = tcXml.split(/(<w:br\s*\/>|<\/w:p>\s*<w:p[^>]*>)/);
  for (const token of tokens) {
    if (/^<w:br/.test(token) || /^<\/w:p>/.test(token)) {
      txt += '\n';
      continue;
    }
    const parts = token.match(/<w:t(?: [^>]*)?>([\s\S]*?)<\/w:t>/g) || [];
    for (const part of parts) {
      const inner = part.replace(/<w:t(?: [^>]*)?>/, '').replace(/<\/w:t>/, '');
      txt += unescapeXml(inner);
    }
  }
  return txt;
}

function parseDim(value) {
  let raw = String(value || '').trim();
  if (!raw) return null;
  // Meters: "2,4" or "2.950" — never treat "2.950" as thousands (that became 2950!).
  if (/^\d{1,3}(\.\d{3})+,\d+$/.test(raw)) raw = raw.replace(/\./g, '').replace(',', '.');
  else if (raw.includes(',') && !raw.includes('.')) raw = raw.replace(',', '.');
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  if (n > 50) return Math.round((n / 1000) * 10000) / 10000;
  return Math.round(n * 10000) / 10000;
}

function parseMoney(value) {
  const digits = String(value || '').replace(/[^\d]/g, '');
  return digits ? Number(digits) : 0;
}

function parseIntSafe(value) {
  const digits = String(value || '').replace(/[^\d]/g, '');
  return digits ? Number(digits) : 0;
}

function normalizeUnit(value, fallback = 'M2') {
  const lower = String(value || '').toLowerCase();
  if (lower.includes('bộ') || lower === 'bo') return 'BO';
  if (lower.includes('md') || lower.includes('mét dài')) return 'METER';
  if (lower.includes('m2') || lower.includes('m²') || lower === 'm²') return 'M2';
  return fallback;
}

function parsePackageDescription(desc) {
  const cleaned = desc.replace(/\r/g, '').trim();
  const colon = cleaned.indexOf(':');
  const packageName = (colon >= 0 ? cleaned.slice(0, colon) : cleaned).trim();
  const rest = colon >= 0 ? cleaned.slice(colon + 1) : '';
  const itemNames = rest
    .split(/\n|•|·|;|(?:\s[-–—]\s)/)
    .map((part) => part.replace(/^[-–—•\s]+/, '').trim())
    .filter(Boolean);
  return { packageName: packageName || 'Bộ phụ kiện đi kèm', itemNames };
}

function extractGrid(xml) {
  const rows = xml.match(/<w:tr\b[\s\S]*?<\/w:tr>/g) || [];
  return rows.map((row) => {
    const cells = row.match(/<w:tc\b[\s\S]*?<\/w:tc>/g) || [];
    return cells.map((cell) => joinCellText(cell).trim());
  });
}

function parseDocx(buffer) {
  const zip = new PizZip(buffer);
  const docEntry = zip.file('word/document.xml');
  if (!docEntry) throw new Error('missing document.xml');
  const xml = docEntry.asText();
  const grid = extractGrid(xml);

  let customerName = '';
  let address = '';
  let quoteDate = '';
  for (const row of grid.slice(0, 6)) {
    for (const cell of row) {
      const customerMatch = cell.match(/Tên khách hàng:\s*(.+)/i);
      if (customerMatch) customerName = customerMatch[1].split('\n')[0].trim();
      const addressMatch = cell.match(/Địa chỉ:\s*(.+)/i);
      if (addressMatch) address = addressMatch[1].split('\n')[0].trim();
      const dateMatch = cell.match(/ngày\s*(\d+).*?tháng\s*(\d+).*?năm\s*(\d+)/i);
      if (dateMatch) {
        let [, d, mo, y] = dateMatch;
        if (y.length === 2) y = `20${y}`;
        quoteDate = `${y.padStart(4, '0')}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
      }
    }
  }

  const headerIndex = grid.findIndex((row) => row.some((cell) => cell.includes('Mô tả')));
  const body = grid.slice(headerIndex >= 0 ? headerIndex + 1 : 1);
  const products = [];

  for (const row of body) {
    if (row.length < 8) continue;
    const stt = (row[0] || '').replace(/\s+/g, ' ').trim();
    const code = (row[1] || '').replace(/\s+/g, ' ').trim();
    const desc = (row[3] || '').trim();
    const unitRaw = (row[4] || '').trim();
    const widthM = parseDim(row[5]);
    const heightM = parseDim(row[6]);
    const qty = parseIntSafe(row[7]);
    const weight = parseDim(row[8]);
    const price = parseMoney(row[9]);

    if (/tổng|làm tròn|cọc|thanh toán/i.test(`${stt} ${code} ${desc}`)) continue;

    const isProduct = Boolean(stt && code && !/không có ảnh/i.test(code));
    const low = desc.toLowerCase();
    const isAcc = low.includes('bộ phụ kiện') || (low.includes('phụ kiện') && !low.startsWith('phào'));
    const isPhao = low.startsWith('phào');

    if (isProduct) {
      const name = desc.split('\n')[0].split(' - ')[0].trim() || code;
      const unit = normalizeUnit(unitRaw, 'M2');
      products.push({
        code,
        name,
        unit,
        unitPriceVnd: price,
        description: desc,
        dimensions:
          widthM || heightM
            ? [{ unit, widthM, heightM, quantity: qty || 1, unitPriceVnd: price }]
            : [],
        packageName: '',
        packageItems: [],
        packageQty: 1,
        packagePrice: 0,
        extras: [],
      });
      continue;
    }
    if (!products.length) continue;
    const current = products[products.length - 1];

    if (isAcc) {
      const { packageName, itemNames } = parsePackageDescription(desc);
      current.packageName = packageName;
      current.packageItems = itemNames.map((n) => ({ name: n, quantity: 0 }));
      current.packageQty = qty || 1;
      current.packagePrice = price;
      continue;
    }
    if (isPhao) {
      const quantity = qty || weight || 1;
      const amount = Math.round(price * quantity);
      current.extras.push({
        id: crypto.randomUUID(),
        name: desc.split('\n')[0].trim(),
        unit: normalizeUnit(unitRaw, 'BO'),
        quantity,
        weight: 0,
        unitPrice: price,
        amount,
        sortOrder: current.extras.length,
      });
      continue;
    }
    if (widthM || heightM) {
      current.dimensions.push({
        unit: normalizeUnit(unitRaw, current.unit),
        widthM,
        heightM,
        quantity: qty || 1,
        unitPriceVnd: price || current.unitPriceVnd,
      });
    }
  }

  return { customerName, address, quoteDate, products };
}

function calcDim(unit, widthM, heightM, quantity, unitPrice) {
  const q = Math.max(0, quantity || 0);
  const w = Number(widthM) || 0;
  const h = Number(heightM) || 0;
  let calculatedQty = q;
  if (unit === 'M2') calculatedQty = Math.round(w * h * q * 1000) / 1000;
  else if (unit === 'METER') calculatedQty = Math.round((w + h) * q * 1000) / 1000;
  const lineTotal = Math.round(calculatedQty * (unitPrice || 0));
  return { calculatedQty, lineTotal };
}

function buildQuote(parsed, code) {
  const now = new Date().toISOString();
  const items = parsed.products.map((p, index) => {
    const dims = (p.dimensions.length
      ? p.dimensions
      : [{ unit: p.unit, widthM: null, heightM: null, quantity: 1, unitPriceVnd: p.unitPriceVnd }]
    ).map((d, j) => {
      const { calculatedQty, lineTotal } = calcDim(
        d.unit || p.unit,
        d.widthM,
        d.heightM,
        d.quantity,
        d.unitPriceVnd ?? p.unitPriceVnd,
      );
      return {
        unit: d.unit || p.unit,
        widthM: d.widthM,
        heightM: d.heightM,
        quantity: d.quantity,
        unitPriceVnd: d.unitPriceVnd ?? p.unitPriceVnd,
        description: null,
        sortOrder: j,
        calculatedQty,
        lineTotalVnd: lineTotal,
      };
    });
    const productSub = dims.reduce((s, d) => s + d.lineTotalVnd, 0);
    const pkgQty = Math.max(1, p.packageQty || 1);
    const pkgPrice = p.packagePrice || 0;
    const pkgTotal = pkgQty * pkgPrice;
    const extraTotal = p.extras.reduce((s, e) => s + (e.amount || 0), 0);
    const accSub = pkgTotal + extraTotal;
    const fixed =
      p.packageName || p.packageItems.length || pkgPrice
        ? JSON.stringify({
            name: p.packageName || 'Bộ phụ kiện đi kèm',
            items: p.packageItems,
            packageQuantity: pkgQty,
            unit: 'BO',
            unitPrice: pkgPrice,
            unitPriceVnd: pkgPrice,
            total: pkgTotal,
            totalVnd: pkgTotal,
          })
        : null;

    return {
      sourceType: 'CUSTOM',
      productId: null,
      sourceProductId: null,
      productCode: p.code,
      quoteItemCode: p.code,
      itemName: p.name,
      productName: p.name,
      productType: null,
      category: null,
      groupName: null,
      coverImagePath: null,
      image: null,
      imageReference: null,
      imageOverridePath: null,
      unit: p.unit,
      description: p.description,
      unitPriceVnd: p.unitPriceVnd,
      specs: [],
      dimensions: dims,
      accessories: [],
      fixedAccessoryPackage: fixed,
      extraAccessories: p.extras.length ? JSON.stringify(p.extras) : null,
      productSubtotalVnd: productSub,
      accessorySubtotalVnd: accSub,
      accessoryTotal: accSub,
      itemTotalVnd: productSub + accSub,
      itemTotal: productSub + accSub,
      mainTotal: productSub,
      numericId: index + 1,
      sortOrder: index,
    };
  });

  const subProduct = items.reduce((s, i) => s + i.productSubtotalVnd, 0);
  const subAcc = items.reduce((s, i) => s + i.accessorySubtotalVnd, 0);
  const total = subProduct + subAcc;
  const rounded = Math.round(total / 1000) * 1000;
  const quoteDate = parsed.quoteDate || now.slice(0, 10);
  const id = crypto.randomUUID();

  const snapshot = {
    company: {
      name: 'HOÀNG ANH OWIN',
      phone: '0799040616',
      email: '',
      address: 'Tiên Điền – Nghi Xuân – Hà Tĩnh',
      logo: 'owin-user-assets/logo/logo.webp',
    },
    items,
    quoteCode: code,
    customerName: parsed.customerName,
    customerId: null,
    customerPhone: '',
    customerEmail: null,
    customerAddress: parsed.address,
    quoteDate,
    depositVnd: 0,
    createdAt: now,
    summary: {
      subtotalProductVnd: subProduct,
      subtotalAccessoryVnd: subAcc,
      totalVnd: total,
      roundedTotalVnd: rounded,
      depositVnd: 0,
      balanceVnd: rounded,
    },
  };

  return {
    id,
    code,
    customerId: null,
    customerName: parsed.customerName,
    customerPhone: '',
    customerEmail: null,
    customerAddress: parsed.address,
    quoteDate,
    depositVnd: 0,
    subtotalProductVnd: subProduct,
    subtotalAccessoryVnd: subAcc,
    totalVnd: total,
    roundedTotalVnd: rounded,
    balanceVnd: rounded,
    status: 'SAVED',
    snapshot,
    snapshotJson: JSON.stringify(snapshot),
    items: items.map((item, i) => ({
      id: `${code}-${item.productCode}-${i}`,
      productCode: item.productCode,
      productId: null,
      sourceProductId: null,
      sourceType: 'CUSTOM',
      itemName: item.itemName,
      category: null,
      unit: item.unit,
      unitPriceVnd: item.unitPriceVnd,
      description: item.description,
      dimensions: item.dimensions,
      accessories: [],
      extraAccessories: item.extraAccessories,
      fixedAccessoryPackage: item.fixedAccessoryPackage,
      imagePath: null,
      imageReference: null,
      imageOverridePath: null,
      productSubtotalVnd: item.productSubtotalVnd,
      accessorySubtotalVnd: item.accessorySubtotalVnd,
      itemTotalVnd: item.itemTotalVnd,
      sortOrder: i,
    })),
    exports: [],
    folderPath: null,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

function scoreMatch(productName, catalogName) {
  const a = productName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  const b = catalogName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  if (a === b) return 100;
  if (a.includes(b) || b.includes(a)) return 80;
  const tokens = a.split(/[^a-z0-9]+/).filter((t) => t.length > 2);
  let hit = 0;
  for (const t of tokens) if (b.includes(t)) hit += 1;
  return hit;
}

async function attachCatalogImages(supabase, quote) {
  const { data, error } = await supabase
    .from('products')
    .select('data')
    .is('deleted_at', null)
    .limit(500);
  if (error) throw new Error(error.message);
  const catalog = (data || []).map((row) => row.data).filter(Boolean);

  for (const item of quote.snapshot.items) {
    let best = null;
    let bestScore = 0;
    for (const product of catalog) {
      const s = scoreMatch(item.itemName || '', product.name || '');
      // Prefer same color keyword when present in description
      const desc = String(item.description || '').toLowerCase();
      const pname = String(product.name || '').toLowerCase();
      let bonus = 0;
      if (desc.includes('vân gỗ trắc') && pname.includes('trắc')) bonus += 5;
      if (desc.includes('vân gỗ lim') && pname.includes('lim')) bonus += 5;
      if (desc.includes('thủy lực') && pname.includes('thủy lực')) bonus += 8;
      if (desc.includes('lùa') && pname.includes('lùa')) bonus += 6;
      if (desc.includes('khuôn phào') && pname.includes('khuôn phào')) bonus += 4;
      const score = s + bonus;
      if (score > bestScore && product.coverImagePath) {
        bestScore = score;
        best = product;
      }
    }
    if (best && bestScore >= 10) {
      item.coverImagePath = best.coverImagePath;
      item.image = best.coverImagePath;
      item.imageReference = best.coverImagePath;
      item.productId = best.id;
      item.sourceProductId = best.id;
    }
  }
  quote.snapshotJson = JSON.stringify(quote.snapshot);
  return quote;
}

async function deleteByCode(supabase, code) {
  // Free unique code by renaming + soft-delete (code is UNIQUE even for deleted rows).
  const { data } = await supabase.from('quotes').select('id').eq('code', code);
  for (const row of data || []) {
    const retired = `OLD-${code}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    await supabase
      .from('quotes')
      .update({ code: retired, deleted_at: new Date().toISOString() })
      .eq('id', row.id);
  }
}

async function upsertQuote(supabase, quote) {
  await deleteByCode(supabase, quote.code);
  const proposed = { ...quote };
  delete proposed.revision;
  const { data: casData, error: casError } = await supabase.rpc('save_quote_cas', {
    proposed,
    expected_revision: null,
  });
  if (!casError && casData?.status === 'applied') {
    return casData;
  }
  if (casData?.status === 'conflict') {
    proposed.id = crypto.randomUUID();
    const retry = await supabase.rpc('save_quote_cas', {
      proposed,
      expected_revision: null,
    });
    if (!retry.error && retry.data?.status === 'applied') return retry.data;
  }
  const row = {
    id: proposed.id,
    code: quote.code,
    customer_name: quote.customerName,
    customer_phone: quote.customerPhone || null,
    quote_date: (quote.quoteDate || '').slice(0, 10) || null,
    status: quote.status,
    total_vnd: Math.round(quote.roundedTotalVnd || quote.totalVnd || 0),
    data: proposed,
    deleted_at: null,
  };
  const { error } = await supabase.from('quotes').upsert(row, { onConflict: 'id' });
  if (error) throw new Error(`CAS: ${casError?.message || casData?.status} | upsert: ${error.message}`);
  return { status: 'applied', id: proposed.id };
}

async function main() {
  const url = process.env.VITE_SUPABASE_URL || URL;
  const anon = process.env.VITE_SUPABASE_ANON_KEY || ANON;
  if (!anon) throw new Error('Missing VITE_SUPABASE_ANON_KEY');

  const supabase = createClient(url, anon);
  const { error: authError } = await supabase.auth.signInWithPassword({
    email: EMAIL,
    password: PASSWORD,
  });
  if (authError) throw new Error(`Login failed: ${authError.message}`);

  for (const file of FILES) {
    const buffer = readFileSync(file.path);
    const parsed = parseDocx(buffer);
    let quote = buildQuote(parsed, file.code);
    quote = await attachCatalogImages(supabase, quote);
    const result = await upsertQuote(supabase, quote);
    console.log(
      `OK ${file.code}: KH="${quote.customerName}" · ${quote.snapshot.items.length} hạng mục · tổng=${quote.roundedTotalVnd.toLocaleString('vi-VN')} · status=${result.status || 'ok'}`,
    );
    for (const item of quote.snapshot.items) {
      console.log(
        `  - ${item.productCode}: ${item.itemName} · ${item.dimensions.length} KT · PK=${item.fixedAccessoryPackage ? 'yes' : 'no'} · img=${item.coverImagePath ? 'yes' : 'no'} · ${item.itemTotalVnd.toLocaleString('vi-VN')}`,
      );
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
