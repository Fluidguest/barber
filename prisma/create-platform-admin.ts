/**
 * Cria (ou redefine a senha de) um operador da plataforma.
 *
 * Não existe tela de cadastro para isso de propósito: quem opera o SaaS é
 * criado por quem tem acesso ao servidor, não por auto-cadastro.
 *
 *   npm run platform:admin -- <email> <senha> "<Nome>"
 */
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

async function main() {
  const [email, senha, nome] = process.argv.slice(2);

  if (!email || !senha) {
    console.error(
      'Uso: npm run platform:admin -- <email> <senha> "<Nome>"\n' +
        'Ex.:  npm run platform:admin -- eu@empresa.com "SenhaForte123" "Willker"',
    );
    process.exit(1);
  }
  if (senha.length < 10) {
    console.error('A senha do operador deve ter ao menos 10 caracteres.');
    process.exit(1);
  }

  // Conexão de dono: a tabela é global (não passa por RLS).
  const db = new PrismaClient({
    datasources: { db: { url: process.env.DIRECT_URL } },
  });

  const passwordHash = await argon2.hash(senha);
  const dados = {
    email: email.toLowerCase().trim(),
    name: nome?.trim() || 'Operador',
    passwordHash,
    isActive: true,
  };

  const admin = await db.platformAdmin.upsert({
    where: { email: dados.email },
    create: dados,
    update: { passwordHash, isActive: true },
  });

  console.log(`✔ Operador pronto: ${admin.email} (${admin.name})`);
  console.log('  Acesse o painel em /platform e faça login com esses dados.');
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
