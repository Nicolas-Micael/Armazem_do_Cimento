# Planejamento da Arquitetura — Sistema de Pedidos do Armazém do Cimento

**Versão:** 1 (rascunho para aprovação) · **Data:** 25/11/2026
**Base:** `Contexto_inicial_01.md` (regras gerais, escrito como um `CLAUDE.md`) + "Continuidade do projeto" enviada por Nicolas em 25/11/2026 (requisitos mais recentes, que prevalecem).

> Como ler este documento: cada seção responde a um item da "Primeira tarefa" (seção 13 dos requisitos). Onde aparece **💡 Por quê?** há uma explicação curta do motivo da decisão, pensada para quem está aprendendo. Onde aparece **❓** há uma pergunta de negócio que ainda precisa de resposta. Nenhuma regra de negócio foi inventada: o que não estava definido virou pergunta (seção 8).

---

## 1. Leitura do arquivo de regras (`CLAUDE.md`)

O arquivo de regras existe, mas **não está na raiz de um projeto**: ele está salvo como `Contexto_inicial_01.md` na pasta de arquivos do projeto. Não existe ainda um `CLAUDE.md` em nenhuma raiz, porque ainda não existe repositório. Li o arquivo inteiro. Os pontos que mais influenciam a arquitetura são:

| Regra do arquivo | Consequência no projeto |
|---|---|
| Preço nunca fixo no código; preço gravado no pedido | Tabela `Product` com preço editável; `OrderItem` guarda cópia do preço |
| Nunca usar ponto flutuante para dinheiro | Coluna `DECIMAL(12,2)` no banco; biblioteca decimal no backend; dinheiro trafega como texto no JSON |
| Histórico financeiro nunca apagado | Sem `DELETE` em pedidos/pagamentos; cancelamento e estorno são mudanças de situação com registro |
| Forma de pagamento ≠ conta de destino | Dois campos separados no pagamento |
| Validação sempre no servidor | Backend valida tudo; a interface só ajuda o usuário |
| Operações com várias alterações devem ser transacionais | Uso de `prisma.$transaction` nos serviços de pedido e pagamento |
| Não presumir integração bancária | Todo recebimento é registrado manualmente |
| Explicar as decisões ao usuário | Documentação em `docs/` e explicações curtas a cada etapa |

Quando o repositório for criado, proponho colocar na raiz um `CLAUDE.md` **atualizado**: o conteúdo do arquivo atual, corrigido com as decisões novas (ver seção 2).

---

## 2. Estado atual do projeto e contradições encontradas

### 2.1 O que existe hoje

- **Nenhum código, repositório, configuração ou banco de dados.** O único material é `Contexto_inicial_01.md` na pasta compartilhada do projeto.
- Não há pasta de projeto conectada no computador do Nicolas nem repositório no GitHub ligado a este projeto. Se já existir algo no seu computador, me avise.

Ou seja: o projeto começa do zero, e não há estrutura existente que conflite com o stack escolhido.

### 2.2 Divergências entre o arquivo antigo e os requisitos novos

Em todos os casos abaixo, **vale o requisito novo**. A coluna "Ação" diz o que muda no `CLAUDE.md` atualizado.

| # | Arquivo antigo | Requisito novo | Ação |
|---|---|---|---|
| 1 | Stack "não definida" (seção 5.1) e lista de pendências (seção 9) | Stack definida: React+TS, Node+Express+TS, PostgreSQL, Prisma | Registrar o stack como decisão aprovada |
| 2 | Status "Em entrega" | Status "Saiu para entrega" | Usar o nome novo |
| 3 | Lista única misturando Pix, dinheiro, cheque, depósito, **Bradesco, Caixa** | Meios (Pix, Dinheiro, Cheque, Depósito) separados de contas (Bradesco, Caixa Econômica, Caixa físico, Carteira de cheques) | Dois cadastros distintos |
| 4 | "Parcelas" genéricas (seção 3.6) | Sem parcelamento tradicional: à vista, 10 dias, 15 dias ou prazo negociado com um ou mais vencimentos | Usar o termo **vencimento**, não "parcela" |
| 5 | Controle de compensação "se houver necessidade" | Obrigatório, com situações Pendente / A compensar / Confirmado / Estornado | Situação obrigatória em todo pagamento |
| 6 | "Não invente hierarquia de permissões" | Dois perfis: ADM e Financeiro | Perfis definidos; permissões finas ainda abertas (seção 8) |
| 7 | Frete e desconto "não definidos" | Frete com valor e modalidade; desconto fixo ou percentual; total = produtos + frete − descontos | Fórmula aprovada; detalhes abertos (seção 8) |

### 2.3 Pontos dos requisitos novos que ainda se sobrepõem ou ficam ambíguos

Não são erros, mas precisam de cuidado para não gerar dados duplicados ou relatórios errados:

1. **"Carteira de cheques" (conta) e "A compensar" (situação).** Um cheque recebido e ainda não depositado aparece nos dois lugares. Se a conta do cheque mudar de "Carteira" para "Bradesco" quando ele for depositado, precisamos registrar essa mudança no histórico. ❓ ver P-PAG-4.
2. **"Financeiro tem as funções de vendedor/atendente"**, mas não há definição escrita do que um atendente pode fazer. A matriz de permissões da seção 3.5 marca com "?" tudo o que depende disso.
3. **Situação "Pendente" do pagamento versus "A compensar".** Para cheque a diferença é clara; para Pix, dinheiro e depósito não está definido quando um pagamento fica "Pendente". ❓ P-PAG-1.
4. **"Estornado" versus "devolução".** Estorno pode significar "o dinheiro nunca chegou" (cheque devolvido) ou "a empresa devolveu o dinheiro ao cliente" (pedido cancelado). São movimentos diferentes para o caixa. ❓ P-CAN-3.
5. **Backup "separado do servidor principal".** Os bancos gerenciados em nuvem normalmente guardam o backup no mesmo provedor. Para cumprir o requisito, o plano inclui uma cópia diária extra em outro serviço de armazenamento (seção 3.7).

---

## 3. Proposta de arquitetura

### 3.1 Visão geral

```
 Navegador (computador ou celular)
 ┌──────────────────────────────┐
 │ FRONTEND  React + TypeScript │  telas, formulários, tabelas
 └──────────────┬───────────────┘
                │ HTTPS, JSON  (ex.: POST /api/orders)
                ▼
 ┌──────────────────────────────┐
 │ BACKEND  Node + Express + TS │  autenticação, permissões,
 │  rotas → controllers →       │  regras de negócio, cálculos,
 │  services → Prisma           │  PDF e Excel
 └──────────────┬───────────────┘
                │ SQL (gerado pelo Prisma)
                ▼
 ┌──────────────────────────────┐        ┌──────────────────────┐
 │ PostgreSQL (gerenciado)      │ ─────▶ │ Armazenamento externo │
 │ fonte oficial dos dados      │ backup │ cópias diárias, 30 d  │
 └──────────────────────────────┘ diário └──────────────────────┘
```

**💡 Por quê três camadas separadas?** O navegador do usuário não é confiável: qualquer pessoa pode alterar o que ele envia. Por isso o frontend só **mostra e coleta** dados, e o backend **decide** (calcula o total, confere a permissão, grava). O banco é a única "verdade". Isso cumpre a regra "validar no servidor" e a regra "permissões no backend, não só escondendo botões".

### 3.2 Como as partes conversam (exemplo prático)

Quando um usuário salva um pedido novo:

1. **Frontend:** o formulário envia `POST /api/orders` com um JSON assim (o preço de cada item **não** é enviado pela tela como verdade; ver P-PED-2):
   ```json
   {
     "customerId": "c1a…",
     "items": [{ "productId": "p9…", "quantity": 40, "unitPrice": "38.90" }],
     "freightAmount": "120.00",
     "discount": { "type": "PERCENTAGE", "value": "5" },
     "paymentTerm": "TERM_15_DAYS",
     "deliveryMode": "DELIVERY"
   }
   ```
   Repare que os valores em dinheiro vão como **texto** (`"38.90"`), não como número. **💡 Por quê?** Em JavaScript, `0.1 + 0.2` dá `0.30000000000000004`. Texto chega intacto e o backend converte para um tipo decimal exato.
2. **Rota (Express):** recebe a requisição em `/api/orders`.
3. **Middlewares:** `authenticate` confere quem está logado; `authorize` confere se o perfil pode criar pedido; `validate` confere o formato dos dados (campos obrigatórios, quantidade > 0).
4. **Controller:** traduz a requisição HTTP em uma chamada simples: `ordersService.create(dados, usuario)`.
5. **Service:** aplica as regras de negócio: busca os produtos, copia os preços, calcula subtotal, desconto e total com aritmética decimal, gera os vencimentos e grava tudo **numa transação** (pedido + itens + vencimentos + histórico de status). Se qualquer parte falhar, nada é gravado.
6. **Prisma → PostgreSQL:** executa os comandos SQL.
7. **Resposta:** o backend devolve o pedido criado (com número legível, ex. `PED-000123`), e a tela mostra o resultado.

### 3.3 Decisões técnicas propostas (dentro do stack aprovado)

Nenhuma substitui o stack; são as bibliotecas e padrões que usaremos com ele. Cada uma será registrada em `docs/decisoes/`.

| Assunto | Proposta | 💡 Por quê |
|---|---|---|
| Organização do repositório | Um único repositório com as pastas `backend/`, `frontend/` e `docs/` | Tudo versionado junto; simples para uma pessoa acompanhar |
| Validação de dados | **Zod** no backend | Declara o formato esperado num só lugar e gera tipos TypeScript |
| Dinheiro | `Decimal` do Prisma (biblioteca decimal.js) + coluna `DECIMAL(12,2)` | Cálculo exato; já vem com o Prisma, sem dependência extra |
| Arredondamento | Duas casas, arredondamento comercial (meio para cima), **somente no fim de cada cálculo** | Evita diferenças de centavos acumuladas. ❓ P-PED-5 confirma a regra |
| Autenticação | Login por e-mail e senha, senha com hash (**argon2** ou **bcrypt**), sessão guardada no servidor e enviada ao navegador em cookie `httpOnly` | Para menos de 10 usuários, sessão é mais simples que JWT, permite "deslogar" alguém na hora e o cookie `httpOnly` não pode ser lido por scripts maliciosos |
| Permissões | Middleware `authorize(...)` em cada rota + checagens nos services (ex.: só ADM cancela) | A regra fica no servidor, como exigido |
| Datas | Instantes em `timestamptz` (UTC); vencimentos como data simples (`DATE`); exibição no fuso `America/Sao_Paulo` | Evita que um vencimento "mude de dia" por causa de fuso horário |
| Concorrência | Campo `version` no pedido (bloqueio otimista) | Se duas pessoas editarem o mesmo pedido ao mesmo tempo, a segunda é avisada em vez de apagar a alteração da primeira |
| Valores derivados | Total pago e saldo **calculados** a partir dos pagamentos, não guardados | Um valor guardado em dois lugares pode ficar diferente; calculando, nunca diverge |
| Valores do contrato | Subtotal, frete, desconto e total **guardados** no pedido | São o que foi combinado com o cliente e precisam ficar congelados |
| Logs | Biblioteca **pino** sem dados pessoais ou financeiros sensíveis | Investigação de erros sem violar a regra de privacidade |
| Segurança HTTP | **helmet**, CORS restrito ao endereço do frontend, limite de tentativas no login | Proteções padrão de baixo custo |
| PDF | Gerado no **backend** (ex.: pdfmake ou pdfkit) | Usa os mesmos dados oficiais; "Imprimir" abre esse PDF |
| Excel | **exceljs** no backend | Exporta exatamente o que está no banco |
| Testes | **Vitest** (regras e cálculos) + **Supertest** (rotas) com banco de teste separado | Testar as regras financeiras é obrigatório pelo arquivo de regras |
| Frontend | **Vite** + **React Router**; chamadas à API com `fetch` em um arquivo próprio; CSS Modules | Poucas dependências e nada "mágico" no começo; podemos adicionar ferramentas quando houver necessidade real |
| Ambiente local | PostgreSQL via **Docker Compose** (ou instalado direto no computador) | Mesmo banco do ambiente real, recriável com um comando. ❓ P-INF-1 |
| Nomes no código | Código (tabelas, variáveis) em **inglês**; telas, mensagens e documentação em **português** | É o padrão das bibliotecas e evita acentos em nomes técnicos. Glossário na seção 5.4. Se preferir tudo em português, dá para mudar agora, antes do primeiro código |

### 3.4 Camadas do backend

Cada módulo (clientes, pedidos, pagamentos…) tem os mesmos quatro tipos de arquivo:

| Arquivo | Responsabilidade | Exemplo |
|---|---|---|
| `*.routes.ts` | Define os endereços e quais middlewares cada um usa | `router.post('/', authorize('ADMIN','FINANCEIRO'), validate(createOrderSchema), controller.create)` |
| `*.controller.ts` | Lê a requisição, chama o service, monta a resposta HTTP | Converte `req.body` e devolve `201 Created` |
| `*.service.ts` | **Regras de negócio** e transações | "Pedido concluído não pode ser editado" |
| `*.schemas.ts` | Formato dos dados de entrada (Zod) | `quantity` inteiro maior que zero |

Funções de cálculo puras (sem banco) ficam separadas, por exemplo `orders.calculations.ts`, para serem testadas facilmente.

**💡 Por quê separar assim?** Se a regra de negócio ficasse dentro da rota, seria preciso subir um servidor para testá-la. Separada no service (e os cálculos em funções puras), ela pode ser testada isoladamente e reaproveitada (por exemplo, pelo gerador de PDF).

### 3.5 Matriz inicial de permissões

✅ = definido nos requisitos · ❌ = definido como proibido · **?** = ainda não definido (pergunta na seção 8)

| Ação | ADM | Financeiro |
|---|---|---|
| Gerenciar usuários | ✅ | ❌ |
| Cadastrar/editar produtos e preços | ✅ | ❌ (só consulta) ❓ P-PRO-1 |
| Cadastrar/editar clientes | ✅ | ? (requisito diz "consultar") ❓ P-CLI-1 |
| Criar e consultar pedidos | ✅ | ✅ |
| Editar pedido Pendente | ✅ | ? ❓ P-PED-6 |
| Editar pedido Confirmado / Em separação | ✅ | ? ❓ P-PED-6 |
| Alterar pedido que saiu para entrega ou concluído | ? ❓ P-PED-7 | ? |
| Mudar status do pedido | ✅ | ? ❓ P-STA-3 |
| Aplicar desconto | ✅ | ? ❓ P-DES-1 |
| Cancelar pedido | ✅ | ? (não aparece na lista) ❓ P-CAN-1 |
| Registrar pagamento | ✅ | ✅ |
| Confirmar compensação de cheque/pagamento | ✅ | ? ❓ P-PAG-5 |
| Estornar pagamento | ✅ | ? ❓ P-PAG-5 |
| Relatórios e painel | ✅ | ? ❓ P-REL-3 |
| Configurações gerais (dados da empresa, contas) | ✅ | ❌ |

### 3.6 Definições dos indicadores financeiros (propostas para confirmar)

O arquivo de regras exige definição clara de cada número. Proposta:

- **Vendido no período:** soma do `total` dos pedidos **não cancelados**, pela data do pedido. ❓ P-REL-1 (data do pedido, da confirmação ou da conclusão?)
- **Recebido no período:** soma dos pagamentos em situação **Confirmado/compensado**, pela data de recebimento/compensação. Cheque a compensar **não** entra (requisito 5).
- **A compensar:** soma dos pagamentos em **A compensar** (aparece separado, nunca somado ao recebido).
- **A receber (saldo em aberto):** total do pedido − pagamentos confirmados − pagamentos a compensar. ❓ P-PAG-6 (o "a compensar" reduz o saldo ou não?)
- **Em atraso:** vencimentos com data anterior a hoje e valor ainda em aberto. ❓ P-PRA-4

### 3.7 Implantação e backup (proposta)

- **Hospedagem:** um serviço de nuvem do tipo "plataforma" (PaaS) para o backend e o frontend, com PostgreSQL gerenciado. Exemplos da categoria: Render, Railway, Fly.io (backend) e Neon, Supabase ou o banco do próprio provedor. A escolha depende de custo e região. ❓ P-INF-2
- **HTTPS:** fornecido pelo provedor, com domínio próprio da empresa se houver. ❓ P-INF-3
- **Backup:** além do backup automático do provedor, uma tarefa agendada diária roda `pg_dump` e envia o arquivo para um armazenamento separado (ex.: Backblaze B2, AWS S3 ou Cloudflare R2), com regra de apagar automaticamente cópias com mais de 30 dias.
- **Restauração:** documento `docs/backup-e-restauracao.md` com o passo a passo, **testado** pelo menos uma vez antes de usar dados reais.
- **Segredos:** senhas do banco e chaves ficam em variáveis de ambiente do provedor, nunca no repositório (o repositório terá só um `.env.example` sem valores reais).

---

## 4. Organização das pastas

**💡 Por quê organizar por módulo (funcionalidade) e não por tipo de arquivo?** Quando você for mexer em "pagamentos", tudo o que importa está na pasta `payments/`, em vez de espalhado em `controllers/`, `services/`, `routes/`. Para um sistema que vai crescendo por módulos, isso facilita a manutenção.

```
armazem-do-cimento/
├── CLAUDE.md                     regras para o Claude (versão atualizada)
├── README.md                     como instalar, rodar e testar
├── docker-compose.yml            PostgreSQL local para desenvolvimento
├── docs/
│   ├── planejamento-arquitetura.md   este documento
│   ├── regras-de-negocio.md          regras confirmadas pelo Nicolas
│   ├── decisoes/                     uma decisão técnica por arquivo (ADR)
│   │   ├── 0001-stack.md
│   │   └── 0002-dinheiro-decimal.md
│   └── backup-e-restauracao.md
│
├── backend/
│   ├── package.json · tsconfig.json · .env.example
│   ├── prisma/
│   │   ├── schema.prisma         modelos do banco (seção 5)
│   │   ├── migrations/           histórico versionado de mudanças no banco
│   │   └── seed.ts               dados iniciais: 1º ADM, contas de recebimento
│   ├── src/
│   │   ├── server.ts             liga o servidor na porta configurada
│   │   ├── app.ts                monta o Express: middlewares e rotas
│   │   ├── config/env.ts         lê e valida as variáveis de ambiente
│   │   ├── lib/
│   │   │   ├── prisma.ts         conexão única com o banco
│   │   │   ├── money.ts          funções de dinheiro (somar, arredondar, formatar)
│   │   │   ├── dates.ts          datas e fuso horário
│   │   │   ├── errors.ts         tipos de erro da aplicação (ex.: NotFoundError)
│   │   │   └── logger.ts
│   │   ├── middlewares/
│   │   │   ├── authenticate.ts   "quem é você?"
│   │   │   ├── authorize.ts      "você pode fazer isso?"
│   │   │   ├── validate.ts       confere o formato dos dados
│   │   │   └── errorHandler.ts   transforma erros em respostas claras
│   │   └── modules/
│   │       ├── auth/             login, logout, sessão
│   │       ├── users/
│   │       ├── customers/
│   │       ├── products/
│   │       ├── orders/
│   │       │   ├── orders.routes.ts
│   │       │   ├── orders.controller.ts
│   │       │   ├── orders.service.ts
│   │       │   ├── orders.schemas.ts
│   │       │   ├── orders.calculations.ts   subtotal, desconto, total
│   │       │   ├── orders.status.ts         transições de status permitidas
│   │       │   └── orders.test.ts
│   │       ├── due-dates/        vencimentos e atrasos
│   │       ├── payments/         pagamentos, cheques, compensação, estorno
│   │       ├── accounts/         contas de recebimento
│   │       ├── reports/          painel e relatórios
│   │       ├── documents/        PDF e Excel
│   │       ├── audit/            registro de alterações
│   │       └── settings/         dados da empresa
│   └── tests/                    utilitários de teste (banco de teste, fábricas)
│
└── frontend/
    ├── package.json · tsconfig.json · vite.config.ts · index.html
    └── src/
        ├── main.tsx              ponto de entrada do React
        ├── App.tsx               layout geral e rotas
        ├── api/
        │   ├── client.ts         função única de chamada ao backend (trata erros e sessão)
        │   ├── orders.ts         funções como getOrders(), createOrder()
        │   └── …
        ├── features/             uma pasta por módulo, espelhando o backend
        │   ├── auth/  customers/  products/  orders/
        │   ├── payments/  dashboard/  reports/  users/
        │   └── (cada uma com pages/ e components/)
        ├── components/           peças reutilizáveis: Button, Table, MoneyInput, StatusBadge
        ├── lib/                  formatMoney (R$ 1.234,56), formatDate (25/11/2026)
        ├── routes/               ProtectedRoute: bloqueia telas sem login
        └── styles/
```

---

## 5. Modelos iniciais do banco (PostgreSQL + Prisma)

### 5.1 Diagrama dos relacionamentos

```
User ──< Order >── Customer
           │
           ├──< OrderItem >── Product
           ├──< OrderStatusHistory
           ├──< DueDate (vencimentos)
           └──< Payment >── ReceivingAccount
                  ├── CheckDetails (0 ou 1, só para cheque)
                  └──< PaymentStatusHistory

AuditLog (registro geral de alterações)   CompanySettings (dados da empresa para o PDF)
```
Legenda: `A ──< B` significa "um A tem vários B".

### 5.2 Rascunho do `schema.prisma`

Este é um **rascunho de modelagem** para discussão, não o arquivo final. Campos marcados com ❓ dependem de respostas da seção 8.

```prisma
// ---------- Enumerações (listas fixas de valores) ----------
enum Role           { ADMIN  FINANCEIRO }
enum OrderStatus    { PENDING  CONFIRMED  PICKING  OUT_FOR_DELIVERY  COMPLETED  CANCELLED }
enum PaymentTerm    { IMMEDIATE  TERM_10_DAYS  TERM_15_DAYS  NEGOTIATED }
enum DeliveryMode   { DELIVERY  PICKUP }
enum DiscountType   { FIXED  PERCENTAGE }
enum PaymentMethod  { PIX  CASH  CHECK  BANK_DEPOSIT }
enum PaymentStatus  { PENDING  CLEARING  CONFIRMED  REVERSED }
enum AccountKind    { BANK  CASH_REGISTER  CHECK_WALLET }

// ---------- Usuários ----------
model User {
  id           String   @id @default(uuid())
  name         String
  username     String   @unique      // login por nome de usuário (P-USU-1)
  passwordHash String                         // nunca a senha em texto
  role         Role
  active       Boolean  @default(true)        // desativar em vez de apagar
  createdAt    DateTime @default(now()) @db.Timestamptz(3)
  updatedAt    DateTime @updatedAt     @db.Timestamptz(3)
}

// ---------- Cadastros ----------
model Customer {
  id         String   @id @default(uuid())
  name       String                           // nome ou razão social
  document   String?  @unique                 // CPF/CNPJ só com dígitos ❓ P-CLI-2
  phone      String?
  street     String?
  number     String?
  district   String?
  city       String?
  state      String?  @db.Char(2)
  zipCode    String?
  notes      String?
  active     Boolean  @default(true)
  orders     Order[]
  createdAt  DateTime @default(now()) @db.Timestamptz(3)
  updatedAt  DateTime @updatedAt     @db.Timestamptz(3)
}

model Product {
  id           String   @id @default(uuid())
  name         String
  brand        String?
  cementType   String?                         // ex.: CP II, CP V ❓ P-PRO-2
  unit         String   @default("SACO")
  currentPrice Decimal  @db.Decimal(12, 2)     // preço atual de tabela
  active       Boolean  @default(true)
  orderItems   OrderItem[]
  createdAt    DateTime @default(now()) @db.Timestamptz(3)
  updatedAt    DateTime @updatedAt     @db.Timestamptz(3)
}

model ReceivingAccount {                       // Bradesco, Caixa, Caixa físico, Carteira de cheques
  id       String      @id @default(uuid())
  name     String      @unique
  kind     AccountKind
  active   Boolean     @default(true)
  payments Payment[]
}

// ---------- Pedido ----------
model Order {
  id                  String       @id @default(uuid())
  number              Int          @unique @default(autoincrement())  // exibido como PED-000123 ❓ P-PED-1
  customerId          String
  customer            Customer     @relation(fields: [customerId], references: [id])
  customerNameSnapshot String                   // nome do cliente na data do pedido ❓ P-PED-3
  status              OrderStatus  @default(PENDING)

  subtotal            Decimal      @db.Decimal(12, 2)   // soma dos itens
  freightAmount       Decimal      @db.Decimal(12, 2) @default(0)
  discountType        DiscountType?
  discountValue       Decimal?     @db.Decimal(12, 2)   // o que foi digitado: R$ 50,00 ou 5%
  discountAmount      Decimal      @db.Decimal(12, 2) @default(0)  // desconto em reais já calculado
  total               Decimal      @db.Decimal(12, 2)   // subtotal + frete − desconto

  paymentTerm         PaymentTerm                         // condição acordada na venda
  deliveryMode        DeliveryMode
  deliveryAddress     String?
  deliveryResponsible String?                            // ❓ P-ENT-2 texto livre ou cadastro?
  expectedDeliveryDate DateTime?   @db.Date
  deliveredAt         DateTime?    @db.Timestamptz(3)
  deliveryNotes       String?
  notes               String?

  createdById         String
  createdBy           User         @relation("OrderCreatedBy", fields: [createdById], references: [id])
  cancelledAt         DateTime?    @db.Timestamptz(3)
  cancelledById       String?
  cancelReason        String?                            // obrigatório ao cancelar
  version             Int          @default(1)            // bloqueio otimista

  items               OrderItem[]
  statusHistory       OrderStatusHistory[]
  dueDates            DueDate[]
  payments            Payment[]
  createdAt           DateTime     @default(now()) @db.Timestamptz(3)
  updatedAt           DateTime     @updatedAt     @db.Timestamptz(3)

  @@index([customerId])
  @@index([status])
  @@index([createdAt])
}

model OrderItem {
  id                String   @id @default(uuid())
  orderId           String
  order             Order    @relation(fields: [orderId], references: [id])
  productId         String
  product           Product  @relation(fields: [productId], references: [id])
  productNameSnapshot String                        // nome do produto na data do pedido
  quantity          Int                             // sacos; > 0 ❓ P-PED-4
  catalogUnitPrice  Decimal  @db.Decimal(12, 2)    // preço de tabela no momento
  unitPrice         Decimal  @db.Decimal(12, 2)    // preço efetivamente praticado
  lineTotal         Decimal  @db.Decimal(12, 2)    // quantity × unitPrice
}

model OrderStatusHistory {
  id          String       @id @default(uuid())
  orderId     String
  order       Order        @relation(fields: [orderId], references: [id])
  fromStatus  OrderStatus?                         // vazio na criação
  toStatus    OrderStatus
  changedById String
  changedAt   DateTime     @default(now()) @db.Timestamptz(3)
  note        String?                              // motivo, se houver
  @@index([orderId])
}

// ---------- Vencimentos (a prazo) ----------
model DueDate {
  id           String    @id @default(uuid())
  orderId      String
  order        Order     @relation(fields: [orderId], references: [id])
  sequence     Int                                 // 1º, 2º vencimento…
  dueDate      DateTime  @db.Date
  amount       Decimal   @db.Decimal(12, 2)
  createdById  String
  createdAt    DateTime  @default(now()) @db.Timestamptz(3)
  supersededAt DateTime? @db.Timestamptz(3)       // substituído por renegociação (nunca apagado)
  payments     Payment[]                           // ❓ P-PRA-5 vínculo explícito ou automático?
  @@index([orderId])
  @@index([dueDate])
}

// ---------- Pagamentos ----------
model Payment {
  id          String        @id @default(uuid())
  orderId     String                              // ❓ P-PAG-3 um pagamento para vários pedidos?
  order       Order         @relation(fields: [orderId], references: [id])
  dueDateId   String?
  dueDate     DueDate?      @relation(fields: [dueDateId], references: [id])
  method      PaymentMethod                       // COMO pagou
  accountId   String
  account     ReceivingAccount @relation(fields: [accountId], references: [id])  // ONDE entrou
  amount      Decimal       @db.Decimal(12, 2)
  receivedAt  DateTime      @db.Date              // data do recebimento
  confirmedAt DateTime?     @db.Date              // data da compensação/confirmação
  status      PaymentStatus
  notes       String?
  createdById String
  createdAt   DateTime      @default(now()) @db.Timestamptz(3)
  check       CheckDetails?
  history     PaymentStatusHistory[]
  @@index([orderId])
  @@index([status])
  @@index([receivedAt])
}

model CheckDetails {                             // só existe quando method = CHECK
  paymentId            String   @id
  payment              Payment  @relation(fields: [paymentId], references: [id])
  checkNumber          String
  bankName             String
  expectedClearingDate DateTime @db.Date
  issuerName           String?                    // ❓ P-PAG-7
}

model PaymentStatusHistory {
  id            String         @id @default(uuid())
  paymentId     String
  payment       Payment        @relation(fields: [paymentId], references: [id])
  fromStatus    PaymentStatus?
  toStatus      PaymentStatus
  fromAccountId String?                           // registra troca Carteira → Bradesco
  toAccountId   String?
  changedById   String
  changedAt     DateTime       @default(now()) @db.Timestamptz(3)
  reason        String?                           // obrigatório no estorno
  @@index([paymentId])
}

// ---------- Auditoria e configuração ----------
model AuditLog {                                 // quem mudou o quê, antes e depois
  id         String   @id @default(uuid())
  userId     String
  action     String                              // ex.: "order.update", "product.price_change"
  entityType String
  entityId   String
  before     Json?
  after      Json?
  createdAt  DateTime @default(now()) @db.Timestamptz(3)
  @@index([entityType, entityId])
}

model CompanySettings {                          // uma linha só: dados que saem no PDF
  id        Int     @id @default(1)
  legalName String
  tradeName String?
  cnpj      String?
  phone     String?
  address   String?
}
```

(As relações de volta para `User` em `cancelledById`, `changedById` etc. serão completadas no arquivo final; foram omitidas aqui para facilitar a leitura.)

### 5.3 Explicações das escolhas de modelagem

- **Por que copiar nome e preço do produto no item?** Se o preço do "CP II 50 kg" mudar amanhã, o pedido de hoje precisa continuar mostrando o preço de hoje. Por isso `unitPrice` fica gravado no item. Guardamos também `catalogUnitPrice` (o preço de tabela) para mostrar quando houve negociação.
- **Por que o valor do cheque não aparece em `CheckDetails`?** O valor do cheque é o valor do pagamento (`Payment.amount`), e a situação do cheque é a situação do pagamento (`Payment.status`). Guardar o mesmo dado em dois lugares abriria espaço para os dois ficarem diferentes. `CheckDetails` guarda só o que é exclusivo do cheque.
- **Por que meios de pagamento são uma lista fixa (`enum`) e contas são uma tabela?** O sistema se comporta diferente conforme o meio (cheque exige dados extras), então o meio faz parte do código. Já as contas podem mudar (a empresa pode abrir conta em outro banco), então ficam numa tabela que o ADM edita, sem precisar mudar o código.
- **Por que nenhum `DELETE`?** Pedido cancelado continua no banco com `status = CANCELLED`, data, usuário e motivo. Pagamento estornado continua com `status = REVERSED` e o histórico explica o que aconteceu. Vencimento renegociado recebe `supersededAt` e um novo vencimento é criado. Assim nada some do histórico, como as regras exigem. No banco, as chaves estrangeiras também impedem apagar um cliente que tenha pedidos.
- **Por que tabelas de histórico separadas e também um `AuditLog`?** O histórico de status de pedidos e pagamentos é consultado o tempo todo (aparece na tela do pedido), então merece tabela própria e simples. O `AuditLog` é o registro geral de qualquer edição (preço de produto, dados de cliente, itens de um pedido), consultado só quando alguém precisa investigar.
- **Número do pedido:** o `id` interno é um código aleatório (UUID), difícil de adivinhar; o `number` é sequencial e legível para as pessoas. Observação: sequências do PostgreSQL podem "pular" um número se uma gravação falhar. ❓ P-PED-1 pergunta se isso é aceitável.

### 5.4 Glossário (código em inglês → tela em português)

| Código | Tela | Código | Tela |
|---|---|---|---|
| `Order` | Pedido | `PENDING` (pedido) | Pendente |
| `OrderItem` | Item do pedido | `CONFIRMED` | Confirmado |
| `Customer` | Cliente | `PICKING` | Em separação |
| `Product` | Produto | `OUT_FOR_DELIVERY` | Saiu para entrega |
| `Payment` | Pagamento | `COMPLETED` | Concluído |
| `DueDate` | Vencimento | `CANCELLED` | Cancelado |
| `ReceivingAccount` | Conta de recebimento | `CLEARING` (pagamento) | A compensar |
| `PaymentTerm` | Condição de pagamento | `REVERSED` | Estornado |
| `IMMEDIATE` | À vista | `FREIGHT` | Frete |

---

## 6. Etapas de implementação (ordem proposta)

**💡 Por que esta ordem?** Cada etapa depende da anterior: não dá para registrar um pagamento sem pedido, nem pedido sem cliente e produto, nem nada disso sem login e permissões. As etapas também começam pelo backend de cada módulo (onde ficam as regras) e só depois fazem a tela. Ao fim de cada etapa há algo funcionando e testado.

| # | Etapa | Entrega | O que você aprende | Perguntas que precisam de resposta antes |
|---|---|---|---|---|
| 0 | **Fundação** | Repositório, `CLAUDE.md` atualizado, `README`, `docs/decisoes/` | Git, organização de projeto | P-INF-1, P-INF-4 |
| 1 | **Esqueleto do backend** | Express + TS rodando, rota `/api/health`, tratamento de erros, conexão Prisma + PostgreSQL local, primeira migration, Vitest configurado | Como um servidor recebe requisições; o que é uma migration | — |
| 2 | **Autenticação e usuários** | Login/logout, sessão, hash de senha, perfis ADM/Financeiro, middleware de permissão, cadastro de usuários pelo ADM, seed do primeiro ADM | Autenticação × autorização; por que hash | P-USU-1, P-USU-2 |
| 3 | **Esqueleto do frontend** (✅ entregue junto com a etapa 2) | Vite + React, tela de login, layout com menu, rotas protegidas, cliente da API | Como o React conversa com o backend | — |
| 4 | **Clientes e produtos** | Cadastro, listagem, busca, desativação; auditoria de mudança de preço | CRUD completo da tela ao banco | P-CLI-*, P-PRO-* |
| 5 | **Pedidos (núcleo)** | Criar pedido pendente com itens, cópia de preço, frete, desconto e total calculados no backend; listar; ver detalhe; editar pendente | Transações; cálculo decimal; testes de regra | P-PED-*, P-DES-*, P-ENT-* |
| 6 | **Status, edição e cancelamento** | Fluxo de status com histórico; regras de edição por status e perfil; cancelamento com motivo | Máquina de estados; regras por permissão | P-STA-*, P-CAN-* |
| 7 | **Condições de pagamento e vencimentos** | À vista, 10, 15 dias, negociado com vários vencimentos; renegociação rastreável; atrasos | Datas e fuso horário | P-PRA-* |
| 8 | **Pagamentos, contas e cheques** | Registrar pagamento (meio + conta), situações, compensação, estorno, cheques, histórico, saldo do pedido | Integridade financeira; histórico imutável | P-PAG-*, P-CAN-3 |
| 9 | **Painel e relatórios** | Vendido, recebido, a compensar, a receber, atrasados; recebimentos por meio e por conta; filtros de período | Consultas agregadas (SQL `SUM`, `GROUP BY`) | P-REL-* |
| 10 | **PDF, impressão e Excel** | PDF do pedido, impressão, exportação de pedidos e recebimentos | Geração de arquivos no servidor | P-DOC-* |
| 11 | **Implantação e backup** | Deploy em nuvem com HTTPS, variáveis de ambiente, backup diário externo com retenção de 30 dias, restauração testada e documentada | Ambientes (dev × produção); recuperação de desastres | P-INF-2, P-INF-3, P-INF-5 |
| 12 | **Revisão final** | Revisão de segurança e permissões, testes de ponta a ponta, ajustes de uso com a equipe | Qualidade antes de dados reais | — |

Recomendação: implantar uma versão de teste (sem dados reais) já depois da etapa 6, para a equipe experimentar cedo.

---

## 7. Testes previstos para as regras principais

Cada etapa traz seus testes. Os mais importantes, exigidos pelo arquivo de regras:

- Total = produtos + frete − desconto, com valores decimais (ex.: 3 × R$ 38,90 + R$ 15,50 − 5%).
- Desconto percentual com arredondamento em centavos.
- Mudança de preço do produto não altera pedido antigo.
- Pagamentos parciais e saldo restante; cheque a compensar não conta como recebido.
- Estorno preserva o registro e recalcula o saldo.
- Financeiro recebe erro 403 (proibido) ao tentar ação exclusiva de ADM, chamando a API diretamente.
- Pedido cancelado continua consultável, com motivo e usuário.
- Transição de status inválida é recusada.

---

## 8. Decisões de negócio ainda em aberto (por módulo)

Cada pergunta tem um código para facilitar a resposta (ex.: "P-PED-2: sim"). Onde há uma sugestão, ela está marcada como **sugestão** e só vale depois da sua confirmação.

### Infraestrutura e projeto (bloqueiam a etapa 0–1)
- ~~**P-INF-1**~~ ✅ **Respondida (26/11/2026):** Windows, com Docker Desktop e WSL 2.
- ~~**P-INF-4**~~ ✅ **Respondida (26/11/2026):** repositório `Nicolas-Micael/Armazem_do_Cimento` no GitHub.
- **P-INF-2** Há orçamento mensal definido para hospedagem? Os dados precisam ficar em servidores no Brasil?
- **P-INF-3** A empresa tem (ou quer) um domínio próprio, como `pedidos.armazemdocimento.com.br`?
- **P-INF-5** Quem será o responsável por acompanhar os backups e testar a restauração?

### Usuários e acesso (etapa 2)
- ~~**P-USU-1**~~ ✅ **Respondida (26/11/2026):** login por nome de usuário.
- ~~**P-USU-2**~~ ✅ **Respondida (26/11/2026):** o ADM redefine com uma senha temporária; o funcionário cadastra uma senha nova no próximo acesso.
- **P-USU-3** A sessão deve expirar após quanto tempo? (provisório: 8 horas a partir do login, configurável)

### Clientes (etapa 4)
> Respondidas em 26/11/2026; ver `docs/decisoes/0005-clientes-produtos.md`.
- **P-CLI-1** O Financeiro pode cadastrar e editar clientes, ou apenas consultar?
- **P-CLI-2** CPF/CNPJ é obrigatório? Pode haver cliente sem documento (ex.: venda de balcão)?
- **P-CLI-3** Um cliente pode ter mais de um endereço de entrega (várias obras)?

### Produtos (etapa 4)
> Respondidas em 26/11/2026; ver `docs/decisoes/0005-clientes-produtos.md`.
- **P-PRO-1** Só o ADM altera preços? (a lista do Financeiro diz "consultar produtos")
- **P-PRO-2** Quais informações distinguem os produtos: marca, tipo (CP II, CP III, CP V…), peso do saco?
- **P-PRO-3** Existe preço diferente por cliente ou por quantidade, ou um preço único de tabela?

### Pedidos (etapa 5)
> Leituras provisórias adotadas na etapa 5: ver `docs/decisoes/0006-pedidos.md`.

- **P-PED-1** Formato do número do pedido (ex.: `PED-000123`)? Um número "pulado" por falha técnica é aceitável?
- ✅ **P-PED-2** Respondida (26/11/2026): ADM e Financeiro alteram o preço do item, sem limite e sem motivo; o sistema só registra o valor digitado.
- **P-PED-3** No PDF de um pedido antigo, os dados do cliente devem ser os da época do pedido (sugestão) ou os atuais?
- **P-PED-4** Venda é sempre em sacos inteiros, ou pode haver frações/outras unidades (tonelada, palete)?
- **P-PED-5** Regra de arredondamento: duas casas, arredondamento comercial (meio para cima)?
- **P-PED-6** O que o Financeiro pode alterar em pedidos Pendentes e em pedidos Confirmados/Em separação (itens, quantidades, preços, frete, desconto, condição de pagamento)?
- **P-PED-7** Para pedidos que saíram para entrega ou concluídos, "não alterar livremente" significa: nenhuma alteração, ou só alguns campos (observações, data efetiva de entrega) e só pelo ADM?
- **P-PED-8** Pode haver mais de um pedido aberto para o mesmo cliente? Há limite de crédito? (se não houver regra, o sistema não bloqueia nada)

### Status dos pedidos (etapa 6)
- **P-STA-1** O fluxo é sempre em sequência, ou pode pular etapas? Ex.: pedido de **retirada** vai de "Em separação" direto para "Concluído"?
- **P-STA-2** Pode voltar um status (ex.: de "Saiu para entrega" para "Em separação" se o caminhão voltou)?
- **P-STA-3** Quem pode mudar cada status: os dois perfis ou só o ADM?
- **P-STA-4** O que significa "Concluído": entregue/retirado, independentemente do pagamento? (os requisitos indicam que sim; confirmar)

### Cancelamento e estorno (etapas 6 e 8)
- **P-CAN-1** O Financeiro pode cancelar pedidos? (a lista do perfil não inclui cancelamento)
- **P-CAN-2** Em quais status um pedido pode ser cancelado? Pedido concluído pode ser cancelado?
- **P-CAN-3** Ao cancelar um pedido que já tem pagamento confirmado, o que acontece com o dinheiro: devolução ao cliente (por qual meio e de qual conta?), crédito para um próximo pedido, ou decidido caso a caso? Precisamos registrar a devolução como um movimento de saída?
- **P-CAN-4** Os motivos de cancelamento são texto livre ou uma lista fixa (ex.: "desistência", "erro de lançamento")?

### Frete e entrega (etapa 5)
- **P-ENT-1** O valor do frete é sempre digitado manualmente? Há alguma tabela (por distância, bairro, quantidade)? (sem regra, será manual)
- **P-ENT-2** "Responsável pela entrega" é texto livre ou um cadastro de motoristas/transportadoras?
- **P-ENT-3** Em pedido de retirada, o frete deve ser sempre zero?
- **P-ENT-4** Quem pode alterar o frete depois do pedido confirmado?

### Descontos (etapa 5)
- **P-DES-1** O Financeiro pode dar desconto? Há limite (em % ou R$) por perfil?
- **P-DES-2** Um pedido tem um só desconto geral, ou pode ter desconto por item também?
- **P-DES-3** O desconto percentual incide sobre o valor dos produtos apenas, ou sobre produtos + frete?
- **P-DES-4** É preciso registrar um motivo para o desconto?

### Prazos e vencimentos (etapa 7)
- **P-PRA-1** O prazo de 10 ou 15 dias conta a partir de qual data: criação do pedido, confirmação ou entrega?
- **P-PRA-2** "À vista" significa pagamento no ato do pedido ou na entrega/retirada? Pedido à vista pode ser entregue antes do pagamento?
- **P-PRA-3** No prazo negociado, há limite de dias ou de quantidade de vencimentos? Os valores precisam somar exatamente o total do pedido (sugestão: sim)?
- **P-PRA-4** Quando um pagamento é considerado atrasado: um dia após o vencimento? Há tolerância? Juros ou multa? (sem regra, o sistema só marca como atrasado, sem calcular juros)
- **P-PRA-5** Quando o cliente paga um valor parcial, ele abate o vencimento mais antigo primeiro (sugestão), ou a pessoa escolhe qual vencimento está pagando?
- **P-PRA-6** Se o pedido for editado e o total mudar, os vencimentos são recalculados automaticamente ou alguém ajusta manualmente?

### Pagamentos, contas e cheques (etapa 8)
- **P-PAG-1** Quando um pagamento por Pix, dinheiro ou depósito fica "Pendente" e quando já nasce "Confirmado"? (ex.: Pix informado pelo cliente mas ainda não conferido no extrato)
- **P-PAG-2** Quais combinações de meio e conta são válidas? (ex.: dinheiro → só Caixa físico; Pix → Bradesco ou Caixa Econômica; cheque → Carteira de cheques)
- **P-PAG-3** Um único pagamento (ex.: um cheque) pode cobrir vários pedidos do mesmo cliente? Isso muda o modelo do banco, então é importante saber agora.
- **P-PAG-4** Quando o cheque é depositado, a conta muda de "Carteira de cheques" para o banco onde foi depositado?
- **P-PAG-5** O Financeiro pode confirmar compensações e estornar pagamentos, ou só o ADM?
- **P-PAG-6** O saldo "a receber" do pedido deve descontar os cheques a compensar, ou só os pagamentos confirmados?
- **P-PAG-7** Além de número, banco, valor e datas, é preciso registrar emitente, agência/conta ou se é cheque de terceiros?
- **P-PAG-8** Cheque devolvido (sem fundo) é tratado como "Estornado" e o valor volta para o saldo em aberto? Pode ser reapresentado?
- **P-PAG-9** O sistema deve aceitar pagamento maior que o saldo (troco, crédito para o cliente) ou recusar?
- **P-PAG-10** Pagamentos podem ser registrados para pedidos ainda Pendentes (sinal/adiantamento)?

### Painel e relatórios (etapa 9)
- **P-REL-1** "Vendido no período" deve usar a data do pedido, da confirmação ou da conclusão?
- **P-REL-2** "Recebido" de um cheque usa a data em que foi recebido ou a data da compensação? (sugestão: compensação, porque só então é dinheiro efetivo)
- **P-REL-3** O Financeiro pode ver o painel e os relatórios, ou só o ADM?
- **P-REL-4** Quais relatórios são usados primeiro no dia a dia? (ajuda a priorizar a etapa 9)

### Documentos (etapa 10)
- **P-DOC-1** Quais dados da empresa saem no PDF (razão social, CNPJ, endereço, telefone, logo)?
- **P-DOC-2** O PDF deve ter campo de assinatura de recebimento pelo cliente/motorista?
- **P-DOC-3** Quais colunas devem ter as planilhas exportadas de pedidos e de recebimentos?

---

## 9. Próximo passo

Com este planejamento aprovado, começo pela **etapa 0 (fundação)** e **etapa 1 (esqueleto do backend)**, que não dependem de nenhuma regra de negócio em aberto. Antes de cada etapa, apresento os arquivos que serão criados ou alterados. As perguntas de cada módulo podem ser respondidas aos poucos, até chegarmos à etapa correspondente.
