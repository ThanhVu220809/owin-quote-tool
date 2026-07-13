import type { SuggestionRecord } from '@/types/models';
import { supabase } from './supabaseClient';

interface SuggestionRow {
  id: string;
  type: string;
  value: string;
  used_count: number;
  data: unknown;
  updated_at: string;
}

interface AppDataRow<T> {
  data: T;
  revision: number;
  updated_at: string;
}

export interface HostedAppDataSnapshot<T> {
  data: T | null;
  revision: number;
  updatedAt: string | null;
}

let realtimeChannelSequence = 0;

export type RealtimeSubscriptionStatus =
  | 'SUBSCRIBED'
  | 'TIMED_OUT'
  | 'CLOSED'
  | 'CHANNEL_ERROR';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function suggestionFromRow(row: SuggestionRow): SuggestionRecord {
  const stored = asRecord(row.data);
  const createdAt = typeof stored.createdAt === 'string' ? stored.createdAt : row.updated_at;

  return {
    id: row.id,
    type: row.type,
    value: row.value,
    usedCount: Number.isFinite(row.used_count) ? row.used_count : 1,
    createdAt,
    updatedAt: row.updated_at,
    deleted: stored.deleted === true ? true : undefined,
    deletedAt: typeof stored.deletedAt === 'string' ? stored.deletedAt : null,
  };
}

function rowFromSuggestion(record: SuggestionRecord) {
  return {
    id: record.id,
    type: record.type,
    value: record.value,
    used_count: Math.max(0, Math.floor(Number(record.usedCount) || 0)),
    data: record,
  };
}

const SUGGESTION_SELECT = 'id,type,value,used_count,data,updated_at';

export async function getHostedSuggestion(id: string): Promise<SuggestionRecord | null> {
  const { data, error } = await supabase
    .from('suggestions')
    .select(SUGGESTION_SELECT)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? suggestionFromRow(data as SuggestionRow) : null;
}

export async function listHostedSuggestions(types?: readonly string[]): Promise<SuggestionRecord[]> {
  const uniqueTypes = Array.from(new Set((types ?? []).map((type) => type.trim()).filter(Boolean)));
  const pageSize = 1_000;
  const records: SuggestionRecord[] = [];

  for (let from = 0; ; from += pageSize) {
    let query = supabase
      .from('suggestions')
      .select(SUGGESTION_SELECT)
      .order('used_count', { ascending: false })
      .order('value')
      .range(from, from + pageSize - 1);
    if (uniqueTypes.length > 0) query = query.in('type', uniqueTypes);

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    records.push(...(data ?? []).map((row) => suggestionFromRow(row as SuggestionRow)));
    if ((data?.length ?? 0) < pageSize) break;
  }

  return records;
}

export async function getHostedSuggestionsByIds(ids: readonly string[]): Promise<Map<string, SuggestionRecord>> {
  const out = new Map<string, SuggestionRecord>();
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
  const chunkSize = 200;

  for (let index = 0; index < uniqueIds.length; index += chunkSize) {
    const { data, error } = await supabase
      .from('suggestions')
      .select(SUGGESTION_SELECT)
      .in('id', uniqueIds.slice(index, index + chunkSize));
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      const suggestion = suggestionFromRow(row as SuggestionRow);
      out.set(suggestion.id, suggestion);
    }
  }

  return out;
}

export async function upsertHostedSuggestions(
  records: readonly SuggestionRecord[],
  options: { ignoreExisting?: boolean } = {},
): Promise<void> {
  const chunkSize = 200;
  for (let index = 0; index < records.length; index += chunkSize) {
    const rows = records.slice(index, index + chunkSize).map(rowFromSuggestion);
    const { error } = await supabase.from('suggestions').upsert(rows, {
      onConflict: 'id',
      ignoreDuplicates: options.ignoreExisting === true,
    });
    if (error) throw new Error(error.message);
  }
}

export async function getHostedAppData<T>(key: string): Promise<T | null> {
  return (await getHostedAppDataVersioned<T>(key)).data;
}

/**
 * Read both an app document and the revision used by the server-side CAS RPC.
 * Revision zero is the explicit version of a document that does not exist yet.
 */
export async function getHostedAppDataVersioned<T>(key: string): Promise<HostedAppDataSnapshot<T>> {
  const { data, error } = await supabase
    .from('app_data')
    .select('data,revision,updated_at')
    .eq('key', key)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return { data: null, revision: 0, updatedAt: null };
  const row = data as AppDataRow<T>;
  return {
    data: row.data,
    revision: Math.max(1, Math.floor(Number(row.revision) || 1)),
    updatedAt: row.updated_at,
  };
}

export async function upsertHostedAppData<T>(key: string, data: T): Promise<void> {
  const { error } = await supabase
    .from('app_data')
    .upsert({ key, data }, { onConflict: 'key' });
  if (error) throw new Error(error.message);
}

/**
 * Atomically replace an app document only when its revision is still the one
 * the caller last read. A null result is a normal conflict, not a transport
 * error; callers must fetch the new revision, merge, and retry.
 */
export async function compareAndSwapHostedAppData<T>(
  key: string,
  expectedRevision: number,
  data: T,
): Promise<HostedAppDataSnapshot<T> | null> {
  const { data: rows, error } = await supabase.rpc('compare_and_swap_app_data', {
    p_key: key,
    p_expected_revision: Math.max(0, Math.floor(expectedRevision)),
    p_data: data,
  });
  if (error) throw new Error(error.message);
  const row = (rows as AppDataRow<T>[] | null)?.[0];
  if (!row) return null;
  return {
    data: row.data,
    revision: Math.max(1, Math.floor(Number(row.revision) || 1)),
    updatedAt: row.updated_at,
  };
}

export function subscribeToSuggestions(
  onChange: () => void,
  onStatus?: (status: RealtimeSubscriptionStatus, error?: Error) => void,
): () => void {
  realtimeChannelSequence += 1;
  const channel = supabase
    .channel(`suggestions-live-${realtimeChannelSequence}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'suggestions' }, () => onChange())
    .subscribe((status, error) => onStatus?.(status, error));
  return () => { void supabase.removeChannel(channel).catch(() => undefined); };
}

export function subscribeToAppData(
  key: string,
  onChange: () => void,
  onStatus?: (status: RealtimeSubscriptionStatus, error?: Error) => void,
): () => void {
  realtimeChannelSequence += 1;
  const channel = supabase
    .channel(`app-data-live-${realtimeChannelSequence}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'app_data' },
      (payload) => {
        const next = payload.new as { key?: string } | undefined;
        const previous = payload.old as { key?: string } | undefined;
        if (next?.key === key || previous?.key === key) onChange();
      },
    )
    .subscribe((status, error) => onStatus?.(status, error));
  return () => { void supabase.removeChannel(channel).catch(() => undefined); };
}
