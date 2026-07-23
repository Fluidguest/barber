import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

/**
 * Seed de demonstração. Roda como DONO do banco (DIRECT_URL) — superusuário
 * bypassa a RLS, então consegue inserir dados de um tenant livremente.
 *
 * ATENÇÃO: limpa TODOS os tenants antes de recriar o demo (uso de dev).
 */
const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL } },
});

async function main() {
  console.log('Limpando dados existentes...');
  await prisma.$executeRawUnsafe('TRUNCATE tenants RESTART IDENTITY CASCADE');

  console.log('Planos da plataforma...');
  const starter = await prisma.plan.upsert({
    where: { slug: 'starter' },
    update: {},
    create: { name: 'Starter', slug: 'starter', priceCents: 4900, interval: 'MONTHLY', maxUsers: 5, maxUnits: 1 },
  });
  await prisma.plan.upsert({
    where: { slug: 'pro' },
    update: {},
    create: { name: 'Pro', slug: 'pro', priceCents: 9900, interval: 'MONTHLY', maxUsers: 20, maxUnits: 3 },
  });
  // Mesmos limites do Pro, com desconto por fidelidade no ciclo maior.
  await prisma.plan.upsert({
    where: { slug: 'pro-trimestral' },
    update: {},
    create: { name: 'Pro Trimestral', slug: 'pro-trimestral', priceCents: 26700, interval: 'QUARTERLY', maxUsers: 20, maxUnits: 3 },
  });
  await prisma.plan.upsert({
    where: { slug: 'pro-semestral' },
    update: {},
    create: { name: 'Pro Semestral', slug: 'pro-semestral', priceCents: 50400, interval: 'SEMIANNUAL', maxUsers: 20, maxUnits: 3 },
  });
  await prisma.plan.upsert({
    where: { slug: 'pro-anual' },
    update: {},
    create: { name: 'Pro Anual', slug: 'pro-anual', priceCents: 95000, interval: 'YEARLY', maxUsers: 20, maxUnits: 3 },
  });

  console.log('Criando barbearia demo...');
  const tenant = await prisma.tenant.create({
    data: { name: 'Barbearia Demo', slug: 'demo', status: 'ACTIVE' },
  });
  const t = tenant.id;

  const trialEndsAt = new Date(Date.now() + 14 * 86_400_000);
  await prisma.subscription.create({
    data: { tenantId: t, planId: starter.id, status: 'ACTIVE', trialEndsAt, currentPeriodEnd: trialEndsAt, externalId: 'mp_fake_demo' },
  });

  const unit = await prisma.unit.create({
    data: { tenantId: t, name: 'Matriz', timezone: 'America/Sao_Paulo' },
  });

  const passwordHash = await argon2.hash('demo1234');
  await prisma.user.createMany({
    data: [
      { tenantId: t, name: 'Admin Demo', email: 'admin@demo.com', passwordHash, role: 'ADMIN' },
      { tenantId: t, name: 'Recepção', email: 'recepcao@demo.com', passwordHash, role: 'RECEPTION' },
    ],
  });

  console.log('Serviços...');
  const catCabelo = await prisma.serviceCategory.create({
    data: { tenantId: t, name: 'Cabelo' },
  });
  const [corte, barba, combo, pezinho] = await Promise.all([
    prisma.service.create({ data: { tenantId: t, categoryId: catCabelo.id, name: 'Corte', durationMin: 30, priceCents: 5000 } }),
    prisma.service.create({ data: { tenantId: t, categoryId: catCabelo.id, name: 'Barba', durationMin: 20, priceCents: 3500 } }),
    prisma.service.create({ data: { tenantId: t, categoryId: catCabelo.id, name: 'Corte + Barba', durationMin: 45, priceCents: 7500 } }),
    prisma.service.create({ data: { tenantId: t, name: 'Pezinho', durationMin: 10, priceCents: 1500 } }),
  ]);

  console.log('Barbeiros + jornada...');
  const weekdays = [1, 2, 3, 4, 5]; // seg a sex
  const joao = await prisma.barber.create({
    data: {
      tenantId: t,
      unitId: unit.id,
      name: 'João',
      phone: '11999990001',
      specialties: { create: [corte, barba, combo, pezinho].map((s) => ({ tenantId: t, serviceId: s.id })) },
      schedules: { create: weekdays.map((w) => ({ tenantId: t, weekday: w, startTime: '09:00', endTime: '18:00' })) },
    },
  });
  const pedro = await prisma.barber.create({
    data: {
      tenantId: t,
      unitId: unit.id,
      name: 'Pedro',
      phone: '11999990002',
      specialties: { create: [corte, combo].map((s) => ({ tenantId: t, serviceId: s.id })) },
      schedules: { create: weekdays.map((w) => ({ tenantId: t, weekday: w, startTime: '10:00', endTime: '19:00' })) },
    },
  });

  console.log('Regras de comissão...');
  await prisma.commissionRule.createMany({
    data: [
      { tenantId: t, type: 'PERCENT', value: 4000 }, // padrão 40%
      { tenantId: t, barberId: joao.id, type: 'PERCENT', value: 5000 }, // João 50%
    ],
  });

  console.log('Clientes...');
  const clients = await Promise.all(
    ['Carlos Silva', 'Marcos Souza', 'André Lima', 'Rafael Costa', 'Bruno Alves'].map((name, i) =>
      prisma.client.create({
        data: { tenantId: t, name, phone: `1198888000${i}`, whatsapp: `1198888000${i}` },
      }),
    ),
  );

  console.log('Caixa aberto + agenda de hoje...');
  const admin = await prisma.user.findFirst({ where: { tenantId: t, role: 'ADMIN' }, select: { id: true } });
  const session = await prisma.cashSession.create({
    data: { tenantId: t, unitId: unit.id, openedById: admin!.id, status: 'OPEN', openingCents: 10000 },
  });

  // Data LOCAL (SP) de hoje — mesma referência que o dashboard usa.
  const spToday = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const [y, mo, da] = spToday.split('-').map(Number);
  // 13:00 UTC = 10:00 local (SP, UTC-3) => cai no dia local de hoje.
  const utc = (h: number, min: number) => new Date(Date.UTC(y, mo - 1, da, h, min, 0));
  const periodRef = spToday.slice(0, 7);

  await prisma.appointment.createMany({
    data: [
      { tenantId: t, unitId: unit.id, clientId: clients[0].id, barberId: joao.id, serviceId: corte.id, startAt: utc(13, 0), endAt: utc(13, 30), priceCents: 5000, status: 'CONFIRMED' },
      { tenantId: t, unitId: unit.id, clientId: clients[1].id, barberId: joao.id, serviceId: combo.id, startAt: utc(14, 0), endAt: utc(14, 45), priceCents: 7500, status: 'SCHEDULED' },
      { tenantId: t, unitId: unit.id, clientId: clients[2].id, barberId: pedro.id, serviceId: corte.id, startAt: utc(13, 0), endAt: utc(13, 30), priceCents: 5000, status: 'SCHEDULED' },
    ],
  });

  console.log('Uma comanda paga (para o dashboard)...');
  const sale = await prisma.sale.create({
    data: {
      tenantId: t, unitId: unit.id, cashSessionId: session.id,
      clientId: clients[3].id, barberId: joao.id, status: 'PAID', totalCents: 5000,
    },
  });
  const item = await prisma.saleItem.create({
    data: { tenantId: t, saleId: sale.id, serviceId: corte.id, barberId: joao.id, description: 'Corte', quantity: 1, unitPriceCents: 5000, totalCents: 5000 },
  });
  await prisma.payment.create({
    data: { tenantId: t, saleId: sale.id, method: 'CASH', amountCents: 5000 },
  });
  await prisma.commissionEntry.create({
    data: { tenantId: t, barberId: joao.id, saleId: sale.id, saleItemId: item.id, baseCents: 5000, amountCents: 2500, status: 'PENDING', periodRef },
  });

  console.log('Financeiro (categorias + lançamentos)...');
  const catAluguel = await prisma.financeCategory.create({ data: { tenantId: t, name: 'Aluguel', kind: 'EXPENSE' } });
  const catProdutos = await prisma.financeCategory.create({ data: { tenantId: t, name: 'Produtos', kind: 'EXPENSE' } });
  await prisma.financeCategory.create({ data: { tenantId: t, name: 'Serviços', kind: 'INCOME' } });
  const endOfMonth = new Date(Date.UTC(y, mo - 1, 28));
  await prisma.financeEntry.createMany({
    data: [
      { tenantId: t, type: 'PAYABLE', description: 'Aluguel do mês', amountCents: 250000, dueDate: endOfMonth, status: 'PENDING', categoryId: catAluguel.id },
      { tenantId: t, type: 'PAYABLE', description: 'Compra de produtos', amountCents: 80000, dueDate: utc(0, 0), status: 'PAID', paidAt: utc(0, 0), method: 'PIX', categoryId: catProdutos.id },
      { tenantId: t, type: 'RECEIVABLE', description: 'Pacote mensal - cliente fidelidade', amountCents: 15000, dueDate: endOfMonth, status: 'PENDING' },
    ],
  });

  console.log('Estoque (produtos + movimentações)...');
  const prods = [
    { name: 'Pomada Modeladora', barcode: '7890001', brand: 'BarberPro', costCents: 1800, priceCents: 3500, stockCurrent: 12, stockMin: 4 },
    { name: 'Óleo para Barba', barcode: '7890002', brand: 'BarberPro', costCents: 2200, priceCents: 4500, stockCurrent: 3, stockMin: 5 }, // baixo estoque
    { name: 'Shampoo Anticaspa', barcode: '7890003', brand: 'CleanHair', costCents: 1500, priceCents: 2900, stockCurrent: 20, stockMin: 6 },
  ];
  for (const p of prods) {
    const prod = await prisma.product.create({ data: { tenantId: t, unit: 'un', ...p } });
    await prisma.stockMovement.create({
      data: { tenantId: t, productId: prod.id, type: 'IN', quantity: p.stockCurrent, reason: 'compra', unitCostCents: p.costCents, notes: 'Estoque inicial' },
    });
  }

  console.log('WhatsApp (conversa demo)...');
  const convo = await prisma.whatsAppConversation.create({
    data: {
      tenantId: t, clientId: clients[0].id, contactPhone: '5511988880001',
      contactName: 'Carlos Silva', unreadCount: 1,
      lastMessageAt: utc(15, 30), lastPreview: 'Perfeito, confirmado!',
    },
  });
  await prisma.whatsAppMessage.createMany({
    data: [
      { tenantId: t, conversationId: convo.id, direction: 'OUTBOUND', type: 'REMINDER', contentType: 'TEXT', body: 'Olá Carlos! Lembrete do seu horário amanhã às 10h. Confirma?', status: 'DELIVERED', sentAt: utc(15, 0) },
      { tenantId: t, conversationId: convo.id, direction: 'INBOUND', type: 'FREE_TEXT', contentType: 'TEXT', body: 'Perfeito, confirmado!', status: 'DELIVERED', createdAt: utc(15, 30) },
    ],
  });

  console.log('\n✅ Seed concluído.');
  console.log('   Login:  slug=demo  email=admin@demo.com  senha=demo1234');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
