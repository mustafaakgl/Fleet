import { RequestMethod, Type } from '@nestjs/common';
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { ModulesContainer } from '@nestjs/core';
import {
  ApiProperty,
  ApiPropertyOptional,
  ApiPropertyOptions,
  DocumentBuilder,
  OpenAPIObject,
  SwaggerModule,
} from '@nestjs/swagger';
import { getMetadataStorage } from 'class-validator';
import { IS_PUBLIC_KEY } from '../common/decorators/public.decorator';
import { REQUIRES_WRITE_KEY } from '../common/decorators/requires-write.decorator';
import { ROLES_KEY } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { OPERATIONAL_WRITE_ROLES, type UserRole } from '../common/utils/permissions';

type ValidationRule = {
  propertyName: string;
  name?: string;
  constraints?: unknown[];
  each?: boolean;
};

type RouteDocMetadata = {
  controllerName: string;
  controllerPath: string;
  methodName: string;
  method: Lowercase<'get' | 'post' | 'put' | 'patch' | 'delete'>;
  roles: UserRole[];
  requiresAuth: boolean;
  isPublic: boolean;
  requiresWrite: boolean;
  tag: string;
  hasPathParams: boolean;
};

const BUILT_IN_TYPES = new Set<Function>([String, Number, Boolean, Array, Object, Date, Buffer]);
const MUTATING_METHODS = new Set<RouteDocMetadata['method']>(['post', 'put', 'patch', 'delete']);
const SENSITIVE_FIELD_PATTERN = /(password|refresh.?token|access.?token|token|secret|hash|stack|internal|storage|path)/i;
const SWAGGER_MODEL_PROPERTIES_METADATA_KEY = 'swagger/apiModelProperties';
const TAG_BY_CONTROLLER_NAME: Record<string, string> = {
  DriverMobileController: 'Drivers',
  LicenseChecksDriverController: 'Drivers',
  DriverEquipmentIssuancesController: 'Equipment issuance',
  FleetTripsDriverController: 'Telematics',
  FleetDriverScoreDriverController: 'Telematics',
  FleetFuelDriverController: 'Telematics',
  FleetFuelAnalyticsDriverController: 'Telematics',
  FleetVehicleStatusDriverController: 'Telematics',
  FinesDriverController: 'Drivers',
  DepartureChecksDriverController: 'Drivers',
  DefectsDriverController: 'Drivers',
};
const TAG_BY_PATH_PREFIX: Record<string, string> = {
  auth: 'Authentication',
  users: 'Users',
  drivers: 'Drivers',
  'driver-mobile': 'Drivers',
  vehicles: 'Vehicles',
  companies: 'Companies',
  'company-emails': 'Companies',
  assignments: 'Assignments',
  requests: 'Requests',
  'leave-requests': 'Requests',
  'transport-requests': 'Requests',
  calendar: 'Calendar',
  documents: 'Documents',
  reminders: 'Reminders',
  notifications: 'Notifications',
  'push-notifications': 'Notifications',
  search: 'Search',
  telematics: 'Telematics',
  tracking: 'Telematics',
  tachograph: 'Telematics',
  devices: 'Telematics',
  fleet: 'Telematics',
  audit: 'Audit',
  'equipment-issuances': 'Equipment issuance',
  onboarding: 'Onboarding',
  invitations: 'Invitations',
  billing: 'Billing',
  dashboard: 'Dashboard',
  health: 'Health',
  import: 'Import',
  mail: 'Mail',
  messenger: 'Messenger',
  privacy: 'Privacy',
  accidents: 'Accidents',
  'service-records': 'Service records',
  'work-sessions': 'Work sessions',
  'departure-checks': 'Departure checks',
  defects: 'Departure checks',
  'checklist-templates': 'Departure checks',
  'fine-management': 'Fines',
  fines: 'Fines',
  metrics: 'Metrics',
  common: 'Common',
  prisma: 'Internal',
  'customer-portal': 'Customer portal',
  'fleet-ops': 'Fleet operations',
  'license-checks': 'Drivers',
  'driver-licenses': 'Drivers',
};

export function isSwaggerEnabled(): boolean {
  return String(process.env.SWAGGER_ENABLED ?? '').toLowerCase() === 'true';
}

export function setupSwagger(app: { get: <TInput = unknown, TResult = TInput>(typeOrToken: TInput) => TResult }): OpenAPIObject | null {
  if (!isSwaggerEnabled()) {
    return null;
  }

  const routeMetadata = collectRouteMetadata(app.get(ModulesContainer));
  const dtoClasses = collectDtoClasses(app.get(ModulesContainer));
  decorateDtos(dtoClasses);

  const document = SwaggerModule.createDocument(
    app as never,
    new DocumentBuilder()
      .setTitle('Fleet API')
      .setDescription('Tenant-scoped Fleet REST API documentation. Swagger is intentionally opt-in outside local development.')
      .setVersion('1.0.0')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Paste a valid access token. Refresh tokens are not accepted here and are never exposed by this document.',
        },
        'bearerAuth',
      )
      .build(),
    {
      deepScanRoutes: true,
      extraModels: dtoClasses,
      operationIdFactory: (controllerKey: string, methodKey: string) => `${controllerKey}.${methodKey}`,
    },
  );

  enhanceDocument(document, routeMetadata);

  SwaggerModule.setup('api/docs', app as never, document, {
    jsonDocumentUrl: 'api/docs-json',
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  return document;
}

function collectDtoClasses(modulesContainer: ModulesContainer): Type<unknown>[] {
  const dtoClasses = new Map<string, Type<unknown>>();

  for (const moduleRef of modulesContainer.values()) {
    for (const controllerRef of moduleRef.controllers.values()) {
      const metatype = controllerRef.metatype;
      if (!metatype) {
        continue;
      }

      const prototype = metatype.prototype as Record<string, unknown>;
      for (const methodName of Object.getOwnPropertyNames(prototype)) {
        if (methodName === 'constructor') {
          continue;
        }

        const handler = prototype[methodName];
        if (typeof handler !== 'function') {
          continue;
        }

        const parameterTypes = Reflect.getMetadata('design:paramtypes', prototype, methodName) as Function[] | undefined;
        for (const parameterType of parameterTypes ?? []) {
          if (!isDtoClass(parameterType)) {
            continue;
          }
          dtoClasses.set(parameterType.name, parameterType as Type<unknown>);
        }
      }
    }
  }

  return [...dtoClasses.values()];
}

function decorateDtos(dtoClasses: Type<unknown>[]): void {
  const metadataStorage = getMetadataStorage();

  for (const dtoClass of dtoClasses) {
    const validationRules = metadataStorage.getTargetValidationMetadatas(
      dtoClass,
      dtoClass.name,
      false,
      false,
    ) as ValidationRule[];

    const rulesByProperty = new Map<string, ValidationRule[]>();
    for (const rule of validationRules) {
      const rules = rulesByProperty.get(rule.propertyName) ?? [];
      rules.push(rule);
      rulesByProperty.set(rule.propertyName, rules);
    }

    for (const [propertyName, rules] of rulesByProperty.entries()) {
      if (Reflect.hasMetadata(SWAGGER_MODEL_PROPERTIES_METADATA_KEY, dtoClass.prototype, propertyName)) {
        continue;
      }

      const designType = Reflect.getMetadata('design:type', dtoClass.prototype, propertyName) as Function | undefined;
      const isOptional = rules.some((rule) => rule.name === 'isOptional');
      const options = buildApiPropertyOptions(propertyName, designType, rules);
      const decorator = isOptional ? ApiPropertyOptional : ApiProperty;
      decorator(options)(dtoClass.prototype, propertyName);
    }
  }
}

function buildApiPropertyOptions(
  propertyName: string,
  designType: Function | undefined,
  rules: ValidationRule[],
): ApiPropertyOptions {
  const options: ApiPropertyOptions = {};
  const lowerName = propertyName.toLowerCase();
  const isSensitive = SENSITIVE_FIELD_PATTERN.test(lowerName);
  const enumRule = rules.find((rule) => rule.name === 'isEnum');
  const minLengthRule = rules.find((rule) => rule.name === 'minLength');
  const maxLengthRule = rules.find((rule) => rule.name === 'maxLength');
  const minRule = rules.find((rule) => rule.name === 'min');
  const maxRule = rules.find((rule) => rule.name === 'max');
  const isEmail = rules.some((rule) => rule.name === 'isEmail');
  const isUuid = rules.some((rule) => rule.name === 'isUuid');
  const isDateString = rules.some((rule) => rule.name === 'isDateString');
  const isDate = rules.some((rule) => rule.name === 'isDate');
  const isArray = designType === Array;

  if (enumRule?.constraints?.[0] && Array.isArray(enumRule.constraints[0])) {
    options.enum = enumRule.constraints[0] as string[];
  }

  if (enumRule?.constraints?.[0] && !Array.isArray(enumRule.constraints[0]) && typeof enumRule.constraints[0] === 'object') {
    options.enum = Object.values(enumRule.constraints[0] as Record<string, string | number>);
  }

  if (designType && !isArray && !options.enum) {
    options.type = designType as never;
  }

  if (isArray) {
    options.type = [String] as never;
  }

  if (isEmail) {
    options.format = 'email';
  }

  if (isUuid || lowerName.endsWith('id') || lowerName.endsWith('_id')) {
    options.format = 'uuid';
  }

  if (isDateString || isDate) {
    options.format = isDateOnlyField(lowerName) ? 'date' : 'date-time';
  }

  if (typeof minLengthRule?.constraints?.[0] === 'number') {
    options.minLength = minLengthRule.constraints[0];
  }

  if (typeof maxLengthRule?.constraints?.[0] === 'number') {
    options.maxLength = maxLengthRule.constraints[0];
  }

  if (typeof minRule?.constraints?.[0] === 'number') {
    options.minimum = minRule.constraints[0];
  }

  if (typeof maxRule?.constraints?.[0] === 'number') {
    options.maximum = maxRule.constraints[0];
  }

  if (isSensitive) {
    options.writeOnly = true;
  } else {
    const example = inferExample(propertyName, options.enum, options.type, options.format);
    if (example !== undefined) {
      options.example = example;
    }
  }

  return options;
}

function collectRouteMetadata(modulesContainer: ModulesContainer): Map<string, RouteDocMetadata> {
  const routeMetadata = new Map<string, RouteDocMetadata>();

  for (const moduleRef of modulesContainer.values()) {
    for (const controllerRef of moduleRef.controllers.values()) {
      const metatype = controllerRef.metatype;
      if (!metatype) {
        continue;
      }

      const controllerPath = normalizePath(Reflect.getMetadata(PATH_METADATA, metatype));
      const classRoles = (Reflect.getMetadata(ROLES_KEY, metatype) ?? []) as UserRole[];
      const classGuards = (Reflect.getMetadata(GUARDS_METADATA, metatype) ?? []) as Function[];
      const classIsPublic = Reflect.getMetadata(IS_PUBLIC_KEY, metatype) === true;
      const controllerTag = resolveTag(controllerPath, metatype.name);

      const prototype = metatype.prototype as Record<string, unknown>;
      for (const methodName of Object.getOwnPropertyNames(prototype)) {
        if (methodName === 'constructor') {
          continue;
        }

        const handler = prototype[methodName];
        if (typeof handler !== 'function') {
          continue;
        }

        const methodPathMetadata = Reflect.getMetadata(PATH_METADATA, handler);
        if (methodPathMetadata === undefined) {
          continue;
        }

        const requestMethod = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod;
        const methodGuards = (Reflect.getMetadata(GUARDS_METADATA, handler) ?? []) as Function[];
        const methodRoles = Reflect.getMetadata(ROLES_KEY, handler) as UserRole[] | undefined;
        const roles = methodRoles ?? classRoles;
        const guards = [...classGuards, ...methodGuards];
        const isPublic = classIsPublic || Reflect.getMetadata(IS_PUBLIC_KEY, handler) === true;
        const method = toHttpMethod(requestMethod);
        if (!method) {
          continue;
        }

        routeMetadata.set(`${metatype.name}.${methodName}`, {
          controllerName: metatype.name,
          controllerPath,
          methodName,
          method,
          roles,
          requiresAuth: !isPublic && guards.some((guard) => guard === JwtAuthGuard || guard?.name === JwtAuthGuard.name),
          isPublic,
          requiresWrite: Reflect.getMetadata(REQUIRES_WRITE_KEY, handler) === true,
          tag: controllerTag,
          hasPathParams: normalizePath(methodPathMetadata).includes(':'),
        });
      }
    }
  }

  return routeMetadata;
}

function enhanceDocument(document: OpenAPIObject, routeMetadata: Map<string, RouteDocMetadata>): void {
  document.components ??= {};
  document.components.schemas ??= {};
  document.components.securitySchemes ??= {};
  document.components.securitySchemes.bearerAuth = {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT',
  };

  document.components.schemas.StandardErrorResponse = {
    type: 'object',
    additionalProperties: false,
    properties: {
      statusCode: { type: 'integer', example: 404 },
      message: { type: 'string', example: 'Document not found' },
      error: { type: 'string', example: 'NotFoundException', nullable: true },
      requestId: { type: 'string', format: 'uuid', nullable: true },
      timestamp: { type: 'string', format: 'date-time', nullable: true },
    },
    required: ['statusCode', 'message'],
  };
  document.components.schemas.PaginatedCollection = {
    type: 'object',
    additionalProperties: false,
    properties: {
      data: {
        type: 'array',
        items: { type: 'object', additionalProperties: true },
      },
      total: { type: 'integer', example: 42 },
      page: { type: 'integer', example: 1 },
      limit: { type: 'integer', example: 20 },
      pages: { type: 'integer', example: 3, nullable: true },
    },
    required: ['data', 'total', 'page', 'limit'],
  };

  const usedTags = new Set<string>();

  for (const [path, pathItem] of Object.entries(document.paths)) {
    for (const [method, operation] of Object.entries(pathItem)) {
      if (!isOperationMethod(method) || !operation) {
        continue;
      }

      const metadata = routeMetadata.get(operation.operationId ?? '');
      if (!metadata) {
        continue;
      }

      usedTags.add(metadata.tag);
      operation.tags = [metadata.tag];
      operation.description = buildOperationDescription(metadata, operation.description);

      if (metadata.requiresAuth) {
        operation.security = [{ bearerAuth: [] }];
      } else {
        delete operation.security;
      }

      operation.responses ??= {};
      ensureSuccessResponse(operation.responses, metadata.method, path, metadata.methodName);
      operation.responses['400'] ??= createErrorResponse('Validation or request format error');
      if (metadata.requiresAuth) {
        operation.responses['401'] ??= createErrorResponse('Authentication required');
      }
      if (metadata.roles.length > 0 || metadata.requiresWrite) {
        operation.responses['403'] ??= createErrorResponse('Role or write permission denied');
      }
      if (metadata.hasPathParams) {
        operation.responses['404'] ??= createErrorResponse('Resource not found or hidden by tenant access policy');
      }
      if (MUTATING_METHODS.has(metadata.method)) {
        operation.responses['409'] ??= createErrorResponse('Duplicate, stale, or concurrent mutation conflict');
      }
      operation.responses['429'] ??= createErrorResponse('Rate limit exceeded');
      operation.responses['500'] ??= createErrorResponse('Unexpected server error');

      if (isPaginationOperation(path, operation)) {
        const successStatus = metadata.method === 'post' ? '201' : '200';
        const response = operation.responses[successStatus];
        if (response && !response.content) {
          response.content = {
            'application/json': {
              schema: { $ref: '#/components/schemas/PaginatedCollection' },
            },
          };
        }
      }

      if (path.endsWith('/download')) {
        const response = operation.responses['200'] ?? operation.responses['201'];
        if (response) {
          response.content = {
            'application/octet-stream': {
              schema: { type: 'string', format: 'binary' },
            },
          };
        }
      }
    }
  }

  document.tags = [...usedTags]
    .sort((left, right) => left.localeCompare(right))
    .map((name) => ({ name }));

  sanitizeDocument(document);
}

function ensureSuccessResponse(
  responses: Record<string, { description?: string; content?: Record<string, unknown> }>,
  method: RouteDocMetadata['method'],
  path: string,
  methodName: string,
): void {
  if (path.includes('/oidc/login') || path.includes('/oidc/callback')) {
    responses['302'] ??= { description: 'Redirect response' };
    return;
  }

  const successStatus = method === 'post' && !methodName.toLowerCase().includes('list') ? '201' : '200';
  responses[successStatus] ??= { description: successStatus === '201' ? 'Created successfully' : 'Successful response' };
}

function createErrorResponse(description: string) {
  return {
    description,
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/StandardErrorResponse' },
      },
    },
  };
}

function buildOperationDescription(metadata: RouteDocMetadata, existingDescription?: string): string {
  const accessDescription = metadata.isPublic
    ? 'Access: Public endpoint.'
    : metadata.requiresAuth
      ? metadata.roles.length > 0
        ? `Access: Bearer JWT required. Allowed roles: ${metadata.roles.join(', ')}.`
        : 'Access: Bearer JWT required. No additional role decorator is declared on this endpoint.'
      : 'Access: No JWT guard declared on this endpoint.';
  const writeDescription = metadata.requiresWrite
    ? `Write access is enforced by backend policy. Effective write roles: ${OPERATIONAL_WRITE_ROLES.join(', ')}.`
    : null;
  const tenantDescription = metadata.hasPathParams
    ? 'Cross-tenant or otherwise hidden resources resolve as 404 when the caller cannot access the target resource.'
    : null;

  return [existingDescription, accessDescription, writeDescription, tenantDescription]
    .filter((value): value is string => Boolean(value))
    .join('\n\n');
}

function isDtoClass(parameterType: Function): boolean {
  return !BUILT_IN_TYPES.has(parameterType) && /Dto$/u.test(parameterType.name);
}

function normalizePath(pathMetadata: unknown): string {
  if (Array.isArray(pathMetadata)) {
    return normalizePath(pathMetadata[0]);
  }

  if (typeof pathMetadata !== 'string') {
    return '';
  }

  return pathMetadata.replace(/^\/+|\/+$/g, '');
}

function resolveTag(controllerPath: string, controllerName: string): string {
  if (TAG_BY_CONTROLLER_NAME[controllerName]) {
    return TAG_BY_CONTROLLER_NAME[controllerName];
  }

  const firstSegment = controllerPath.split('/')[0] ?? '';
  if (firstSegment === 'driver') {
    const secondSegment = controllerPath.split('/')[1] ?? '';
    if (secondSegment && TAG_BY_PATH_PREFIX[secondSegment]) {
      return TAG_BY_PATH_PREFIX[secondSegment];
    }
    return 'Drivers';
  }

  return TAG_BY_PATH_PREFIX[firstSegment] ?? humanizeControllerName(controllerName);
}

function humanizeControllerName(controllerName: string): string {
  return controllerName
    .replace(/Controller$/u, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .trim();
}

function toHttpMethod(requestMethod: RequestMethod): RouteDocMetadata['method'] | null {
  switch (requestMethod) {
    case RequestMethod.GET:
      return 'get';
    case RequestMethod.POST:
      return 'post';
    case RequestMethod.PUT:
      return 'put';
    case RequestMethod.PATCH:
      return 'patch';
    case RequestMethod.DELETE:
      return 'delete';
    default:
      return null;
  }
}

function isOperationMethod(method: string): method is RouteDocMetadata['method'] {
  return method === 'get' || method === 'post' || method === 'put' || method === 'patch' || method === 'delete';
}

function isDateOnlyField(lowerName: string): boolean {
  return lowerName.endsWith('_date') || lowerName.endsWith('date') || lowerName.includes('expiry');
}

function inferExample(
  propertyName: string,
  enumValues: ApiPropertyOptions['enum'],
  type: ApiPropertyOptions['type'],
  format: string | undefined,
): string | number | boolean | undefined {
  const lowerName = propertyName.toLowerCase();
  const normalizedEnumValues = Array.isArray(enumValues)
    ? enumValues
    : enumValues && typeof enumValues === 'object'
      ? Object.values(enumValues)
      : [];

  if (normalizedEnumValues.length > 0) {
    const firstValue = normalizedEnumValues[0];
    return typeof firstValue === 'string' || typeof firstValue === 'number' ? firstValue : undefined;
  }
  if (format === 'email') return 'user@example.com';
  if (format === 'uuid') return '11111111-1111-4111-8111-111111111111';
  if (format === 'date') return '2026-07-20';
  if (format === 'date-time') return '2026-07-20T10:00:00.000Z';
  if (lowerName.includes('phone')) return '+4915112345678';
  if (lowerName.includes('email')) return 'user@example.com';
  if (lowerName.includes('first_name')) return 'Alex';
  if (lowerName.includes('last_name')) return 'Meyer';
  if (lowerName.includes('plate')) return 'B-FL 1024';
  if (lowerName.includes('city')) return 'Berlin';
  if (lowerName.includes('country')) return 'Germany';
  if (lowerName.includes('notes')) return 'Operational note';
  if (lowerName.includes('search')) return 'Berlin';
  if (lowerName.includes('code')) return '123456';
  if (lowerName.includes('file')) return 'document.pdf';
  if (type === Number) return 1;
  if (type === Boolean) return true;
  if (type === String) return 'sample';
  return undefined;
}

function isPaginationOperation(path: string, operation: { parameters?: Array<{ name?: string; in?: string }> }): boolean {
  const queryParameters = operation.parameters?.filter((parameter) => parameter.in === 'query') ?? [];
  const queryNames = new Set(queryParameters.map((parameter) => parameter.name));
  return queryNames.has('page') || queryNames.has('limit') || path.endsWith('/audit');
}

function sanitizeDocument(document: OpenAPIObject): void {
  for (const schema of Object.values(document.components?.schemas ?? {})) {
    sanitizeSchema(schema);
  }
}

function sanitizeSchema(schema: unknown): void {
  if (!schema || typeof schema !== 'object') {
    return;
  }

  const schemaRecord = schema as {
    properties?: Record<string, unknown>;
    items?: unknown;
    example?: unknown;
    default?: unknown;
    writeOnly?: boolean;
  };

  for (const [propertyName, propertySchema] of Object.entries(schemaRecord.properties ?? {})) {
    if (!propertySchema || typeof propertySchema !== 'object') {
      continue;
    }

    const propertyRecord = propertySchema as {
      example?: unknown;
      default?: unknown;
      writeOnly?: boolean;
      properties?: Record<string, unknown>;
      items?: unknown;
    };

    if (SENSITIVE_FIELD_PATTERN.test(propertyName)) {
      delete propertyRecord.example;
      delete propertyRecord.default;
      propertyRecord.writeOnly = true;
    }

    sanitizeSchema(propertyRecord);
  }

  if (schemaRecord.items) {
    sanitizeSchema(schemaRecord.items);
  }
}