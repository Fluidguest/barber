import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

const SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  isActive: true,
  totpEnabled: true,
  lastLoginAt: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  list(tenantId: string) {
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.user.findMany({
        where: { deletedAt: null },
        orderBy: { name: 'asc' },
        select: SELECT,
      }),
    );
  }

  create(tenantId: string, dto: CreateUserDto) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const existing = await tx.user.findUnique({
        where: { tenantId_email: { tenantId, email: dto.email } },
        select: { id: true, deletedAt: true },
      });
      if (existing && !existing.deletedAt) {
        throw new ConflictException('Já existe um usuário com este e-mail');
      }
      const passwordHash = await argon2.hash(dto.password);
      return tx.user.create({
        data: {
          tenantId,
          name: dto.name,
          email: dto.email,
          passwordHash,
          role: dto.role,
          isActive: true,
        },
        select: SELECT,
      });
    });
  }

  update(
    tenantId: string,
    actingUserId: string,
    id: string,
    dto: UpdateUserDto,
  ) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const target = await tx.user.findFirst({
        where: { id, deletedAt: null },
        select: { id: true, role: true },
      });
      if (!target) throw new NotFoundException('Usuário não encontrado');

      const losesAdmin =
        target.role === 'ADMIN' &&
        ((dto.role && dto.role !== 'ADMIN') || dto.isActive === false);
      if (losesAdmin) await assertNotLastAdmin(tx, id);

      if (id === actingUserId && dto.isActive === false) {
        throw new BadRequestException('Você não pode desativar a si mesmo');
      }

      return tx.user.update({
        where: { id },
        data: {
          name: dto.name,
          role: dto.role,
          isActive: dto.isActive,
          passwordHash: dto.password ? await argon2.hash(dto.password) : undefined,
        },
        select: SELECT,
      });
    });
  }

  async remove(tenantId: string, actingUserId: string, id: string) {
    await this.prisma.withTenant(tenantId, async (tx) => {
      const target = await tx.user.findFirst({
        where: { id, deletedAt: null },
        select: { id: true, role: true },
      });
      if (!target) throw new NotFoundException('Usuário não encontrado');
      if (id === actingUserId) {
        throw new BadRequestException('Você não pode remover a si mesmo');
      }
      if (target.role === 'ADMIN') await assertNotLastAdmin(tx, id);

      await tx.user.update({
        where: { id },
        data: { deletedAt: new Date(), isActive: false },
      });
    });
    return { deleted: true };
  }
}

/** Impede rebaixar/remover o ÚLTIMO administrador ativo (evita lockout). */
async function assertNotLastAdmin(tx: Prisma.TransactionClient, excludeId: string) {
  const otherAdmins = await tx.user.count({
    where: {
      role: 'ADMIN',
      isActive: true,
      deletedAt: null,
      id: { not: excludeId },
    },
  });
  if (otherAdmins === 0) {
    throw new BadRequestException(
      'Não é possível remover/rebaixar o último administrador',
    );
  }
}
