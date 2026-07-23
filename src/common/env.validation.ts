/**
 * Validação de ambiente no BOOT (fail-fast).
 *
 * Roda no `ConfigModule.forRoot({ validate })`. Se algo essencial faltar ou
 * estiver inseguro, a aplicação **não sobe** — evita rodar em produção com
 * JWT sem segredo, cifragem com chave default, ou banco não configurado.
 *
 * Sem dependência externa (Joi/zod) de propósito: valida com JS puro.
 */

const INSECURE_DEFAULTS = new Set([
  'dev-insecure-key-change-me',
  'troque_por_um_segredo_forte',
  'troque_este_token',
  'CHANGE_ME',
  'changeme',
  'secret',
]);

/** True quando estamos rodando testes (relaxa exigências de força do segredo). */
function isTest(env: Record<string, unknown>): boolean {
  return env.NODE_ENV === 'test' || env.JEST_WORKER_ID !== undefined;
}

function isProd(env: Record<string, unknown>): boolean {
  return env.NODE_ENV === 'production';
}

function fail(errors: string[]): never {
  throw new Error(
    `Configuração de ambiente inválida — a aplicação não pode iniciar:\n` +
      errors.map((e) => `  • ${e}`).join('\n') +
      `\n\nAjuste o .env (veja .env.example) e suba novamente.`,
  );
}

export function validateEnv(config: Record<string, unknown>) {
  const test = isTest(config);
  const prod = isProd(config);

  // Erros duros: SEMPRE bloqueiam o boot (sem isso nada funciona).
  const errors: string[] = [];
  // Avisos de força/segurança: bloqueiam SÓ em produção (fail-fast);
  // em dev/homolog apenas alertam, para não travar o ambiente local.
  const weak: string[] = [];
  // Alertas informativos: NUNCA bloqueiam (dependem da topologia de deploy).
  const advisories: string[] = [];

  const str = (k: string) => {
    const v = config[k];
    return typeof v === 'string' ? v.trim() : '';
  };

  // --- Conexão com o banco (presença = erro duro) --------------------------
  if (!str('DATABASE_URL')) {
    errors.push('DATABASE_URL ausente (conexão de runtime como app_role).');
  }
  if (!str('DIRECT_URL')) {
    errors.push('DIRECT_URL ausente (conexão de dono para migrations/RLS).');
  }

  // --- Segredo do JWT ------------------------------------------------------
  const jwt = str('JWT_SECRET');
  if (!jwt) {
    errors.push('JWT_SECRET ausente — tokens de acesso não podem ser assinados.');
  } else if (!test) {
    if (jwt.length < 32) {
      weak.push('JWT_SECRET curto (recomendado >= 32 caracteres).');
    }
    if (INSECURE_DEFAULTS.has(jwt)) {
      weak.push('JWT_SECRET usa um valor de exemplo inseguro — gere um segredo forte.');
    }
  }

  // --- Chave de cifragem de campos (LGPD) ----------------------------------
  const enc = str('ENCRYPTION_KEY');
  if (!enc) {
    errors.push('ENCRYPTION_KEY ausente — CPF/segredos ficariam em texto puro.');
  } else if (!test) {
    if (enc.length < 32) {
      weak.push('ENCRYPTION_KEY curta (recomendado >= 32 caracteres).');
    }
    if (INSECURE_DEFAULTS.has(enc)) {
      weak.push('ENCRYPTION_KEY usa o valor de exemplo — dados cifrados ficariam vulneráveis.');
    }
  }

  // --- Coerência de provedores (erro duro: quebraria em runtime) -----------
  const wpp = str('WHATSAPP_PROVIDER') || 'fake';
  if (wpp === 'meta' && (!str('META_WHATSAPP_TOKEN') || !str('META_WHATSAPP_PHONE_ID'))) {
    errors.push('WHATSAPP_PROVIDER=meta exige META_WHATSAPP_TOKEN e META_WHATSAPP_PHONE_ID.');
  }
  if (wpp === 'waha' && !str('WAHA_URL')) {
    errors.push('WHATSAPP_PROVIDER=waha exige WAHA_URL.');
  }

  // --- Checagens específicas de PRODUÇÃO ------------------------------------
  // Problemas que passam despercebidos em dev e derrubam o sistema no ar.
  if (prod) {
    const cors = str('CORS_ORIGIN');
    if (!cors) {
      errors.push('CORS_ORIGIN ausente — em produção defina a URL pública do frontend.');
    } else if (cors.includes('localhost') || cors.includes('127.0.0.1')) {
      errors.push('CORS_ORIGIN aponta para localhost — use o domínio real do frontend.');
    }

    // Senhas de exemplo/dev no banco.
    const db = str('DATABASE_URL');
    if (db.includes('app_dev_pw') || db.includes('CHANGE_ME')) {
      errors.push('DATABASE_URL usa a senha de desenvolvimento — defina uma senha forte para app_role.');
    }

    // Cookie cross-site exige HTTPS nas origens (o browser recusa Secure em http).
    const ss = (str('COOKIE_SAMESITE') || 'lax').toLowerCase();
    if (ss === 'none' && cors && cors.includes('http://')) {
      errors.push('COOKIE_SAMESITE=none exige HTTPS — há origem http:// em CORS_ORIGIN.');
    }
    // Frontend em outro domínio + SameSite=lax => o cookie de refresh não viaja.
    // Apenas ADVERTE: com frontend no mesmo domínio (ou atrás do mesmo proxy),
    // `lax` é a escolha correta e não deve bloquear o deploy.
    if (ss === 'lax' && !str('COOKIE_DOMAIN')) {
      advisories.push(
        'COOKIE_SAMESITE=lax: se o frontend estiver em OUTRO domínio que a API, ' +
          'o cookie de refresh não será enviado — use COOKIE_SAMESITE=none (com HTTPS) ' +
          'ou COOKIE_DOMAIN para subdomínios.',
      );
    }
  }

  // Em produção, segredo fraco também é bloqueante.
  if (prod) errors.push(...weak);

  if (errors.length) fail(errors);

  // Fora de produção, segredo fraco apenas alerta (não trava o dev local).
  if (weak.length && !test) {
    // eslint-disable-next-line no-console
    console.warn(
      '\x1b[33m[env] Avisos de segurança (bloqueariam em produção):\x1b[0m\n' +
        weak.map((w) => `  • ${w}`).join('\n'),
    );
  }

  // Alertas de topologia: informam sem impedir o boot (inclusive em produção).
  if (advisories.length && !test) {
    // eslint-disable-next-line no-console
    console.warn(
      '\x1b[36m[env] Atenção à configuração de deploy:\x1b[0m\n' +
        advisories.map((a) => `  • ${a}`).join('\n'),
    );
  }

  return config;
}
