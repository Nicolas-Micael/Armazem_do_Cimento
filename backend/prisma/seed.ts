// Cria o PRIMEIRO administrador do sistema.
//
// Rodar com: npm run db:seed
//
// Lê nome, usuário e senha das variáveis SEED_ADMIN_* do arquivo .env
// (nunca escritos no código). Se já existir algum ADM, não faz nada,
// então é seguro rodar mais de uma vez. A senha é temporária: no
// primeiro login o sistema exige que ela seja trocada.
import "dotenv/config";
import { prisma } from "../src/lib/prisma.js";
import { hashPassword } from "../src/lib/password.js";
import { usernameSchema, passwordSchema } from "../src/modules/users/users.schemas.js";

async function main() {
  const existingAdmins = await prisma.user.count({ where: { role: "ADMIN" } });
  if (existingAdmins > 0) {
    console.log("Já existe um ADM cadastrado. Nada a fazer.");
    return;
  }

  const name = process.env.SEED_ADMIN_NAME?.trim() || "Administrador";
  const username = usernameSchema.safeParse(process.env.SEED_ADMIN_USERNAME);
  const password = passwordSchema.safeParse(process.env.SEED_ADMIN_PASSWORD);

  if (!username.success || !password.success) {
    console.error(
      "Defina SEED_ADMIN_USERNAME (3 a 30 caracteres) e SEED_ADMIN_PASSWORD (mínimo 8 caracteres) no arquivo .env.",
    );
    process.exitCode = 1;
    return;
  }

  const admin = await prisma.user.create({
    data: {
      name,
      username: username.data,
      role: "ADMIN",
      passwordHash: await hashPassword(password.data),
      mustChangePassword: true,
    },
  });
  console.log(`ADM "${admin.username}" criado. No primeiro acesso, o sistema vai pedir uma senha nova.`);
}

main().finally(() => prisma.$disconnect());
