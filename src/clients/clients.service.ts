import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { encryptField, decryptField } from '../common/crypto.util';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';

const DETAIL = {
  id: true,
  name: true,
  phone: true,
  whatsapp: true,
  email: true,
  document: true,
  birthDate: true,
  instagram: true,
  origin: true,
  notes: true,
  address: true,
  createdAt: true,
} satisfies Prisma.ClientSelect;

const LIST = {
  id: true,
  name: true,
  phone: true,
  whatsapp: true,
  email: true,
  createdAt: true,
} satisfies Prisma.ClientSelect;

@Injectable()
export class ClientsService {
  constructor(private readonly prisma: PrismaService) {}

  create(tenantId: string, dto: CreateClientDto) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const c = await tx.client.create({
        data: { tenantId, ...toData(dto), name: dto.name },
        select: DETAIL,
      });
      return decode(c);
    });
  }

  list(tenantId: string, search?: string) {
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.client.findMany({
        where: {
          deletedAt: null,
          ...(search
            ? {
                OR: [
                  { name: { contains: search, mode: 'insensitive' } },
                  { phone: { contains: search } },
                  { whatsapp: { contains: search } },
                  { email: { contains: search, mode: 'insensitive' } },
                ],
              }
            : {}),
        },
        orderBy: { name: 'asc' },
        select: LIST,
      }),
    );
  }

  async get(tenantId: string, id: string) {
    const client = await this.prisma.withTenant(tenantId, (tx) =>
      tx.client.findFirst({ where: { id, deletedAt: null }, select: DETAIL }),
    );
    if (!client) throw new NotFoundException('Cliente não encontrado');
    return decode(client);
  }

  update(tenantId: string, id: string, dto: UpdateClientDto) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const exists = await tx.client.findFirst({
        where: { id, deletedAt: null },
        select: { id: true },
      });
      if (!exists) throw new NotFoundException('Cliente não encontrado');
      const c = await tx.client.update({
        where: { id },
        data: toData(dto),
        select: DETAIL,
      });
      return decode(c);
    });
  }

  async remove(tenantId: string, id: string) {
    await this.prisma.withTenant(tenantId, async (tx) => {
      const exists = await tx.client.findFirst({
        where: { id, deletedAt: null },
        select: { id: true },
      });
      if (!exists) throw new NotFoundException('Cliente não encontrado');
      await tx.client.update({ where: { id }, data: { deletedAt: new Date() } });
    });
    return { deleted: true };
  }
}

/** Mapeia o DTO para o Prisma. O CPF é CIFRADO em repouso (LGPD). */
function toData(dto: CreateClientDto | UpdateClientDto) {
  return {
    name: dto.name,
    phone: dto.phone,
    whatsapp: dto.whatsapp,
    email: dto.email,
    document: dto.document ? encryptField(dto.document) : undefined,
    birthDate: dto.birthDate ? new Date(dto.birthDate) : undefined,
    instagram: dto.instagram,
    origin: dto.origin,
    notes: dto.notes,
    address: dto.address as Prisma.InputJsonValue | undefined,
  };
}

/** Decifra o CPF antes de devolver ao cliente da API. */
function decode<T extends { document?: string | null }>(client: T): T {
  return { ...client, document: decryptField(client.document) };
}
