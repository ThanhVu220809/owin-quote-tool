export interface SuggestionCandidate {
  value: string | null | undefined;
  usedCount?: number;
  source?: string;
  type?: string;
}

export interface RankedSuggestionCandidate {
  value: string;
  usedCount: number;
  score: number;
  source?: string;
  type?: string;
}

export function normalizeSuggestionText(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

export function tokenizeSuggestionText(value: unknown): string[] {
  return normalizeSuggestionText(value)
    .split(/[^a-z0-9]+/g)
    .filter(Boolean);
}

function acronymFor(value: string): string {
  return tokenizeSuggestionText(value)
    .map((word) => word[0])
    .join('');
}

export function scoreSuggestionCandidate(query: unknown, candidate: unknown, usedCount = 0): number {
  const normalizedCandidate = normalizeSuggestionText(candidate);
  if (!normalizedCandidate) return Number.NEGATIVE_INFINITY;

  const normalizedQuery = normalizeSuggestionText(query);
  const usageBoost = Number.isFinite(usedCount) ? Math.max(0, Math.min(usedCount, 10_000)) : 0;

  if (!normalizedQuery) return usageBoost;
  if (normalizedCandidate === normalizedQuery) return 1_000_000 + usageBoost;
  if (normalizedCandidate.startsWith(normalizedQuery)) return 800_000 + usageBoost;
  if (tokenizeSuggestionText(normalizedCandidate).some((token) => token.startsWith(normalizedQuery))) {
    return 700_000 + usageBoost;
  }
  if (normalizedCandidate.includes(normalizedQuery)) return 500_000 + usageBoost;
  if (acronymFor(normalizedCandidate).includes(normalizedQuery)) return 300_000 + usageBoost;

  return Number.NEGATIVE_INFINITY;
}

export function dedupeSuggestionCandidates(candidates: readonly SuggestionCandidate[]): RankedSuggestionCandidate[] {
  const byText = new Map<string, RankedSuggestionCandidate>();

  for (const candidate of candidates) {
    const value = String(candidate.value ?? '').trim();
    if (!value) continue;

    const key = normalizeSuggestionText(value);
    const usedCount = Number.isFinite(candidate.usedCount) ? Math.max(0, Number(candidate.usedCount)) : 0;
    const existing = byText.get(key);

    if (!existing || usedCount > existing.usedCount) {
      byText.set(key, {
        value,
        usedCount,
        score: 0,
        source: candidate.source,
        type: candidate.type,
      });
    }
  }

  return Array.from(byText.values());
}

export function rankSuggestionCandidates(
  query: unknown,
  candidates: readonly SuggestionCandidate[],
  limit = 20,
): RankedSuggestionCandidate[] {
  const ranked = dedupeSuggestionCandidates(candidates)
    .map((candidate) => ({
      ...candidate,
      score: scoreSuggestionCandidate(query, candidate.value, candidate.usedCount),
    }))
    .filter((candidate) => Number.isFinite(candidate.score))
    .sort((a, b) => b.score - a.score || b.usedCount - a.usedCount || a.value.localeCompare(b.value, 'vi'));

  return ranked.slice(0, Math.max(0, Math.floor(limit)));
}

export function rankSuggestionValues(query: unknown, values: readonly string[], limit = 20): string[] {
  const maxUsage = values.length;
  return rankSuggestionCandidates(
    query,
    values.map((value, index) => ({
      value,
      usedCount: maxUsage - index,
    })),
    limit,
  ).map((candidate) => candidate.value);
}
