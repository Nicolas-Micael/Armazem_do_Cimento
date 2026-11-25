// Conexão única com o banco de dados.
//
// O PrismaClient mantém um "pool" (grupo) de conexões abertas com o
// PostgreSQL. Criamos só UM cliente para a aplicação inteira e todos os
// módulos importam este mesmo objeto.
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";
import { env } from "../config/env.js";

const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });

export const prisma = new PrismaClient({ adapter });
