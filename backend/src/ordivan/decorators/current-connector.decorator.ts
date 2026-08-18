import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthenticatedConnector } from '../ordivan-connector.service';

/** Guard'in cozdugu connector kimligi. Istemciden GELMEZ. */
export const CurrentConnector = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedConnector => {
    const request = context
      .switchToHttp()
      .getRequest<{ ordivanConnector?: AuthenticatedConnector }>();
    return request.ordivanConnector as AuthenticatedConnector;
  },
);
