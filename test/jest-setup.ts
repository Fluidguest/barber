// Desliga o rate limiting por padrão nos testes funcionais (muitas requisições
// do mesmo IP fariam falsos 429). A suíte de segurança liga explicitamente.
process.env.THROTTLE_DISABLED = 'true';
