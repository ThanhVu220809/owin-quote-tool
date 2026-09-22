import { mergeSuggestionLists, suggestionTypesForSpecKey } from '@/features/suggestions/suggestionStore';

/**
 * Pool gợi ý theo từng field của tab Báo giá (đối xứng với productSuggestions.ts).
 */

export const QUOTE_SUGGESTION_TYPES = [
  'customer_name',
  'customer_address',
  'item_name',
  'product_name',
  'category',
  'color',
  'frame',
  'jamb',
  'sash',
  'thickness',
  'glass',
  'molding',
  'protection_bar',
  'spec_value',
  'spec_value_color',
  'spec_value_frame',
  'spec_value_jamb',
  'spec_value_glass',
  'spec_value_molding',
  'spec_value_protection_bar',
  'spec_value_sash',
  'spec_value_thickness',
  'accessory_name',
  'fixed_accessory_item',
  'extra_accessory_name',
  'accessory_package_name',
] as const;

export function specValueSuggestionsForKey(key: string, suggestions: Record<string, string[]>): string[] {
  const types = suggestionTypesForSpecKey(key);
  const primary = types[0];
  if (primary === 'color' || primary === 'spec_value_color') {
    return mergeSuggestionLists(suggestions.color, suggestions.spec_value_color);
  }
  if (primary === 'protection_bar' || primary === 'spec_value_protection_bar') {
    return mergeSuggestionLists(suggestions.protection_bar, suggestions.spec_value_protection_bar);
  }
  if (primary === 'frame' || primary === 'spec_value_frame') {
    return mergeSuggestionLists(suggestions.frame, suggestions.spec_value_frame);
  }
  if (primary === 'jamb' || primary === 'spec_value_jamb') {
    return mergeSuggestionLists(suggestions.jamb, suggestions.spec_value_jamb);
  }
  if (primary === 'sash' || primary === 'spec_value_sash') {
    return mergeSuggestionLists(suggestions.sash, suggestions.spec_value_sash);
  }
  if (primary === 'thickness' || primary === 'spec_value_thickness') {
    return mergeSuggestionLists(suggestions.thickness, suggestions.spec_value_thickness);
  }
  if (primary === 'glass' || primary === 'spec_value_glass') {
    return mergeSuggestionLists(suggestions.glass, suggestions.spec_value_glass);
  }
  if (primary === 'molding' || primary === 'spec_value_molding') {
    return mergeSuggestionLists(suggestions.molding, suggestions.spec_value_molding);
  }
  // Unknown keys only: generic value pool — never mix category/product names.
  return suggestions.spec_value ?? [];
}
