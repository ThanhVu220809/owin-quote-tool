import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ProductAccessoryRecord, ProductRecord } from '@/types/models';
import { ExtraAccessoriesEditor, FixedAccessoryPackageEditor } from '@/components/AccessoryEditors';
import {
  calculateFixedAccessoryDraftTotal,
  parseExtraAccessoriesJson,
  parseFixedAccessoriesJson,
  serializeExtraAccessoriesJson,
  serializeFixedAccessoriesJson,
} from '@/lib/quote/accessoryDrafts';
import { generateProductCode } from '@/features/products/productCode';
import { SerialTaskQueue } from '@/features/products/serialTaskQueue';
import {
  buildRawSizeText,
  calculateSampleQuantity,
  changedProductFields,
  errorMessage,
  formatSampleQuantity,
  newDraftId,
  normalizeSpecs,
  parseRawSizeText,
  type SaveProductInput,
  type SavedProduct,
  type SpecDraft,
} from '@/features/products/productDraft';
import { normalizeCategoryName } from '@/lib/products/categoryOrder';
import { unitLabel } from '@/features/products/productUnits';
import type { ProductSuggestions } from '@/features/products/productSuggestions';
import { ProductBasicsPanel, type ProductBasics } from '@/features/products/ProductBasicsPanel';
import { ProductSpecEditor } from '@/features/products/ProductSpecEditor';
import { ProductSummaryStrip } from '@/features/products/ProductSummaryStrip';
import { ProductFormHeader, type SaveStatus } from '@/features/products/ProductFormHeader';

export interface ProductFormSaveOptions {
  learnSuggestions?: boolean;
  baseRecord?: ProductRecord | null;
}

interface Props {
  editing: ProductRecord | null;
  suggestions: ProductSuggestions;
  onSave: (p: SaveProductInput, options?: ProductFormSaveOptions) => Promise<SavedProduct>;
  onCancel: () => void;
}

function initialBasics(editing: ProductRecord | null): ProductBasics {
  const size = parseRawSizeText(editing?.rawSizeText);
  return {
    name: editing?.name ?? '',
    category: editing?.category ?? 'Khác',
    unit: editing?.unit ?? 'M2',
    unitPriceVnd: editing?.unitPriceVnd ?? 0,
    widthM: size.width,
    heightM: size.height,
    coverImagePath: editing?.coverImagePath ?? null,
  };
}

/**
 * Form sản phẩm — lưu TAY (không auto-save).
 * Component này giữ state + gọi Supabase; phần hiển thị nằm ở các panel con,
 * công thức nằm ở productDraft.ts.
 */
export function ProductForm({ editing, suggestions, onSave, onCancel }: Props) {
  const [draftIdentity] = useState(() => ({
    id: editing?.id ?? newDraftId(),
    code: (editing?.code ?? generateProductCode(true)).toUpperCase(),
  }));
  const [basics, setBasics] = useState<ProductBasics>(() => initialBasics(editing));
  const [specs, setSpecs] = useState<SpecDraft[]>(() => normalizeSpecs(editing));
  const [accessories] = useState<ProductAccessoryRecord[]>(() =>
    editing?.accessories?.map((item) => ({ ...item })) ?? [],
  );
  const [fixedPackage, setFixedPackage] = useState(() =>
    parseFixedAccessoriesJson(editing?.fixedAccessoryPackage, 1),
  );
  const [extraAccessories, setExtraAccessories] = useState(() =>
    parseExtraAccessoriesJson(editing?.extraAccessories),
  );
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>(editing ? 'saved' : 'idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const saveQueueRef = useRef(new SerialTaskQueue());
  const mountedRef = useRef(true);
  const closingRef = useRef(false);
  const onSaveRef = useRef(onSave);
  const onCancelRef = useRef(onCancel);

  const canSave = basics.name.trim() !== '';
  const sampleQuantity = calculateSampleQuantity(basics.unit, basics.widthM, basics.heightM);
  const sampleProductTotal = Math.round(sampleQuantity * Number(basics.unitPriceVnd || 0));
  const fixedPackageTotal = calculateFixedAccessoryDraftTotal(fixedPackage);
  const extraAccessoriesTotal = extraAccessories.reduce((sum, item) => sum + item.amount, 0);
  const estimatedTotal = sampleProductTotal + fixedPackageTotal + extraAccessoriesTotal;

  const updateBasics = useCallback(
    (patch: Partial<ProductBasics>) => setBasics((current) => ({ ...current, ...patch })),
    [],
  );

  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  useEffect(() => {
    onCancelRef.current = onCancel;
  }, [onCancel]);

  const draftInput = useMemo<SaveProductInput>(() => {
    // Keep keys even when value is empty (e.g. Song Nhôm Bảo Vệ with no value).
    const cleanSpecs = specs
      .map((spec, sortOrder) => ({
        key: spec.key.trim(),
        value: spec.value.trim(),
        sortOrder,
      }))
      .filter((spec) => spec.key);
    const cleanAccessories = accessories
      .map((item, sortOrder) => ({
        name: item.name.trim(),
        quantityPerSet: Number(item.quantityPerSet || 0),
        unitPriceVnd: Number(item.unitPriceVnd || 0),
        note: item.note?.trim() || null,
        sortOrder,
      }))
      .filter((item) => item.name);

    return {
      id: draftIdentity.id,
      numericId: editing?.numericId,
      code: draftIdentity.code,
      name: basics.name.trim(),
      category: basics.category.trim() || 'Khác',
      unit: basics.unit,
      unitPriceVnd: Number(basics.unitPriceVnd || 0),
      shortDesc: editing?.shortDesc ?? null,
      // ImageDropzone already uploaded the bytes; only persist its CDN URL.
      coverImagePath: basics.coverImagePath,
      gallery: editing?.gallery ?? [],
      rawSizeText: buildRawSizeText(basics.widthM, basics.heightM) ?? editing?.rawSizeText ?? null,
      rawPriceText: editing?.rawPriceText ?? null,
      specs: cleanSpecs,
      accessories: cleanAccessories,
      fixedAccessoryPackage: serializeFixedAccessoriesJson(fixedPackage),
      extraAccessories: serializeExtraAccessoriesJson(extraAccessories) ?? '[]',
      isFeatured: editing?.isFeatured ?? false,
      isPublic: editing?.isPublic ?? true,
      sortOrder: editing?.sortOrder,
      folderPath: editing?.folderPath ?? null,
      createdAt: editing?.createdAt,
    };
  }, [accessories, basics, draftIdentity.code, draftIdentity.id, editing, extraAccessories, fixedPackage, specs]);

  const draftFingerprint = useMemo(() => JSON.stringify(draftInput), [draftInput]);
  const [lastSavedFingerprint, setLastSavedFingerprint] = useState(draftFingerprint);
  const lastSavedFingerprintRef = useRef(draftFingerprint);
  const acknowledgedBaseRef = useRef<ProductRecord | null>(editing);
  const acknowledgedDraftRef = useRef<SaveProductInput | null>(editing ? draftInput : null);
  const latestDraftRef = useRef({ input: draftInput, fingerprint: draftFingerprint });

  useEffect(() => {
    latestDraftRef.current = { input: draftInput, fingerprint: draftFingerprint };
  }, [draftFingerprint, draftInput]);

  const persistDraft = useCallback(async (
    input: SaveProductInput,
    fingerprint: string,
    learnSuggestions: boolean,
  ): Promise<boolean> => {
    try {
      const saved = await saveQueueRef.current.run(async () => {
        if (mountedRef.current) {
          setSaveStatus('saving');
          setSaveError(null);
        }
        const patch = changedProductFields(acknowledgedDraftRef.current, input);
        return onSaveRef.current(patch, {
          learnSuggestions,
          baseRecord: acknowledgedBaseRef.current,
        });
      });
      acknowledgedBaseRef.current = saved;
      acknowledgedDraftRef.current = input;
      lastSavedFingerprintRef.current = fingerprint;
      if (mountedRef.current) {
        setLastSavedFingerprint(fingerprint);
        setSaveStatus('saved');
      }
      return true;
    } catch (error) {
      if (mountedRef.current) {
        setSaveStatus('error');
        setSaveError(errorMessage(error));
      }
      return false;
    }
  }, []);

  const save = async () => {
    if (!canSave || saving) return;
    closingRef.current = true;
    setSaving(true);
    const latest = latestDraftRef.current;
    const ok = await persistDraft(latest.input, latest.fingerprint, true);
    closingRef.current = false;
    if (mountedRef.current) setSaving(false);
    if (ok) onCancelRef.current();
  };

  const requestClose = useCallback(async () => {
    if (closingRef.current) return;
    const latest = latestDraftRef.current;
    const dirty =
      Boolean(latest.input.name?.trim()) &&
      latest.fingerprint !== lastSavedFingerprintRef.current;
    if (dirty) {
      const leave = window.confirm('Có thay đổi chưa lưu. Thoát mà không lưu?');
      if (!leave) return;
    }
    onCancelRef.current();
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      const latest = latestDraftRef.current;
      if (!latest.input.name?.trim() || latest.fingerprint === lastSavedFingerprintRef.current) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, []);

  // Derive UI status — không auto-save.
  const displayedSaveStatus: SaveStatus = !canSave
    ? 'idle'
    : saveStatus === 'saving'
      ? 'saving'
      : saveStatus === 'error' && draftFingerprint !== lastSavedFingerprint
        ? 'error'
        : draftFingerprint === lastSavedFingerprint
          ? 'saved'
          : 'dirty';

  return (
    <>
      <ProductFormHeader
        editing={Boolean(editing)}
        code={draftIdentity.code}
        categoryLabel={normalizeCategoryName(basics.category)}
        status={displayedSaveStatus}
        error={saveError}
        saving={saving}
        canSave={canSave}
        onBack={() => void requestClose()}
        onSave={() => void save()}
      />

      <div className="card product-editor-card">
        <section className="product-section-block">
          <div className="product-section-label">Thông tin cơ bản</div>
          <ProductBasicsPanel value={basics} onChange={updateBasics} suggestions={suggestions} />
        </section>

        <div className="product-editor-section-grid">
          <ProductSpecEditor specs={specs} onChange={setSpecs} suggestions={suggestions} />

          <FixedAccessoryPackageEditor
            value={fixedPackage}
            onChange={setFixedPackage}
            rowDrag
            suggestions={{
              accessoryName: suggestions.accessoryName,
              packageName: suggestions.accessoryPackageName,
              packageCatalog: suggestions.packageCatalog,
              orphanAccessoryNames: suggestions.orphanAccessoryNames,
            }}
          />
        </div>

        <div className="product-editor-extra">
          <ExtraAccessoriesEditor
            value={extraAccessories}
            onChange={setExtraAccessories}
            suggestions={{ accessoryName: suggestions.extraAccessoryName ?? [] }}
            title="Phụ kiện phát sinh thêm"
            rowDrag
          />
        </div>

        <ProductSummaryStrip
          sampleProductTotal={sampleProductTotal}
          fixedPackageTotal={fixedPackageTotal}
          extraAccessoriesTotal={extraAccessoriesTotal}
          estimatedTotal={estimatedTotal}
          sampleQuantityLabel={`${formatSampleQuantity(sampleQuantity)} ${unitLabel(basics.unit).toLowerCase()}`}
        />
      </div>
    </>
  );
}
