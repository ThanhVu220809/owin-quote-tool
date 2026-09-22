/**
 * One-shot migrate: persist catalogue order + re-order quote items.
 *
 * Products: category → color (Trắc→Lim→Ghi→Xanh) → catalogue total (SP+PK+extra) high→low
 *           → RPC set_product_order (sort_order + data.sortOrder)
 *
 * Quotes:   items + snapshot.items by max(line SP + PK share) high→low
 *           PK share = (line SL / total door SL) × package pool
 *           (sync fixed package SL = total door SL unless packageQuantityManual)
 *
 * Run:
 *   node scripts/migrate-sort-order.mjs
 *   OWIN_MIGRATE_DRY_RUN=1 node scripts/migrate-sort-order.mjs
 *   OWIN_MIGRATE_ONLY=products|quotes node scripts/migrate-sort-order.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  try {
    const raw = readFileSync(join(__dirname, '../.env'), 'utf8');
    for (const line of raw.split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!m) continue;
      if (!process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  } catch {
    // optional
  }
}

loadEnv();

const URL = process.env.VITE_SUPABASE_URL || '';
const ANON = process.env.VITE_SUPABASE_ANON_KEY || '';
const EMAIL = process.env.OWIN_ADMIN_EMAIL || 'hoanganhowin@gmail.com';
const PASSWORD = process.env.OWIN_ADMIN_PASSWORD || 'hoanganhowin';
const DRY = process.env.OWIN_MIGRATE_DRY_RUN === '1' || process.env.OWIN_MIGRATE_DRY_RUN === 'true';
const ONLY = String(process.env.OWIN_MIGRATE_ONLY || '')
  .trim()
  .toLowerCase();

const COLOR_ORDER = ['trac', 'lim', 'ghi', 'xanh'];
const CATEGORY_ORDER = ['Cửa Chính', 'Cửa Phụ', 'Cửa Sổ', 'Tủ', 'Phụ Kiện', 'Khác'];

function stripAccents(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

function titleCaseVi(value) {
  return String(value || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toLocaleUpperCase('vi') + w.slice(1).toLocaleLowerCase('vi'))
    .join(' ');
}

function normalizeCategoryName(value) {
  const raw = String(value || '').trim();
  if (!raw) return 'Khác';
  const lower = stripAccents(raw);
  if (lower === 'wc' || lower === 'toilet' || lower.includes('wc ')) return 'WC';
  if (lower.includes('noi that') || lower.includes('mat bep') || lower.includes('phu kien')) return 'Phụ Kiện';
  if (lower.includes('tu') || lower.includes('bep') || lower.includes('vach ngan')) return 'Tủ';
  if (lower.includes('chinh') || lower.includes('thuy luc')) return 'Cửa Chính';
  if (lower.includes('cua so')) return 'Cửa Sổ';
  if (lower.includes('phu')) return 'Cửa Phụ';
  return titleCaseVi(raw);
}

function categoryOrderIndex(category) {
  const index = CATEGORY_ORDER.indexOf(normalizeCategoryName(category));
  return index === -1 ? CATEGORY_ORDER.length : index;
}

function productColorRank(product) {
  const specs = product.specs || product.data?.specs || [];
  const colorSpec = specs.find((spec) => stripAccents(spec.key).includes('mau'));
  const color = stripAccents(colorSpec?.value || '');
  if (!color) return COLOR_ORDER.length + 1;
  const rank = COLOR_ORDER.findIndex((keyword) => color.includes(keyword));
  return rank === -1 ? COLOR_ORDER.length : rank;
}

function parseSizeToMeters(sizeText) {
  if (!sizeText) return { width: 0, height: 0 };
  const parts = String(sizeText).split(/\s*[xX*]\s*/);
  if (parts.length < 2) return { width: 0, height: 0 };
  const parseDim = (v) => {
    const m = String(v).trim().replace(',', '.').match(/\d+(?:\.\d+)?/);
    let n = m ? Number(m[0]) : 0;
    if (n > 10) n /= 1000;
    return n;
  };
  return { width: parseDim(parts[0]), height: parseDim(parts[1]) };
}

function catalogueLineWeight(unit, width, height, quantity = 1) {
  const u = String(unit || 'BO').toUpperCase();
  if (u === 'M2' || u === 'M²') return width > 0 && height > 0 ? width * height * quantity : quantity;
  if (u === 'METER' || u === 'MD' || u === 'M') return width + height > 0 ? (width + height) * quantity : quantity;
  return quantity;
}

/** Tổng tiền 1 SP = cửa (size×đơn giá) + bộ PK + legacy + extra — giống bảng giá. */
function productCatalogueTotalVnd(product) {
  const { width, height } = parseSizeToMeters(product.rawSizeText);
  const unitPrice = Number(product.unitPriceVnd || product.unit_price_vnd || 0);
  const weight = catalogueLineWeight(product.unit, width, height, 1);
  let total = Math.round(weight * unitPrice);

  const rawPkg = product.fixedAccessoryPackage;
  if (rawPkg) {
    try {
      const pkg = typeof rawPkg === 'string' ? JSON.parse(rawPkg) : rawPkg;
      if (pkg && typeof pkg === 'object') {
        const q = Number(pkg.packageQuantity ?? pkg.quantity ?? 1) || 1;
        const p = Number(pkg.unitPrice ?? pkg.unitPriceVnd ?? 0) || 0;
        const stored = Number(pkg.total ?? pkg.totalVnd ?? 0);
        total += stored > 0 ? Math.round(stored) : Math.round(q * p);
      }
    } catch {
      /* ignore */
    }
  } else if (Array.isArray(product.accessories)) {
    for (const acc of product.accessories) {
      const q = Number(acc.quantityPerSet ?? 1) || 1;
      const p = Number(acc.unitPriceVnd ?? 0) || 0;
      total += Math.round(q * p);
    }
  }

  if (product.extraAccessories) {
    try {
      const extras =
        typeof product.extraAccessories === 'string'
          ? JSON.parse(product.extraAccessories)
          : product.extraAccessories;
      if (Array.isArray(extras)) {
        for (const acc of extras) {
          if (!String(acc?.name || '').trim()) continue;
          const unit = String(acc.unit || 'BO').toUpperCase();
          const q = Number(acc.quantity ?? acc.quantityPerSet ?? 1) || 1;
          const w = Number(acc.weight ?? acc.kl ?? 0) || 0;
          const p = Number(acc.unitPrice ?? acc.unitPriceVnd ?? 0) || 0;
          const basis = unit === 'BO' || unit === 'BỘ' ? q : w > 0 ? w : q;
          total += Math.round(basis * p);
        }
      }
    } catch {
      /* ignore */
    }
  }
  return total;
}

function sortProductsForCatalog(products) {
  return [...products].sort((a, b) => {
    const byCategory = categoryOrderIndex(a.category) - categoryOrderIndex(b.category);
    if (byCategory !== 0) return byCategory;
    const byColor = productColorRank(a) - productColorRank(b);
    if (byColor !== 0) return byColor;
    const totalA = productCatalogueTotalVnd(a);
    const totalB = productCatalogueTotalVnd(b);
    if (totalA !== totalB) return totalB - totalA;
    const priceA = Number(a.unitPriceVnd || a.unit_price_vnd || 0);
    const priceB = Number(b.unitPriceVnd || b.unit_price_vnd || 0);
    if (priceA !== priceB) return priceB - priceA;
    const na = Number(a.numericId || 0);
    const nb = Number(b.numericId || 0);
    if (na !== nb) return na - nb;
    return String(a.name || a.code || '').localeCompare(String(b.name || b.code || ''), 'vi');
  });
}

function lineProductAmount(item, line) {
  const stored = Number(line.lineTotalVnd || 0);
  if (stored > 0) return stored;
  const unitPrice = Number(line.unitPriceVnd ?? item.unitPriceVnd ?? 0);
  const w = Number(line.widthM || 0);
  const h = Number(line.heightM || 0);
  const qty = Number(line.quantity || 0);
  const unit = String(line.unit || item.unit || 'M2').toUpperCase();
  let basis = qty;
  if (unit === 'M2' || unit === 'M²') basis = Math.max(0, w) * Math.max(0, h) * qty;
  else if (unit === 'METER' || unit === 'MD' || unit === 'M') basis = (Math.max(0, w) + Math.max(0, h)) * qty;
  return Math.round(basis * unitPrice);
}

/** Tiền bộ PK + extra (pool phân bổ theo SL dòng). */
function packagePoolVnd(item) {
  let pool = 0;
  const raw = item.fixedAccessoryPackage;
  if (raw != null && raw !== '') {
    try {
      const pkg = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (pkg && typeof pkg === 'object') {
        const qty = Math.max(0, Number(pkg.packageQuantity ?? pkg.quantity ?? 0));
        const unitPrice = Number(pkg.unitPrice ?? pkg.unitPriceVnd ?? 0);
        const stored = Number(pkg.total ?? pkg.totalVnd ?? 0);
        pool += stored > 0 ? Math.round(stored) : Math.round(qty * unitPrice);
      }
    } catch {
      /* ignore */
    }
  }
  if (item.extraAccessories) {
    try {
      const extras = typeof item.extraAccessories === 'string'
        ? JSON.parse(item.extraAccessories)
        : item.extraAccessories;
      if (Array.isArray(extras)) {
        for (const acc of extras) {
          if (!String(acc?.name || '').trim()) continue;
          const amount = Number(acc.amount ?? acc.total ?? 0);
          if (amount > 0) {
            pool += Math.round(amount);
            continue;
          }
          const q = Number(acc.quantity || 0);
          const w = Number(acc.weight ?? acc.kl ?? 0);
          const p = Number(acc.unitPriceVnd ?? acc.unitPrice ?? 0);
          const unit = String(acc.unit || 'BO').toUpperCase();
          const basis = unit === 'BO' || unit === 'BỘ' ? q : w > 0 ? w : q;
          pool += Math.round(basis * p);
        }
      }
    } catch {
      /* ignore */
    }
  }
  // Legacy accessories if no package path
  if (pool === 0 && Array.isArray(item.accessories) && item.accessories.length > 0) {
    const totalSl = sumDoorQuantity(item);
    for (const acc of item.accessories) {
      if (acc.isEnabled === false || acc.enabled === false) continue;
      const per = Number(acc.quantityPerSet || 0);
      const price = Number(acc.unitPriceVnd || acc.donGia || 0);
      pool += Math.round(per * totalSl * price);
    }
  }
  return pool;
}

/**
 * Điểm xếp = max(tiền dòng SP + PK phân bổ dòng)
 * PK dòng = (SL_dòng / tổng SL_SP) × tiền_PK_tổng
 */
function rankingAmountForQuoteItem(item) {
  const dims = item.dimensions || [];
  const totalSl = sumDoorQuantity(item);
  const pool = packagePoolVnd(item);
  if (dims.length === 0) {
    return pool + Math.max(0, Number(item.productSubtotalVnd ?? item.mainTotal ?? 0));
  }
  let max = 0;
  for (const line of dims) {
    const lineProduct = lineProductAmount(item, line);
    const lineSl = Math.max(0, Number(line.quantity || 0));
    const linePk = totalSl > 0 ? Math.round((lineSl / totalSl) * pool) : pool;
    const combined = lineProduct + linePk;
    if (combined > max) max = combined;
  }
  return max;
}

function sortQuoteItemsByMaxLineAmount(items) {
  return items
    .map((item, index) => ({ item, index, amount: rankingAmountForQuoteItem(item) }))
    .sort((a, b) => b.amount - a.amount || a.index - b.index)
    .map((entry) => entry.item);
}

function sumDoorQuantity(item) {
  return (item.dimensions || []).reduce((sum, line) => sum + Math.max(0, Number(line.quantity || 0)), 0);
}

function syncFixedPackageOnItem(item) {
  const raw = item.fixedAccessoryPackage;
  if (raw == null || raw === '') return item;
  let pkg;
  try {
    pkg = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return item;
  }
  if (!pkg || typeof pkg !== 'object') return item;
  if (pkg.packageQuantityManual) return item;
  const totalSl = Math.max(1, Math.round(sumDoorQuantity(item)) || 1);
  const unitPrice = Number(pkg.unitPrice ?? pkg.unitPriceVnd ?? 0);
  const next = {
    ...pkg,
    packageQuantity: totalSl,
    quantity: totalSl,
    unitPrice,
    unitPriceVnd: unitPrice,
    total: totalSl * unitPrice,
    totalVnd: totalSl * unitPrice,
  };
  delete next.packageQuantityManual;
  return { ...item, fixedAccessoryPackage: JSON.stringify(next) };
}

function itemsOrderSignature(items) {
  return (items || []).map((it) => it.id || it.productCode || it.quoteItemCode || it.itemName).join('|');
}

async function fetchAllProducts(supabase) {
  const pageSize = 1000;
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('products')
      .select('id,code,name,category,unit_price_vnd,sort_order,data,revision,deleted_at')
      .is('deleted_at', null)
      .order('sort_order', { ascending: true, nullsFirst: false })
      .order('code', { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`products: ${error.message}`);
    rows.push(...(data || []));
    if ((data?.length || 0) < pageSize) break;
  }
  return rows.map((row) => {
    const data = row.data || {};
    return {
      id: row.id,
      code: row.code || data.code,
      name: row.name || data.name,
      category: row.category || data.category,
      unit: data.unit || row.unit || 'BO',
      unitPriceVnd: row.unit_price_vnd ?? data.unitPriceVnd ?? 0,
      rawSizeText: data.rawSizeText ?? row.size_text ?? null,
      fixedAccessoryPackage: data.fixedAccessoryPackage ?? null,
      extraAccessories: data.extraAccessories ?? null,
      accessories: data.accessories || [],
      numericId: data.numericId,
      specs: data.specs || [],
      sortOrder: row.sort_order ?? data.sortOrder,
      revision: row.revision,
    };
  });
}

async function fetchAllQuotes(supabase) {
  const pageSize = 1000;
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('quotes')
      .select('id,code,data,revision,deleted_at')
      .is('deleted_at', null)
      .order('quote_date', { ascending: false, nullsFirst: false })
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`quotes: ${error.message}`);
    rows.push(...(data || []));
    if ((data?.length || 0) < pageSize) break;
  }
  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    revision: row.revision,
    data: row.data,
  }));
}

async function migrateProducts(supabase) {
  const products = await fetchAllProducts(supabase);
  const sorted = sortProductsForCatalog(products);
  const orderedIds = sorted.map((p) => p.id);

  let changed = 0;
  for (let i = 0; i < sorted.length; i += 1) {
    if (Number(products.find((p) => p.id === sorted[i].id)?.sortOrder) !== i) changed += 1;
  }

  console.log(`\n[products] active=${products.length} · need sort_order rewrite≈${changed}`);
  console.log('[products] preview (first 12):');
  for (const p of sorted.slice(0, 12)) {
    const color =
      (p.specs || []).find((s) => stripAccents(s.key).includes('mau'))?.value || '—';
    const total = productCatalogueTotalVnd(p);
    console.log(
      `  ${String(p.sortOrder ?? '·').padStart(3)}→ ${normalizeCategoryName(p.category).padEnd(12)} | ${String(color).padEnd(16)} | Σ${total.toLocaleString('vi-VN').padStart(12)} | ${p.code} ${p.name}`,
    );
  }

  if (DRY) {
    console.log('[products] DRY RUN — skip set_product_order');
    return { total: products.length, changed };
  }

  const { error } = await supabase.rpc('set_product_order', { ordered_ids: orderedIds });
  if (error) throw new Error(`set_product_order: ${error.message}`);
  console.log('[products] set_product_order OK');
  return { total: products.length, changed };
}

function migrateQuoteDocument(quoteData) {
  const data = structuredClone(quoteData);
  const now = new Date().toISOString();

  const reindex = (list) =>
    sortQuoteItemsByMaxLineAmount(list.map(syncFixedPackageOnItem)).map((item, index) => ({
      ...item,
      sortOrder: index,
    }));

  let touched = false;

  if (Array.isArray(data.items) && data.items.length > 0) {
    const before = itemsOrderSignature(data.items);
    data.items = reindex(data.items);
    if (itemsOrderSignature(data.items) !== before) touched = true;
    // Detect package-only changes
    else {
      const beforePkg = JSON.stringify(quoteData.items.map((i) => i.fixedAccessoryPackage));
      const afterPkg = JSON.stringify(data.items.map((i) => i.fixedAccessoryPackage));
      if (beforePkg !== afterPkg) touched = true;
    }
  }

  if (data.snapshot && Array.isArray(data.snapshot.items) && data.snapshot.items.length > 0) {
    const before = itemsOrderSignature(data.snapshot.items);
    data.snapshot = {
      ...data.snapshot,
      items: reindex(data.snapshot.items),
    };
    if (itemsOrderSignature(data.snapshot.items) !== before) touched = true;
    else {
      const beforePkg = JSON.stringify(quoteData.snapshot.items.map((i) => i.fixedAccessoryPackage));
      const afterPkg = JSON.stringify(data.snapshot.items.map((i) => i.fixedAccessoryPackage));
      if (beforePkg !== afterPkg) touched = true;
    }
  }

  if (typeof data.snapshotJson === 'string' && data.snapshot) {
    data.snapshotJson = JSON.stringify(data.snapshot);
  }

  if (touched) data.updatedAt = now;
  return { data, touched };
}

async function migrateQuotes(supabase) {
  const quotes = await fetchAllQuotes(supabase);
  console.log(`\n[quotes] active=${quotes.length}`);

  let updated = 0;
  let skipped = 0;

  for (const row of quotes) {
    const { data, touched } = migrateQuoteDocument(row.data || {});
    if (!touched) {
      skipped += 1;
      continue;
    }
    updated += 1;
    const codes = (data.snapshot?.items || data.items || [])
      .slice(0, 5)
      .map((i) => i.productCode || i.quoteItemCode || i.itemName)
      .join(', ');
    console.log(`  ${row.code || row.id}: reordered → [${codes}${(data.items || []).length > 5 ? ', …' : ''}]`);

    if (DRY) continue;

    // Prefer CAS; fall back to upsert if RPC missing/conflict storm.
    const proposed = { ...data, id: row.id, revision: row.revision };
    delete proposed.revision;

    const { data: casData, error: casError } = await supabase.rpc('save_quote_cas', {
      proposed,
      expected_revision: row.revision ?? null,
    });

    if (!casError && casData?.status === 'applied') continue;

    if (!casError && casData?.status === 'conflict') {
      // Retry once with latest revision if provided
      const latestRev = casData.revision ?? (casData.data && casData.data.revision);
      if (latestRev != null) {
        const { data: cas2, error: cas2Err } = await supabase.rpc('save_quote_cas', {
          proposed: { ...proposed, updatedAt: new Date().toISOString() },
          expected_revision: latestRev,
        });
        if (!cas2Err && cas2?.status === 'applied') continue;
      }
    }

    // Upsert fallback (authenticated full access)
    const upsertRow = {
      id: row.id,
      code: data.code ?? row.code ?? null,
      customer_name: data.customerName ?? null,
      customer_phone: data.customerPhone ?? null,
      quote_date: (data.quoteDate || data.createdAt || '').toString().slice(0, 10) || null,
      status: data.status ?? null,
      total_vnd: Math.round(Number(data.roundedTotalVnd ?? data.totalVnd ?? 0)),
      data: proposed,
      deleted_at: null,
    };
    const { error: upErr } = await supabase.from('quotes').upsert(upsertRow, { onConflict: 'id' });
    if (upErr) {
      console.error(`  ! ${row.code}: ${casError?.message || casData?.status} / upsert ${upErr.message}`);
      throw new Error(`quote ${row.code}: ${upErr.message}`);
    }
  }

  if (DRY) console.log('[quotes] DRY RUN — no writes');
  console.log(`[quotes] updated=${updated} · unchanged=${skipped}`);
  return { total: quotes.length, updated, skipped };
}

async function main() {
  if (!URL || !ANON) throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY');
  console.log(`Migrate sort order · dry=${DRY} · only=${ONLY || 'all'} · ${URL}`);

  const supabase = createClient(URL, ANON);
  const { error: authError } = await supabase.auth.signInWithPassword({
    email: EMAIL,
    password: PASSWORD,
  });
  if (authError) throw new Error(`Login failed: ${authError.message}`);
  console.log(`Logged in as ${EMAIL}`);

  const doProducts = !ONLY || ONLY === 'products';
  const doQuotes = !ONLY || ONLY === 'quotes';

  if (doProducts) await migrateProducts(supabase);
  if (doQuotes) await migrateQuotes(supabase);

  console.log('\nDone.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
