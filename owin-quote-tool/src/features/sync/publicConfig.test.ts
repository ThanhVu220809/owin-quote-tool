import { afterEach, describe, expect, it, vi } from 'vitest';
import { getPublicConfigDiagnostics, isOAuthConfigured, isSyncConfigured } from './publicConfig';

const VALID = '706495406475-xxxxxxxxxxxxxxxxxxxxxxxx.apps.googleusercontent.com';

afterEach(() => {
  vi.unstubAllEnvs();
});

function stubConfig(values: { clientId?: string; backend?: string; shared?: string }) {
  vi.stubEnv('VITE_GOOGLE_CLIENT_ID', values.clientId ?? '');
  vi.stubEnv('VITE_BACKEND_URL', values.backend ?? '');
  vi.stubEnv('VITE_SHARED_SECRET', values.shared ?? '');
}

describe('getPublicConfigDiagnostics', () => {
  it('Client ID đúng, backend thiếu vẫn cho phép OAuth nhưng chưa sẵn sàng sync', () => {
    stubConfig({ clientId: VALID });
    expect(isOAuthConfigured()).toBe(true);
    expect(isSyncConfigured()).toBe(false);
    expect(getPublicConfigDiagnostics()).toMatchObject({
      googleClientId: { status: 'configured' },
      backendUrl: { status: 'missing' },
      sharedValue: { status: 'missing' },
      overallSync: 'backend-invalid',
    });
  });

  it('Client ID đúng, shared value thiếu vẫn cho phép OAuth', () => {
    stubConfig({ clientId: VALID, backend: 'https://script.google.com/macros/s/DEPLOYMENT_ID/exec' });
    expect(isOAuthConfigured()).toBe(true);
    expect(isSyncConfigured()).toBe(false);
    expect(getPublicConfigDiagnostics().overallSync).toBe('shared-value-missing');
  });

  it('Client ID sai thì OAuth chưa cấu hình', () => {
    stubConfig({ clientId: 'not-a-google-client-id', backend: 'https://backend.example.test', shared: 'secret' });
    expect(isOAuthConfigured()).toBe(false);
    expect(getPublicConfigDiagnostics().overallSync).toBe('oauth-invalid');
  });

  it('cả ba đúng thì ready và chỉ trả hostname, không trả shared value', () => {
    const secret = 'super-secret-value';
    stubConfig({ clientId: VALID, backend: 'https://script.google.com/macros/s/DEPLOYMENT_ID/exec', shared: secret });
    const diagnostics = getPublicConfigDiagnostics();
    expect(diagnostics).toEqual({
      googleClientId: { status: 'configured' },
      backendUrl: { status: 'configured', hostname: 'script.google.com' },
      sharedValue: { status: 'configured' },
      overallSync: 'ready',
    });
    expect(JSON.stringify(diagnostics)).not.toContain(secret);
  });

  it('backend validator gebruikt URL parsing en accepteert een Apps Script production URL', () => {
    stubConfig({ clientId: VALID, backend: 'https://script.google.com/macros/s/DEPLOYMENT_ID/exec', shared: 'secret' });
    expect(getPublicConfigDiagnostics().backendUrl).toEqual({ status: 'configured', hostname: 'script.google.com' });
  });

  it('rejects malformed or non-HTTPS backend URLs without exposing their contents', () => {
    stubConfig({ clientId: VALID, backend: 'not a url', shared: 'secret' });
    expect(getPublicConfigDiagnostics().backendUrl).toEqual({ status: 'invalid', hostname: '' });
    stubConfig({ clientId: VALID, backend: 'http://script.google.com/macros/s/id/exec', shared: 'secret' });
    expect(getPublicConfigDiagnostics().backendUrl.status).toBe('invalid');
  });
});
