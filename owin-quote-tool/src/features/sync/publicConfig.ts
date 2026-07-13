import { getGoogleClientId, isValidGoogleClientId } from './googleClientId';

export type ConfigStatus = 'configured' | 'missing' | 'invalid';
export type SyncReadiness = 'ready' | 'oauth-invalid' | 'backend-invalid' | 'shared-value-missing';

export interface PublicConfigDiagnostics {
  googleClientId: { status: ConfigStatus };
  backendUrl: { status: ConfigStatus; hostname: string };
  sharedValue: { status: 'configured' | 'missing' };
  overallSync: SyncReadiness;
}

function getBackendUrl(): string {
  return (import.meta.env.VITE_BACKEND_URL ?? '').trim();
}

function getSharedValue(): string {
  return (import.meta.env.VITE_SHARED_SECRET ?? '').trim();
}

function parseBackendUrl(raw: string): URL | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' && Boolean(url.hostname) ? url : null;
  } catch {
    return null;
  }
}

export function getPublicConfigDiagnostics(): PublicConfigDiagnostics {
  const clientId = getGoogleClientId();
  const backendRaw = getBackendUrl();
  const backendUrl = parseBackendUrl(backendRaw);
  const clientStatus: ConfigStatus = !clientId
    ? 'missing'
    : isValidGoogleClientId(clientId) ? 'configured' : 'invalid';
  const backendStatus: ConfigStatus = !backendRaw
    ? 'missing'
    : backendUrl ? 'configured' : 'invalid';
  const sharedStatus = getSharedValue() ? 'configured' : 'missing';

  let overallSync: SyncReadiness = 'ready';
  if (clientStatus !== 'configured') overallSync = 'oauth-invalid';
  else if (backendStatus !== 'configured') overallSync = 'backend-invalid';
  else if (sharedStatus === 'missing') overallSync = 'shared-value-missing';

  return {
    googleClientId: { status: clientStatus },
    backendUrl: { status: backendStatus, hostname: backendUrl?.hostname ?? '' },
    sharedValue: { status: sharedStatus },
    overallSync,
  };
}

export function isOAuthConfigured(): boolean {
  return getPublicConfigDiagnostics().googleClientId.status === 'configured';
}

export function isSyncConfigured(): boolean {
  return getPublicConfigDiagnostics().overallSync === 'ready';
}
