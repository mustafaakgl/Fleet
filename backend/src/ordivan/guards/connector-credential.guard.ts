import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { OrdivanConnectorService } from '../ordivan-connector.service';
import { isOrdivanEnabled, resolveOrdivanMode } from '../ordivan.config';

export const CONNECTOR_HEADER = 'x-ordivan-credential';

/**
 * Connector kimlik dogrulamasi (Faz 12).
 *
 * KIRACIYI BU GUARD KURAR. `request.user.tenantId`e yazdigi degeri, repoda
 * ZATEN VAR OLAN `TenantInterceptor` okuyup `TenantContext`i aciyor — yani
 * connector istekleri de butun sorgu kapsamlamasindan aynen geciyor. Paralel
 * bir kiraci mekanizmasi KURULMADI.
 *
 * Istekteki hicbir alan kiraci belirleyemez: `tenantId` yalnizca anahtarin
 * bagli oldugu connector kaydindan gelir.
 */
@Injectable()
export class ConnectorCredentialGuard implements CanActivate {
  constructor(private readonly connectors: OrdivanConnectorService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // `disabled` modda uclar KAPALI ama Fleet calismaya devam eder.
    if (!isOrdivanEnabled(resolveOrdivanMode())) {
      throw new ServiceUnavailableException({ code: 'ordivan_disabled' });
    }

    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
      user?: Record<string, unknown>;
      ordivanConnector?: unknown;
    }>();

    const raw = request.headers[CONNECTOR_HEADER];
    const credential = Array.isArray(raw) ? raw[0] : raw;
    if (!credential) {
      throw new UnauthorizedException({ code: 'ordivan_credential_missing' });
    }

    const connector = await this.connectors.authenticate(credential);

    // `role` bilincli olarak bir INSAN ROLU DEGIL: connector hicbir kullanici
    // rolunu ustlenemez, dolayisiyla rol tabanli uclara da giremez.
    request.user = { tenantId: connector.tenantId, role: 'ordivan_connector' };
    request.ordivanConnector = connector;

    return true;
  }
}
