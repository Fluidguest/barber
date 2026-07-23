import { SetMetadata } from '@nestjs/common';

/** Rotas marcadas continuam acessíveis mesmo com o tenant suspenso/cancelado. */
export const ALLOW_SUSPENDED = 'allow_suspended';
export const AllowSuspended = () => SetMetadata(ALLOW_SUSPENDED, true);
