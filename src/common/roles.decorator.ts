import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

/** Restringe a rota aos papéis informados (usado com RolesGuard). */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
