import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { isFleetOpsApiKey, isFleetOpsEmail } from '../config/fleet-ops';

type FleetOpsRequest = {
  user?: { email?: string };
  headers: Record<string, string | string[] | undefined>;
  fleetOpsActor?: 'api-key' | 'user';
};

@Injectable()
export class FleetOpsGuard extends AuthGuard('jwt') {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<FleetOpsRequest>();
    const apiKeyHeader = request.headers['x-fleet-ops-key'];
    const apiKey = Array.isArray(apiKeyHeader) ? apiKeyHeader[0] : apiKeyHeader;

    if (isFleetOpsApiKey(apiKey)) {
      request.fleetOpsActor = 'api-key';
      return true;
    }

    const jwtAllowed = await super.canActivate(context);
    if (!jwtAllowed) {
      throw new UnauthorizedException();
    }

    if (!isFleetOpsEmail(request.user?.email)) {
      throw new ForbiddenException('Fleet Ops access required');
    }

    request.fleetOpsActor = 'user';
    return true;
  }
}
