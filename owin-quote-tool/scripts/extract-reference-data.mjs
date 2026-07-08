import { mkdir, readFile, readdir, copyFile, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const targetRoot = path.resolve(scriptDir, '..');
const referenceRoot = process.env.REFERENCE_ROOT || path.resolve(targetRoot, '..', '..', '..', 'Web');
const referenceStorage = path.join(referenceRoot, 'storage');
const targetPublic = path.join(targetRoot, 'public');
const importedAssetsRoot = path.join(targetPublic, 'imported-assets');
const importedDataRoot = path.join(targetRoot, 'src', 'data', 'imported');

function toPosix(value) {
  return value.replace(/\\/g, '/');
}

function cleanReferencePath(value) {
  const raw = String(value || '').trim().split(/[?#]/)[0];
  if (!raw) return '';
  return toPosix(raw)
    .replace(/^\/api\/images\/+/, '')
    .replace(/^api\/images\/+/, '')
    .replace(/^\/+/, '')
    .replace(/^storage\/+/, '');
}

async function pathExists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function walkFiles(dir, predicate, out = []) {
  if (!(await pathExists(dir))) return out;
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walkFiles(fullPath, predicate, out);
    } else if (!predicate || predicate(fullPath)) {
      out.push(fullPath);
    }
  }
  return out;
}

async function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

async function findReferenceAsset(rawPath) {
  const cleaned = cleanReferencePath(rawPath);
  if (!cleaned || /^(https?:|data:|blob:)/i.test(cleaned)) return null;
  if (cleaned.startsWith('owin-user-assets/')) {
    const publicPath = path.join(referenceRoot, 'public', cleaned);
    return (await pathExists(publicPath)) ? { source: publicPath, cleaned } : null;
  }

  const candidates = [
    path.join(referenceStorage, cleaned),
    path.join(referenceRoot, 'public', cleaned),
    path.join(referenceRoot, cleaned),
  ];
  for (const candidate of candidates) {
    if (await pathExists(candidate)) return { source: candidate, cleaned };
  }
  return null;
}

async function copyReferenceAsset(rawPath) {
  const found = await findReferenceAsset(rawPath);
  if (!found) {
    const cleaned = cleanReferencePath(rawPath);
    return cleaned.startsWith('owin-user-assets/') ? cleaned : null;
  }

  if (found.cleaned.startsWith('owin-user-assets/')) {
    return found.cleaned;
  }

  const destination = path.join(importedAssetsRoot, ...found.cleaned.split('/'));
  await mkdir(path.dirname(destination), { recursive: true });
  await copyFile(found.source, destination);
  return `imported-assets/${found.cleaned}`;
}

function safeText(value, fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback;
}

function normalizeUnit(value) {
  const unit = String(value || '').trim().toUpperCase();
  if (unit === 'BO' || unit === 'BỘ') return 'BO';
  if (unit === 'METER' || unit === 'MD') return 'METER';
  return 'M2';
}

function normalizeSpecs(specs) {
  return Array.isArray(specs)
    ? specs
        .map((spec, sortOrder) => ({
          key: safeText(spec?.key ?? spec?.label),
          value: safeText(spec?.value),
          sortOrder,
        }))
        .filter((spec) => spec.key && spec.value)
    : [];
}

function normalizeAccessories(accessories) {
  return Array.isArray(accessories)
    ? accessories
        .map((item, sortOrder) => ({
          name: safeText(item?.name),
          quantityPerSet: Number(item?.quantityPerSet ?? item?.quantity ?? 1) || 1,
          unitPriceVnd: Number(item?.unitPriceVnd ?? item?.unitPrice ?? 0) || 0,
          note: safeText(item?.note) || null,
          sortOrder,
        }))
        .filter((item) => item.name)
    : [];
}

function jsonStringOrNull(value) {
  if (!value) return null;
  if (typeof value === 'string') {
    try {
      JSON.parse(value);
      return value;
    } catch {
      return null;
    }
  }
  return JSON.stringify(value);
}

function loadSqliteProductsById() {
  try {
    const Database = require(path.join(referenceRoot, 'node_modules', 'better-sqlite3'));
    const dbPath = path.join(referenceRoot, 'dev.db');
    const db = new Database(dbPath, { readonly: true });
    const products = db.prepare('select * from Product order by numericId').all();
    const specs = db.prepare('select productId, key, value, sortOrder from ProductSpec order by productId, sortOrder').all();
    const accessories = db.prepare('select productId, name, quantityPerSet, unitPriceVnd, note, sortOrder from ProductAccessory order by productId, sortOrder').all();
    const images = db.prepare('select productId, path, alt, isCover, sortOrder from ProductImage order by productId, isCover desc, sortOrder').all();
    const byId = new Map();

    for (const product of products) {
      byId.set(product.id, {
        ...product,
        specs: specs
          .filter((row) => row.productId === product.id)
          .map((row) => ({ key: row.key, value: row.value, sortOrder: Number(row.sortOrder || 0) })),
        accessories: accessories
          .filter((row) => row.productId === product.id)
          .map((row) => ({
            name: row.name,
            quantityPerSet: Number(row.quantityPerSet ?? 1) || 1,
            unitPriceVnd: Number(row.unitPriceVnd ?? 0) || 0,
            note: row.note || null,
            sortOrder: Number(row.sortOrder || 0),
          })),
        images: images.filter((row) => row.productId === product.id),
      });
    }
    db.close();
    return byId;
  } catch (error) {
    console.warn(`SQLite enrichment skipped: ${error.message}`);
    return new Map();
  }
}

async function buildProducts() {
  const metaPaths = await walkFiles(
    path.join(referenceStorage, 'products'),
    (filePath) => path.basename(filePath) === 'meta.json',
  );
  const sqliteProducts = loadSqliteProductsById();
  const products = [];

  for (const metaPath of metaPaths.sort()) {
    const meta = await readJson(metaPath);
    if (!meta || !safeText(meta.name)) continue;
    const dbProduct = sqliteProducts.get(safeText(meta.id));
    const source = dbProduct ? { ...meta, ...dbProduct } : meta;
    const code = safeText(source.code ?? source.id);
    const dbCoverImage = Array.isArray(source.images)
      ? source.images.find((image) => image.isCover)?.path || source.images[0]?.path
      : null;
    const coverImagePath = await copyReferenceAsset(source.coverImagePath || dbCoverImage);
    const gallery = [];
    const gallerySources = [
      ...(Array.isArray(meta.gallery) ? meta.gallery : []),
      ...(Array.isArray(source.images) ? source.images.filter((image) => !image.isCover).map((image) => image.path) : []),
    ];
    if (Array.isArray(gallerySources)) {
      for (const imagePath of gallerySources) {
        const copied = await copyReferenceAsset(imagePath);
        if (copied) gallery.push(copied);
      }
    }

    products.push({
      id: safeText(source.id, code),
      numericId: Number(source.numericId ?? products.length + 1) || products.length + 1,
      code,
      name: safeText(source.name),
      slug: safeText(source.slug, code.toLowerCase()),
      category: safeText(source.category, 'Khác') || 'Khác',
      unit: normalizeUnit(source.unit),
      unitPriceVnd: Number(source.unitPriceVnd ?? 0) || 0,
      shortDesc: safeText(source.shortDesc) || null,
      coverImagePath,
      gallery: Array.from(new Set(gallery)),
      rawSizeText: safeText(source.rawSizeText) || null,
      rawPriceText: safeText(source.rawPriceText) || null,
      specs: normalizeSpecs(source.specs),
      accessories: normalizeAccessories(source.accessories),
      fixedAccessoryPackage: jsonStringOrNull(source.fixedAccessoryPackage),
      extraAccessories: jsonStringOrNull(source.extraAccessories) || '[]',
      isFeatured: Boolean(source.isFeatured),
      isPublic: source.isPublic !== false,
      folderPath: safeText(source.folderPath) || `products/${path.basename(path.dirname(metaPath))}`,
      createdAt: safeText(source.createdAt, safeText(source.updatedAt, new Date(0).toISOString())),
      updatedAt: safeText(source.updatedAt, safeText(source.createdAt, new Date(0).toISOString())),
      deletedAt: null,
    });
  }

  return products.sort((a, b) => (a.numericId || 0) - (b.numericId || 0) || a.code.localeCompare(b.code, 'vi'));
}

function normalizeDimension(line, fallbackUnit, fallbackUnitPrice) {
  const unit = normalizeUnit(line?.unit || fallbackUnit);
  const widthM = Number(line?.widthM ?? line?.width ?? 0) || 0;
  const heightM = Number(line?.heightM ?? line?.height ?? 0) || 0;
  const quantity = Number(line?.quantity ?? 1) || 1;
  const calculatedQty = Number(line?.calculatedQty ?? line?.volume ?? 0) || 0;
  const unitPriceVnd = Number(line?.unitPriceVnd ?? line?.unitPrice ?? fallbackUnitPrice ?? 0) || 0;
  const lineTotalVnd = Number(line?.lineTotalVnd ?? line?.total ?? calculatedQty * unitPriceVnd) || 0;
  return {
    unit,
    widthM,
    heightM,
    quantity,
    calculatedQty,
    unitPriceVnd,
    lineTotalVnd,
    description: safeText(line?.description) || null,
  };
}

function normalizeQuoteAccessory(accessory, sortOrder = 0) {
  return {
    enabled: accessory?.enabled !== false,
    isEnabled: accessory?.isEnabled !== false && accessory?.enabled !== false,
    name: safeText(accessory?.name),
    quantityPerSet: Number(accessory?.quantityPerSet ?? accessory?.quantity ?? 1) || 1,
    totalSet: Number(accessory?.totalSet ?? accessory?.totalQuantity ?? accessory?.quantityPerSet ?? 1) || 1,
    unitPriceVnd: Number(accessory?.unitPriceVnd ?? accessory?.unitPrice ?? 0) || 0,
    lineTotalVnd: Number(accessory?.lineTotalVnd ?? accessory?.total ?? 0) || 0,
    note: safeText(accessory?.note) || null,
    sortOrder,
  };
}

async function normalizeQuoteSnapshot(snapshot) {
  const items = [];
  for (const [index, item] of (Array.isArray(snapshot.items) ? snapshot.items : []).entries()) {
    const imagePath = await copyReferenceAsset(item.coverImagePath || item.image);
    const unit = normalizeUnit(item.unit);
    const unitPriceVnd = Number(item.unitPriceVnd ?? 0) || 0;
    const dimensions = (Array.isArray(item.dimensions) && item.dimensions.length > 0
      ? item.dimensions
      : item.sizeLines || []
    ).map((line) => normalizeDimension(line, unit, unitPriceVnd));
    const accessories = (Array.isArray(item.accessories) ? item.accessories : [])
      .map((accessory, accIndex) => normalizeQuoteAccessory(accessory, accIndex))
      .filter((accessory) => accessory.name);

    items.push({
      sourceType: item.productId ? 'PRODUCT' : safeText(item.sourceType, 'CUSTOM'),
      productId: item.productId || null,
      productCode: safeText(item.productCode ?? item.quoteItemCode, `HM-${String(index + 1).padStart(2, '0')}`),
      quoteItemCode: safeText(item.quoteItemCode ?? item.productCode, `HM-${String(index + 1).padStart(2, '0')}`),
      itemName: safeText(item.itemName ?? item.productName),
      productName: safeText(item.productName ?? item.itemName),
      productType: safeText(item.productType) || null,
      category: safeText(item.category ?? item.groupName) || null,
      groupName: safeText(item.groupName ?? item.category) || null,
      coverImagePath: imagePath,
      categoryImagePath: null,
      categoryImage: null,
      companyLogo: null,
      image: imagePath,
      unit,
      description: safeText(item.description) || null,
      unitPriceVnd,
      specs: normalizeSpecs(item.specs),
      dimensions,
      accessories,
      fixedAccessoryPackage: jsonStringOrNull(item.fixedAccessoryPackage),
      extraAccessories: jsonStringOrNull(item.extraAccessories),
      productSubtotalVnd: Number(item.productSubtotalVnd ?? item.mainTotal ?? 0) || 0,
      accessorySubtotalVnd: Number(item.accessorySubtotalVnd ?? item.accessoryTotal ?? 0) || 0,
      itemTotalVnd: Number(item.itemTotalVnd ?? item.itemTotal ?? 0) || 0,
      mainTotal: Number(item.mainTotal ?? item.productSubtotalVnd ?? 0) || 0,
      accessoryTotal: Number(item.accessoryTotal ?? item.accessorySubtotalVnd ?? 0) || 0,
      itemTotal: Number(item.itemTotal ?? item.itemTotalVnd ?? 0) || 0,
      sortOrder: Number(item.sortOrder ?? index + 1) || index + 1,
      numericId: item.numericId ?? null,
    });
  }

  return {
    ...snapshot,
    company: {
      ...(snapshot.company || {}),
      logo: cleanReferencePath(snapshot.company?.logo || 'owin-user-assets/logo/logo.webp') || 'owin-user-assets/logo/logo.webp',
    },
    customerId: snapshot.customerId || null,
    customerName: safeText(snapshot.customerName),
    customerPhone: safeText(snapshot.customerPhone),
    customerEmail: safeText(snapshot.customerEmail) || null,
    customerAddress: safeText(snapshot.customerAddress),
    quoteDate: safeText(snapshot.quoteDate) || safeText(snapshot.createdAt).slice(0, 10),
    depositVnd: Number(snapshot.depositVnd ?? snapshot.summary?.depositVnd ?? 0) || 0,
    items,
    summary: {
      subtotalProductVnd: Number(snapshot.summary?.subtotalProductVnd ?? 0) || 0,
      subtotalAccessoryVnd: Number(snapshot.summary?.subtotalAccessoryVnd ?? 0) || 0,
      totalVnd: Number(snapshot.summary?.totalVnd ?? 0) || 0,
      roundedTotalVnd: Number(snapshot.summary?.roundedTotalVnd ?? snapshot.summary?.totalVnd ?? 0) || 0,
      depositVnd: Number(snapshot.summary?.depositVnd ?? snapshot.depositVnd ?? 0) || 0,
      balanceVnd: Number(snapshot.summary?.balanceVnd ?? 0) || 0,
    },
  };
}

async function buildQuotes() {
  const snapshotPaths = await walkFiles(
    path.join(referenceStorage, 'quotes'),
    (filePath) => path.basename(filePath) === 'snapshot.json',
  );
  const quotes = [];
  for (const snapshotPath of snapshotPaths.sort()) {
    const snapshot = await normalizeQuoteSnapshot(await readJson(snapshotPath, {}));
    if (!safeText(snapshot.quoteCode)) continue;
    const quoteFolder = path.dirname(snapshotPath);
    const exportPaths = await walkFiles(path.join(quoteFolder, 'exports'));
    const exports = exportPaths.map((filePath, index) => {
      const ext = path.extname(filePath).replace('.', '').toLowerCase();
      return {
        id: `${snapshot.quoteCode}-export-${index + 1}`,
        type: ext === 'pdf' || ext === 'xlsx' ? ext : 'docx',
        fileName: path.basename(filePath),
        filePath: toPosix(path.relative(referenceStorage, filePath)),
        createdAt: safeText(snapshot.createdAt, new Date(0).toISOString()),
      };
    });
    const items = snapshot.items.map((item, index) => ({
      id: `${snapshot.quoteCode}-${item.quoteItemCode || item.productCode || index + 1}`,
      sourceType: item.sourceType === 'PRODUCT' ? 'PRODUCT' : 'CUSTOM',
      productId: item.productId || null,
      productCode: item.quoteItemCode || item.productCode,
      itemName: item.itemName,
      category: item.category || item.groupName || null,
      imagePath: item.image || item.coverImagePath || null,
      unit: item.unit,
      description: item.description || null,
      unitPriceVnd: item.unitPriceVnd,
      productSubtotalVnd: item.productSubtotalVnd,
      accessorySubtotalVnd: item.accessorySubtotalVnd,
      itemTotalVnd: item.itemTotalVnd,
      fixedAccessoryPackage: item.fixedAccessoryPackage || null,
      extraAccessories: item.extraAccessories || null,
      snapshotJson: JSON.stringify(item),
      dimensions: item.dimensions.map((line, sortOrder) => ({ ...line, sortOrder })),
      accessories: item.accessories.map((accessory, sortOrder) => ({
        name: accessory.name,
        quantityPerSet: accessory.quantityPerSet,
        totalSet: accessory.totalSet,
        unitPriceVnd: accessory.unitPriceVnd,
        lineTotalVnd: accessory.lineTotalVnd,
        note: accessory.note,
        sortOrder,
      })),
      sortOrder: index,
    }));
    quotes.push({
      id: snapshot.quoteCode,
      code: snapshot.quoteCode,
      customerId: snapshot.customerId || null,
      customerName: snapshot.customerName,
      customerPhone: snapshot.customerPhone,
      customerEmail: snapshot.customerEmail,
      customerAddress: snapshot.customerAddress,
      quoteDate: snapshot.quoteDate,
      depositVnd: snapshot.depositVnd,
      subtotalProductVnd: snapshot.summary.subtotalProductVnd,
      subtotalAccessoryVnd: snapshot.summary.subtotalAccessoryVnd,
      totalVnd: snapshot.summary.totalVnd,
      roundedTotalVnd: snapshot.summary.roundedTotalVnd,
      balanceVnd: snapshot.summary.balanceVnd,
      status: exports.some((item) => item.type === 'docx') ? 'EXPORTED' : 'SAVED',
      snapshot,
      snapshotJson: JSON.stringify(snapshot),
      items,
      exports,
      folderPath: toPosix(path.relative(referenceStorage, quoteFolder)),
      deletedAt: null,
      createdAt: safeText(snapshot.createdAt, new Date(0).toISOString()),
      updatedAt: safeText(snapshot.createdAt, new Date(0).toISOString()),
    });
  }
  return quotes.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function addSuggestion(map, type, value) {
  const text = safeText(value);
  if (!text) return;
  if (!map[type]) map[type] = new Set();
  map[type].add(text);
}

function collectProductSuggestions(map, product) {
  addSuggestion(map, 'category', product.category);
  addSuggestion(map, 'product_name', product.name);
  addSuggestion(map, 'unit', product.unit);
  product.specs.forEach((spec) => {
    addSuggestion(map, 'spec_label', spec.key);
    addSuggestion(map, 'spec_value', spec.value);
    const normalized = spec.key.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    if (normalized.includes('mau')) addSuggestion(map, 'spec_value_color', spec.value);
    if (normalized.includes('khung')) addSuggestion(map, 'spec_value_frame', spec.value);
    if (normalized.includes('canh')) addSuggestion(map, 'spec_value_sash', spec.value);
    if (normalized.includes('day')) addSuggestion(map, 'spec_value_thickness', spec.value);
    if (normalized.includes('kinh')) addSuggestion(map, 'spec_value_glass', spec.value);
    if (normalized.includes('phao')) addSuggestion(map, 'spec_value_molding', spec.value);
    if (normalized.includes('song') || normalized.includes('bao ve')) {
      addSuggestion(map, 'spec_value_protection_bar', spec.value);
    }
  });
  product.accessories.forEach((item) => addSuggestion(map, 'accessory_name', item.name));
  const fixed = jsonStringOrNull(product.fixedAccessoryPackage);
  if (fixed) {
    const parsed = JSON.parse(fixed);
    addSuggestion(map, 'accessory_package_name', parsed.name);
    if (Array.isArray(parsed.items)) parsed.items.forEach((item) => addSuggestion(map, 'accessory_name', item.name));
  }
  const extra = JSON.parse(product.extraAccessories || '[]');
  if (Array.isArray(extra)) extra.forEach((item) => addSuggestion(map, 'accessory_name', item.name));
}

function collectQuoteSuggestions(map, quote) {
  addSuggestion(map, 'customer_name', quote.customerName);
  addSuggestion(map, 'customer_address', quote.customerAddress);
  quote.snapshot.items.forEach((item) => {
    addSuggestion(map, 'item_name', item.itemName);
    addSuggestion(map, 'product_name', item.itemName);
    addSuggestion(map, 'category', item.category || item.groupName);
    item.specs.forEach((spec) => addSuggestion(map, 'spec_value', spec.value));
    item.accessories.forEach((accessory) => addSuggestion(map, 'accessory_name', accessory.name));
  });
}

async function buildSuggestions(products, quotes) {
  const map = {};
  const files = await walkFiles(
    path.join(referenceStorage, 'shared', 'suggestions'),
    (filePath) => filePath.endsWith('.json'),
  );
  for (const file of files) {
    const type = path.basename(file).replace(/\.json$/, '');
    const values = await readJson(file, []);
    if (Array.isArray(values)) values.forEach((value) => addSuggestion(map, type, value));
  }
  products.forEach((product) => collectProductSuggestions(map, product));
  quotes.forEach((quote) => collectQuoteSuggestions(map, quote));
  return Object.fromEntries(
    Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([type, values]) => [type, Array.from(values).sort((a, b) => a.localeCompare(b, 'vi'))]),
  );
}

async function main() {
  if (!(await pathExists(referenceRoot))) {
    throw new Error(`REFERENCE_ROOT does not exist: ${referenceRoot}`);
  }
  await mkdir(importedAssetsRoot, { recursive: true });
  await mkdir(importedDataRoot, { recursive: true });

  const products = await buildProducts();
  const quotes = await buildQuotes();
  const suggestions = await buildSuggestions(products, quotes);

  await writeFile(path.join(importedDataRoot, 'products.json'), `${JSON.stringify(products, null, 2)}\n`, 'utf8');
  await writeFile(path.join(importedDataRoot, 'quotes.json'), `${JSON.stringify(quotes, null, 2)}\n`, 'utf8');
  await writeFile(path.join(importedDataRoot, 'suggestions.json'), `${JSON.stringify(suggestions, null, 2)}\n`, 'utf8');

  console.log(`Extracted ${products.length} products, ${quotes.length} quotes, ${Object.keys(suggestions).length} suggestion groups.`);
  console.log(`Assets copied to ${path.relative(targetRoot, importedAssetsRoot)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
