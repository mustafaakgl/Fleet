import { SetMetadata } from '@nestjs/common';

export const REQUIRES_WRITE_KEY = 'requiresWrite';
export const WRITE_EXTRA_ROLES_KEY = 'writeExtraRoles';

/**
 * Uc yazma hakki ister.
 *
 * Varsayilan olarak OPERATIONAL_WRITE_ROLES (admin, boss, office) gecerlidir.
 * `extraRoles` ile tek bir uc icin genisletilir — ornegin muhasebenin servis
 * kayitlarini duzenleyebilmesi. Bunu global listeye eklemek muhasebeye gorev,
 * surucu, arac gibi HER SEYDE yazma hakki verirdi; genisletme uc bazinda kalmali.
 */
export const RequiresWrite = (...extraRoles: string[]) => {
  const write = SetMetadata(REQUIRES_WRITE_KEY, true);
  if (extraRoles.length === 0) return write;

  const extras = SetMetadata(WRITE_EXTRA_ROLES_KEY, extraRoles);
  return (target: object, key?: string | symbol, descriptor?: PropertyDescriptor) => {
    write(target as never, key as never, descriptor as never);
    extras(target as never, key as never, descriptor as never);
  };
};
