import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { isFleetOpsEmail } from '../config/fleet-ops';
import { getJwtSecret } from '../config/env.validation';
import type { UserRole } from '../common/utils/permissions';

type JwtPayload = {
  sub: string;
  email: string;
  role: UserRole;
  tenantId?: string | null;
  fleetOps?: boolean;
  purpose?: string;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: getJwtSecret(),
    });
  }

  validate(payload: JwtPayload) {
    if (payload.purpose === 'mfa_pending') {
      return null;
    }

    return {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
      tenantId: payload.tenantId ?? undefined,
      fleetOps: payload.fleetOps ?? isFleetOpsEmail(payload.email),
    };
  }
}