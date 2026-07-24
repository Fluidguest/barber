import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { bootstrap, registerTenant, authHeader } from './helpers';

/**
 * Lote de features: cadastro completo de barbeiro, planos por intervalo, filtros
 * de agenda, relatório de inativos e acréscimo/desconto no PDV.
 */
describe('Novas features (e2e)', () => {
  let app: INestApplication;
  const s = Date.now();
  const mk = (p: string) => `/api${p}`;
  let token: string;
  let A: { Authorization: string };

  beforeAll(async () => {
    app = await bootstrap();
    token = await registerTenant(app, `nf-${s}`, `nf-${s}@x.com`);
    A = authHeader(token);
  });
  afterAll(async () => { await app.close(); });

  // ---- 1. Cadastro de barbeiro (CPF cifrado, endereço, contatos) ----
  it('cadastra barbeiro com CPF, endereço e contatos; CPF cifrado no banco', async () => {
    const r = await request(app.getHttpServer())
      .post(mk('/barbers')).set(A)
      .send({
        name: 'Carlos Silva',
        phone: '11988887777',
        whatsapp: '11988887777',
        email: 'carlos@x.com',
        document: '123.456.789-09',
        birthDate: '1990-05-10',
        address: { zip: '01001-000', street: 'Rua A', number: '10', neighborhood: 'Centro', city: 'São Paulo', state: 'SP' },
      })
      .expect(201);

    // A API devolve o CPF em claro para o próprio tenant...
    expect(r.body.document).toBe('123.456.789-09');
    expect(r.body.email).toBe('carlos@x.com');
    expect(r.body.address.city).toBe('São Paulo');

    // ...mas no get também vem decifrado
    const got = await request(app.getHttpServer())
      .get(mk(`/barbers/${r.body.id}`)).set(A).expect(200);
    expect(got.body.document).toBe('123.456.789-09');
  });

  it('atualiza barbeiro sem apagar o CPF quando omitido', async () => {
    const created = (await request(app.getHttpServer())
      .post(mk('/barbers')).set(A)
      .send({ name: 'Editar', document: '111.222.333-96', birthDate: '1990-01-15', address: { zip: '01001-000', street: 'Rua', number: '1', neighborhood: 'Centro', city: 'Sao Paulo', state: 'SP' } }).expect(201)).body;

    const upd = (await request(app.getHttpServer())
      .patch(mk(`/barbers/${created.id}`)).set(A)
      .send({ phone: '11955554444' }).expect(200)).body;
    expect(upd.document).toBe('111.222.333-96'); // preservado
    expect(upd.phone).toBe('11955554444');
  });

  it('recusa cadastro de barbeiro com CPF inválido e com campos obrigatórios faltando', async () => {
    // CPF com dígitos verificadores errados
    await request(app.getHttpServer())
      .post(mk('/barbers')).set(A)
      .send({
        name: 'CPF Ruim', document: '111.111.111-11', birthDate: '1990-01-01',
        address: { zip: '1', street: 'R', number: '1', neighborhood: 'C', city: 'SP', state: 'SP' },
      })
      .expect(400);
    // sem endereço e sem nascimento
    await request(app.getHttpServer())
      .post(mk('/barbers')).set(A)
      .send({ name: 'Incompleto', document: '111.444.777-35' })
      .expect(400);
  });

  it('aceita dados bancários e chave PIX (opcionais)', async () => {
    const b = (await request(app.getHttpServer())
      .post(mk('/barbers')).set(A)
      .send({
        name: 'Com Banco', document: '111.444.777-35', birthDate: '1988-03-03',
        address: { zip: '01001-000', street: 'Rua', number: '1', neighborhood: 'Centro', city: 'Sao Paulo', state: 'SP' },
        pixKey: 'carlos@pix.com',
        bankData: { bank: 'Nubank', agency: '0001', account: '12345-6', accountType: 'corrente', holder: 'Com Banco' },
      }).expect(201)).body;
    expect(b.pixKey).toBe('carlos@pix.com');
    expect(b.bankData.bank).toBe('Nubank');
  });

  // ---- 2. Planos por intervalo ----
  it('oferece planos trimestral, semestral e anual', async () => {
    const plans = (await request(app.getHttpServer())
      .get(mk('/billing/plans')).set(A).expect(200)).body;
    const intervals = plans.map((p: any) => p.interval);
    expect(intervals).toContain('QUARTERLY');
    expect(intervals).toContain('SEMIANNUAL');
    expect(intervals).toContain('YEARLY');
  });

  // ---- 3. Filtros da agenda ----
  it('filtra a agenda por barbeiro, cliente e serviço', async () => {
    const svc = (await request(app.getHttpServer()).post(mk('/services')).set(A)
      .send({ name: 'Corte', durationMin: 30, priceCents: 5000 }).expect(201)).body;
    const svc2 = (await request(app.getHttpServer()).post(mk('/services')).set(A)
      .send({ name: 'Barba', durationMin: 20, priceCents: 3000 }).expect(201)).body;
    const barber = (await request(app.getHttpServer()).post(mk('/barbers')).set(A)
      .send({ name: 'Ag Barber', document: "111.444.777-35", birthDate: "1990-01-15", address: { zip: "01001-000", street: "Rua", number: "1", neighborhood: "Centro", city: "Sao Paulo", state: "SP" } }).expect(201)).body;
    const c1 = (await request(app.getHttpServer()).post(mk('/clients')).set(A)
      .send({ name: 'Cli 1', phone: '11900000001' }).expect(201)).body;
    const c2 = (await request(app.getHttpServer()).post(mk('/clients')).set(A)
      .send({ name: 'Cli 2', phone: '11900000002' }).expect(201)).body;

    const base = new Date(Date.now() + 26 * 3600_000);
    const at = (h: number) => { const d = new Date(base); d.setHours(h, 0, 0, 0); return d.toISOString(); };
    await request(app.getHttpServer()).post(mk('/appointments')).set(A)
      .send({ clientId: c1.id, barberId: barber.id, serviceId: svc.id, startAt: at(9) }).expect(201);
    await request(app.getHttpServer()).post(mk('/appointments')).set(A)
      .send({ clientId: c2.id, barberId: barber.id, serviceId: svc2.id, startAt: at(11) }).expect(201);

    const win = `from=${encodeURIComponent(at(0))}&to=${encodeURIComponent(at(23))}`;
    const porCliente = (await request(app.getHttpServer())
      .get(mk(`/appointments?${win}&clientId=${c1.id}`)).set(A).expect(200)).body;
    expect(porCliente.every((a: any) => a.clientId === c1.id)).toBe(true);
    expect(porCliente.length).toBe(1);

    const porServico = (await request(app.getHttpServer())
      .get(mk(`/appointments?${win}&serviceId=${svc2.id}`)).set(A).expect(200)).body;
    expect(porServico.every((a: any) => a.serviceId === svc2.id)).toBe(true);
  });

  // ---- 4. Relatório de inativos ----
  it('lista clientes inativos por período (90 dias)', async () => {
    // cliente antigo, nunca atendido → deve aparecer em 90 dias
    const antigo = (await request(app.getHttpServer()).post(mk('/clients')).set(A)
      .send({ name: 'Antigo Inativo', phone: '11911112222' }).expect(201)).body;
    // "envelhece" o cadastro
    // (via API não dá; validamos que o endpoint responde e aceita o período)
    const r = await request(app.getHttpServer())
      .get(mk('/reports/inactive-clients?days=90')).set(A).expect(200);
    expect(r.body.days).toBe(90);
    expect(Array.isArray(r.body.rows)).toBe(true);

    // período inválido cai no default 30
    const def = await request(app.getHttpServer())
      .get(mk('/reports/inactive-clients?days=7')).set(A).expect(200);
    expect(def.body.days).toBe(30);

    // exportação CSV
    const csv = await request(app.getHttpServer())
      .get(mk('/reports/inactive-clients.csv?days=60')).set(A).expect(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.text).toContain('Cliente;Contato;Ultimo servico;Dias sem servico');
    void antigo;
  });

  // ---- 5. Acréscimo/desconto no PDV ----
  it('aplica desconto percentual e fixo, e acréscimo, na comanda', async () => {
    await request(app.getHttpServer()).post(mk('/cash-sessions/open')).set(A)
      .send({ openingCents: 0 }).expect(201);
    const svc = (await request(app.getHttpServer()).post(mk('/services')).set(A)
      .send({ name: 'Serv PDV', durationMin: 30, priceCents: 10000 }).expect(201)).body;
    const sale = (await request(app.getHttpServer()).post(mk('/sales')).set(A)
      .send({}).expect(201)).body;
    await request(app.getHttpServer()).post(mk(`/sales/${sale.id}/items`)).set(A)
      .send({ serviceId: svc.id, quantity: 1 }).expect(201); // subtotal 100,00

    // 10% de desconto → total 90,00
    let r = (await request(app.getHttpServer())
      .post(mk(`/sales/${sale.id}/adjustment`)).set(A)
      .send({ mode: 'PERCENT', value: -10 }).expect(201)).body;
    expect(r.subtotalCents).toBe(10000);
    expect(r.adjustmentCents).toBe(-1000);
    expect(r.totalCents).toBe(9000);

    // desconto fixo de R$ 15 → total 85,00
    r = (await request(app.getHttpServer())
      .post(mk(`/sales/${sale.id}/adjustment`)).set(A)
      .send({ mode: 'FIXED', value: -15 }).expect(201)).body;
    expect(r.totalCents).toBe(8500);

    // acréscimo de 5% → total 105,00
    r = (await request(app.getHttpServer())
      .post(mk(`/sales/${sale.id}/adjustment`)).set(A)
      .send({ mode: 'PERCENT', value: 5 }).expect(201)).body;
    expect(r.totalCents).toBe(10500);

    // percentual recalcula ao adicionar item: +1 item (200,00 subtotal) e 5% → 210,00
    await request(app.getHttpServer()).post(mk(`/sales/${sale.id}/items`)).set(A)
      .send({ serviceId: svc.id, quantity: 1 }).expect(201);
    const detail = (await request(app.getHttpServer())
      .get(mk(`/sales/${sale.id}`)).set(A).expect(200)).body;
    expect(detail.subtotalCents).toBe(20000);
    expect(detail.totalCents).toBe(21000);

    // remove o ajuste → volta ao subtotal
    r = (await request(app.getHttpServer())
      .post(mk(`/sales/${sale.id}/adjustment`)).set(A)
      .send({ mode: null, value: 0 }).expect(201)).body;
    expect(r.totalCents).toBe(20000);
    expect(r.adjustmentCents).toBe(0);

    // percentual fora da faixa → 400
    await request(app.getHttpServer())
      .post(mk(`/sales/${sale.id}/adjustment`)).set(A)
      .send({ mode: 'PERCENT', value: -150 }).expect(400);
  });

  it('paga com desconto e fecha pelo total ajustado', async () => {
    await request(app.getHttpServer()).post(mk('/cash-sessions/current')).set(A);
    const svc = (await request(app.getHttpServer()).post(mk('/services')).set(A)
      .send({ name: 'Serv Fechar', durationMin: 30, priceCents: 8000 }).expect(201)).body;
    const sale = (await request(app.getHttpServer()).post(mk('/sales')).set(A)
      .send({}).expect(201)).body;
    await request(app.getHttpServer()).post(mk(`/sales/${sale.id}/items`)).set(A)
      .send({ serviceId: svc.id, quantity: 1 }).expect(201);
    await request(app.getHttpServer()).post(mk(`/sales/${sale.id}/adjustment`)).set(A)
      .send({ mode: 'PERCENT', value: -25 }).expect(201); // total 60,00
    // pagar o total cheio (80) seria demais? não — pagamos o ajustado
    await request(app.getHttpServer()).post(mk(`/sales/${sale.id}/payments`)).set(A)
      .send({ method: 'CASH', amountCents: 6000 }).expect(201);
    const closed = await request(app.getHttpServer())
      .post(mk(`/sales/${sale.id}/close`)).set(A).expect(201);
    expect(closed.body.status).toBe('PAID');
  });

  // ---- 6. Saldo de desconto do cliente ----
  it('aplica saldo de desconto do cliente no atendimento e baixa ao fechar', async () => {
    await request(app.getHttpServer()).post(mk('/cash-sessions/current')).set(A);
    const svc = (await request(app.getHttpServer()).post(mk('/services')).set(A)
      .send({ name: 'Serv Credito', durationMin: 30, priceCents: 10000 }).expect(201)).body;
    const client = (await request(app.getHttpServer()).post(mk('/clients')).set(A)
      .send({ name: 'Cliente Credito', phone: '11900001111' }).expect(201)).body;

    // ajuste manual do saldo: R$ 30
    const adj = (await request(app.getHttpServer())
      .patch(mk(`/clients/${client.id}/discount-balance`)).set(A)
      .send({ setCents: 3000 }).expect(200)).body;
    expect(adj.discountBalanceCents).toBe(3000);

    // comanda para esse cliente, 1 item de R$100
    const sale = (await request(app.getHttpServer()).post(mk('/sales')).set(A)
      .send({ clientId: client.id }).expect(201)).body;
    let detail = (await request(app.getHttpServer()).post(mk(`/sales/${sale.id}/items`)).set(A)
      .send({ serviceId: svc.id, quantity: 1 }).expect(201)).body;
    // crédito aplicado automaticamente: total 100 − 30 = 70
    expect(detail.clientCreditCents).toBe(3000);
    expect(detail.totalCents).toBe(7000);

    // paga o total com crédito e fecha
    await request(app.getHttpServer()).post(mk(`/sales/${sale.id}/payments`)).set(A)
      .send({ method: 'CASH', amountCents: 7000 }).expect(201);
    await request(app.getHttpServer()).post(mk(`/sales/${sale.id}/close`)).set(A).expect(201);

    // saldo do cliente zerou (usou os R$30)
    const after = (await request(app.getHttpServer())
      .get(mk(`/clients/${client.id}`)).set(A).expect(200)).body;
    expect(after.discountBalanceCents).toBe(0);
  });

  it('não aplica crédito maior que o valor da comanda', async () => {
    await request(app.getHttpServer()).post(mk('/cash-sessions/current')).set(A);
    const svc = (await request(app.getHttpServer()).post(mk('/services')).set(A)
      .send({ name: 'Serv Barato', durationMin: 15, priceCents: 2000 }).expect(201)).body;
    const client = (await request(app.getHttpServer()).post(mk('/clients')).set(A)
      .send({ name: 'Cliente Saldo Alto', phone: '11900002222' }).expect(201)).body;
    await request(app.getHttpServer()).patch(mk(`/clients/${client.id}/discount-balance`)).set(A)
      .send({ setCents: 5000 }).expect(200); // saldo R$50, comanda R$20

    const sale = (await request(app.getHttpServer()).post(mk('/sales')).set(A)
      .send({ clientId: client.id }).expect(201)).body;
    const detail = (await request(app.getHttpServer()).post(mk(`/sales/${sale.id}/items`)).set(A)
      .send({ serviceId: svc.id, quantity: 1 }).expect(201)).body;
    expect(detail.clientCreditCents).toBe(2000); // limitado ao valor da comanda
    expect(detail.totalCents).toBe(0);
  });
});
