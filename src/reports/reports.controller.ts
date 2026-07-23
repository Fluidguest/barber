import { Controller, Get, Header, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { ReportsService } from './reports.service';
import { AuthUser, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { csvFilename, money, toCsv } from '../common/csv';

@UseGuards(JwtAuthGuard)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('dre')
  dre(
    @CurrentUser() u: AuthUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.reports.dre(u.tenantId, from, to);
  }

  @Get('barbers')
  barbers(
    @CurrentUser() u: AuthUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.reports.barbers(u.tenantId, from, to);
  }

  @Get('products-abc')
  productsAbc(
    @CurrentUser() u: AuthUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.reports.productsAbc(u.tenantId, from, to);
  }

  @Get('inactive-clients')
  inactiveClients(@CurrentUser() u: AuthUser, @Query('days') days?: string) {
    return this.reports.inactiveClients(u.tenantId, normalizeDays(days));
  }

  @Get('inactive-clients.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async inactiveClientsCsv(
    @CurrentUser() u: AuthUser,
    @Res({ passthrough: true }) res: Response,
    @Query('days') days?: string,
  ) {
    const r = await this.reports.inactiveClients(u.tenantId, normalizeDays(days));
    const now = new Date();
    return send(
      res,
      `clientes-inativos-${r.days}d_${now.toISOString().slice(0, 10)}.csv`,
      toCsv(r.rows, [
        { header: 'Cliente', value: (x) => x.name },
        { header: 'Contato', value: (x) => x.phone ?? '' },
        { header: 'Ultimo servico', value: (x) => x.lastServiceAt ?? 'Nunca' },
        { header: 'Dias sem servico', value: (x) => x.daysSince ?? '' },
      ]),
    );
  }

  // ---- Exportação CSV ------------------------------------------------------
  // Mesmos dados das rotas acima, em arquivo. O front baixa via link/botão.

  @Get('dre.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async dreCsv(
    @CurrentUser() u: AuthUser,
    @Res({ passthrough: true }) res: Response,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const r = await this.reports.dre(u.tenantId, from, to);
    // Receitas e despesas numa única planilha, marcadas por tipo.
    const linhas = [
      ...r.income.map((l) => ({ tipo: 'Receita', ...l })),
      ...r.expense.map((l) => ({ tipo: 'Despesa', ...l })),
      { tipo: 'Total', label: 'Receitas', amountCents: r.totalIncomeCents },
      { tipo: 'Total', label: 'Despesas', amountCents: r.totalExpenseCents },
      { tipo: 'Total', label: 'Resultado', amountCents: r.resultCents },
    ];
    return send(
      res,
      csvFilename('dre', r.period.from, r.period.to),
      toCsv(linhas, [
        { header: 'Tipo', value: (l) => l.tipo },
        { header: 'Categoria', value: (l) => l.label },
        { header: 'Valor', value: (l) => money(l.amountCents) },
      ]),
    );
  }

  @Get('barbers.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async barbersCsv(
    @CurrentUser() u: AuthUser,
    @Res({ passthrough: true }) res: Response,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const r = await this.reports.barbers(u.tenantId, from, to);
    return send(
      res,
      csvFilename('barbeiros', r.period.from, r.period.to),
      toCsv(r.rows, [
        { header: 'Barbeiro', value: (x) => x.name },
        { header: 'Atendimentos', value: (x) => x.appointmentsDone },
        { header: 'Faturamento', value: (x) => money(x.revenueCents) },
        { header: 'Comissao', value: (x) => money(x.commissionCents) },
      ]),
    );
  }

  @Get('products-abc.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async productsAbcCsv(
    @CurrentUser() u: AuthUser,
    @Res({ passthrough: true }) res: Response,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const r = await this.reports.productsAbc(u.tenantId, from, to);
    return send(
      res,
      csvFilename('curva-abc', r.period.from, r.period.to),
      toCsv(r.rows, [
        { header: 'Produto', value: (x) => x.name },
        { header: 'Curva', value: (x) => x.curve },
        { header: 'Quantidade', value: (x) => x.quantity },
        { header: 'Faturamento', value: (x) => money(x.revenueCents) },
      ]),
    );
  }
}

/** Anexa o cabeçalho de download e devolve o conteúdo. */
function send(res: Response, filename: string, csv: string): string {
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  return csv;
}

/** Aceita só os períodos pedidos; default 30 dias. */
function normalizeDays(days?: string): number {
  const permitidos = [15, 30, 45, 60, 90];
  const n = Number(days);
  return permitidos.includes(n) ? n : 30;
}
