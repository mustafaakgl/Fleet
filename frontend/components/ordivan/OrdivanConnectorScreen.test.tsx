import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Connector ekrani (Faz 12).
 *
 * Backend MOCK. Sinanan sey: tek seferlik sirrin nasil gosterildigi, anahtarin
 * listeye HIC sizmamasi, uc durumlu uyumluluk ve iptal davranisi.
 */

const listFn = vi.fn();
const createFn = vi.fn();
const rotateFn = vi.fn();
const revokeFn = vi.fn();

vi.mock('@/lib/api', () => ({
  ordivanApi: {
    listConnectors: (...args: unknown[]) => listFn(...args),
    createEnrollment: (...args: unknown[]) => createFn(...args),
    rotateCredential: (...args: unknown[]) => rotateFn(...args),
    revokeConnector: (...args: unknown[]) => revokeFn(...args),
  },
}));

import type { OrdivanConnector, OrdivanConnectorList } from '@/lib/types';
import { OrdivanConnectorScreen } from './OrdivanConnectorScreen';

function connector(overrides: Partial<OrdivanConnector> = {}): OrdivanConnector {
  return {
    id: 'conn-1',
    displayName: 'Buro-PC',
    status: 'active',
    online: true,
    lastHeartbeatAt: '2026-08-18T10:00:00.000Z',
    capabilities: ['system.echo'],
    connectorVersion: '0.1.0',
    protocolVersion: '1',
    protocolCompatibility: 'ok',
    platform: 'darwin',
    architecture: 'arm64',
    credentialPrefix: 'abcd1234',
    credentialIssuedAt: '2026-08-18T09:00:00.000Z',
    credentialRotatedAt: null,
    credentialRevokedAt: null,
    enrolledAt: '2026-08-18T09:00:00.000Z',
    ...overrides,
  };
}

function payload(overrides: Partial<OrdivanConnectorList> = {}): OrdivanConnectorList {
  return {
    mode: 'mock',
    protocol: { current: 1, minimumSupported: 1 },
    connectors: [connector()],
    ...overrides,
  };
}

describe('OrdivanConnectorScreen', () => {
  beforeEach(() => {
    listFn.mockReset();
    createFn.mockReset();
    rotateFn.mockReset();
    revokeFn.mockReset();
    listFn.mockResolvedValue(payload());
  });

  it('calisma modunu METIN olarak gosterir', async () => {
    render(<OrdivanConnectorScreen />);
    await waitFor(() =>
      expect(screen.getByTestId('ordivan-mode').textContent).toContain(
        'automation.connector.mode.mock',
      ),
    );
  });

  it('kapali modda Fleet calisir; ekran bunu soyler', async () => {
    listFn.mockResolvedValue(payload({ mode: 'disabled', connectors: [] }));
    render(<OrdivanConnectorScreen />);

    await waitFor(() =>
      expect(screen.getByTestId('ordivan-mode').textContent).toContain(
        'automation.connector.mode.disabled',
      ),
    );
  });

  it('liste anahtari ya da ozetini ICERMEZ, yalnizca onek gosterir', async () => {
    const { container } = render(<OrdivanConnectorScreen />);
    await waitFor(() => expect(screen.getByTestId('ordivan-connector-row')).toBeDefined());

    const text = container.textContent ?? '';
    expect(text).toContain('abcd1234');
    expect(text).not.toContain('credentialHash');
    expect(text).not.toContain('enrollmentCodeHash');
  });

  it('kayit kodu BIR KEZ gosterilir ve kapatilinca kaybolur', async () => {
    const user = userEvent.setup();
    createFn.mockResolvedValue({
      connectorId: 'conn-2',
      enrollmentCode: 'GIZLI-KAYIT-KODU-123456',
      expiresAt: '2026-08-18T10:15:00.000Z',
    });

    render(<OrdivanConnectorScreen />);
    await waitFor(() => expect(screen.getByTestId('ordivan-connector-row')).toBeDefined());

    await user.type(screen.getByLabelText(/displayName/i), 'Werkstatt');
    await user.click(screen.getByTestId('ordivan-create-enrollment'));

    await waitFor(() =>
      expect(screen.getByTestId('ordivan-secret').textContent).toContain('GIZLI-KAYIT-KODU-123456'),
    );
    expect(screen.getByTestId('ordivan-secret').textContent).toContain(
      'automation.connector.secretOnce',
    );

    await user.click(screen.getByTestId('ordivan-secret-dismiss'));
    expect(screen.queryByTestId('ordivan-secret')).toBeNull();
  });

  it('yetenek secilmeden kod uretilemez', async () => {
    const user = userEvent.setup();
    render(<OrdivanConnectorScreen />);
    await waitFor(() => expect(screen.getByTestId('ordivan-connector-row')).toBeDefined());

    await user.type(screen.getByLabelText(/displayName/i), 'Werkstatt');
    await user.click(screen.getByRole('checkbox', { name: 'system.echo' }));

    expect((screen.getByTestId('ordivan-create-enrollment') as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it('surum bildirmeyen connector "uyumlu" gorunmez', async () => {
    listFn.mockResolvedValue(
      payload({ connectors: [connector({ protocolVersion: null, protocolCompatibility: 'unknown' })] }),
    );
    render(<OrdivanConnectorScreen />);

    await waitFor(() =>
      expect(screen.getByText('automation.connector.protocol.unknown')).toBeDefined(),
    );
    expect(screen.queryByText('automation.connector.protocol.ok')).toBeNull();
  });

  it('eski connector icin guncelleme uyarisi cikar', async () => {
    listFn.mockResolvedValue(
      payload({ connectors: [connector({ protocolCompatibility: 'connector_too_old' })] }),
    );
    render(<OrdivanConnectorScreen />);

    await waitFor(() => expect(screen.getByTestId('ordivan-update-conn-1')).toBeDefined());
  });

  it('iptalli connector icin yenile/iptal kapali', async () => {
    listFn.mockResolvedValue(
      payload({ connectors: [connector({ status: 'revoked', online: false })] }),
    );
    render(<OrdivanConnectorScreen />);

    await waitFor(() => expect(screen.getByTestId('ordivan-rotate-conn-1')).toBeDefined());
    expect((screen.getByTestId('ordivan-rotate-conn-1') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId('ordivan-revoke-conn-1') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('automation.connector.state.revoked')).toBeDefined();
  });

  it('anahtar yenilendiginde yeni deger BIR KEZ gosterilir', async () => {
    const user = userEvent.setup();
    rotateFn.mockResolvedValue({ credential: 'YENI-ANAHTAR-999', credentialPrefix: 'YENI-ANA' });

    render(<OrdivanConnectorScreen />);
    await waitFor(() => expect(screen.getByTestId('ordivan-rotate-conn-1')).toBeDefined());
    await user.click(screen.getByTestId('ordivan-rotate-conn-1'));

    await waitFor(() =>
      expect(screen.getByTestId('ordivan-secret').textContent).toContain('YENI-ANAHTAR-999'),
    );
    expect(rotateFn).toHaveBeenCalledWith('conn-1');
  });
});
