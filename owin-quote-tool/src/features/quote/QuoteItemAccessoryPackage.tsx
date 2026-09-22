import type { QuoteItemInput } from '@/types/models';
import { FixedAccessoryPackageEditor } from '@/components/AccessoryEditors';
import { mergeSuggestionLists } from '@/features/suggestions/suggestionStore';
import {
  computeAutoPackageQuantity,
  createEmptyFixedAccessoryDraft,
  normalizePackageQuantityPerUnit,
  parseFixedAccessoriesJson,
  serializeFixedAccessoriesJson,
  updateFixedAccessoryDraft,
} from '@/lib/quote/accessoryDrafts';
import { sumItemDimensionQuantity } from '@/features/quote/quoteItemOrder';
import type { AccessoryPackageTemplate } from '@/lib/quote/accessoryPackages';

/**
 * Bộ phụ kiện cố định của một hạng mục.
 * fixedDraft cố tình chạy lại MỌI lần render (không useMemo) để SL bộ PK bám kịp SL cửa.
 */
export function QuoteItemAccessoryPackage({
  item,
  suggestions,
  packageCatalog,
  orphanAccessoryNames,
  onUpdate,
}: {
  item: QuoteItemInput;
  suggestions: Record<string, string[]>;
  packageCatalog: AccessoryPackageTemplate[];
  orphanAccessoryNames: string[];
  onUpdate: (patch: Partial<QuoteItemInput>) => void;
}) {
  // SL bộ PK auto = perUnit × tổng SL cửa (manual giữ nguyên).
  const totalDoorSl = Math.max(1, sumItemDimensionQuantity(item) || 1);
  const fixedDraft = (() => {
    if (item.fixedAccessoryPackage == null || item.fixedAccessoryPackage === '') {
      return createEmptyFixedAccessoryDraft(totalDoorSl, 1);
    }
    const draft = parseFixedAccessoriesJson(item.fixedAccessoryPackage, totalDoorSl);
    const perUnit = normalizePackageQuantityPerUnit(draft.packageQuantityPerUnit, 1);
    if (draft.packageQuantityManual) return draft;
    const expected = computeAutoPackageQuantity(perUnit, totalDoorSl);
    if (draft.packageQuantity !== expected || draft.packageQuantityPerUnit !== perUnit) {
      return updateFixedAccessoryDraft(draft, {
        packageQuantity: expected,
        packageQuantityPerUnit: perUnit,
        packageQuantityManual: false,
      });
    }
    return draft;
  })();
  return (
  <FixedAccessoryPackageEditor
    value={fixedDraft}
    onChange={(draft) =>
      onUpdate({
        // keepEmpty: empty package name never disables the accessory editor.
        fixedAccessoryPackage: serializeFixedAccessoriesJson(draft, { keepEmpty: true }),
      })
    }
    suggestions={{
      accessoryName: mergeSuggestionLists(
        suggestions.fixed_accessory_item,
        suggestions.accessory_name,
      ),
      packageName: [
        ...(suggestions.accessory_package_name ?? []),
        ...packageCatalog.map((pkg) => pkg.name),
      ],
      packageCatalog,
      orphanAccessoryNames,
    }}
  />
  );
}
