# CLAUDE.md — Sistema de Controle de Pedidos
## Armazém do Cimento

Este arquivo é a fonte principal de instruções para qualquer trabalho realizado neste repositório. Leia-o antes de analisar, planejar, criar ou modificar código.

Se uma solicitação pontual parecer contrariar estas regras, não escolha silenciosamente uma interpretação: explique o conflito e peça esclarecimento quando a decisão puder afetar dados, arquitetura, segurança ou regras de negócio.

---

## 0. Decisões aprovadas (25/11/2026) — prevalecem sobre o restante deste arquivo

Estas decisões foram definidas por Nicolas e substituem qualquer trecho abaixo que diga o contrário. O detalhamento está em `docs/planejamento-arquitetura.md`; as perguntas ainda abertas estão na seção 8 daquele documento (códigos P-XXX-n).

- **Stack:** frontend React + TypeScript; backend Node.js + TypeScript + Express; banco PostgreSQL; ORM Prisma. Não trocar sem justificativa e autorização.
- **Perfis:** apenas ADM e Financeiro. Não criar perfil de vendedor/atendente. Permissões aplicadas no backend.
- **Status do pedido:** Pendente → Confirmado → Em separação → Saiu para entrega → Concluído; e Cancelado. Status operacional independente da situação financeira. Histórico com usuário, data e hora.
- **Condições de pagamento:** à vista; a prazo com prazo fixo de 10 dias, 15 dias ou prazo negociado (um ou mais vencimentos com valores). Não há parcelamento tradicional livre. Use o termo "vencimento".
- **Situação dos pagamentos:** Pendente, A compensar, Confirmado/compensado, Estornado. Cheque não compensado não conta como recebido. Cheque registra número, banco, valor, data de recebimento, data prevista de compensação e situação.
- **Meio de pagamento ≠ conta de destino.** Meios: Pix, Dinheiro, Cheque, Depósito bancário. Contas/destinos: Bradesco, Caixa Econômica Federal, Caixa físico da empresa, Carteira de cheques/recebimentos pendentes.
- **Edição e cancelamento:** pendente edita normalmente; confirmado/em separação conforme permissões; saiu para entrega/concluído não se altera livremente; cancelamento exige motivo, com usuário, data e hora; nada financeiro é excluído definitivamente.
- **Total do pedido:** valor dos produtos + frete − descontos, calculado e validado no backend. Desconto fixo ou percentual, conforme permissões. Frete com modalidade (entrega/retirada), endereço, responsável, datas prevista e efetiva, observações.
- **Documentos:** PDF e impressão do pedido (documento comercial interno, não substitui nota fiscal); exportação de pedidos e recebimentos para Excel.
- **Implantação:** nuvem, HTTPS, backups diários automáticos guardados fora do servidor principal, retenção de 30 dias, restauração documentada.
- **Convenção de nomes:** código (tabelas, variáveis, funções) em inglês; telas, mensagens e documentação em português do Brasil.

---

## 1. Objetivo do projeto

Desenvolver um sistema interno de controle de pedidos para o **Armazém do Cimento**, uma distribuidora de cimento com operação no Brasil.

O sistema deve centralizar o registro e o acompanhamento de pedidos, clientes, itens, valores, pagamentos e recebimentos, oferecendo uma visão confiável da operação e reduzindo controles manuais e informações dispersas.

O sistema é destinado inicialmente a uma equipe pequena, com menos de 10 usuários. Priorize simplicidade, confiabilidade, facilidade de manutenção e possibilidade de evolução. Não crie complexidade de uma aplicação de grande porte sem uma necessidade real.

### Objetivos prioritários

1. Registrar e consultar pedidos.
2. Manter cadastro organizado de clientes.
3. Registrar os produtos e os itens de cada pedido.
4. Acompanhar valores, pagamentos, parcelas e saldos em aberto.
5. Identificar a forma e a conta/canal de recebimento.
6. Consultar o histórico de pedidos e pagamentos.
7. Apresentar indicadores úteis em um painel.
8. Permitir correções rastreáveis, sem apagar indevidamente o histórico.

---

## 2. Contexto operacional conhecido

Use estas informações como contexto de negócio:

- A empresa atua na distribuição de cimento.
- A operação envolve pedidos de clientes e produtos vendidos por unidade de saco.
- A empresa trabalha com diferentes marcas/tipos de cimento.
- Os preços podem mudar. **Nunca fixe preços comerciais no código.** Eles devem ser cadastráveis e editáveis, com o valor efetivamente praticado preservado em cada pedido.
- A empresa utiliza ou pode utilizar os seguintes meios/canais de recebimento:
  - Bradesco;
  - Caixa Econômica Federal;
  - dinheiro em caixa;
  - cheque;
  - depósito bancário;
  - Pix.
- A empresa possui operação de entrega e logística própria ou terceirizada. Não presuma que todo pedido será entregue da mesma maneira.
- O número inicial de usuários é pequeno, mas o sistema deve permitir expansão sem reescrita desnecessária.

Essas informações não autorizam presumir regras ainda não confirmadas, como cálculo de frete, comissão, impostos, descontos máximos, limites de crédito, aprovação de pedidos ou integração bancária.

Quando uma regra não estiver definida, registre-a como pendência e pergunte antes de implementá-la como comportamento definitivo.

---

## 3. Escopo funcional

### 3.1 Clientes

O cadastro de clientes deve permitir, conforme necessidade confirmada:

- Nome ou razão social;
- CPF ou CNPJ;
- telefone;
- endereço;
- observações;
- situação do cadastro (ativo/inativo).

Regras:
- Evite cadastros duplicados.
- Valide CPF/CNPJ quando esse dado for informado.
- Não exiba dados pessoais além do necessário.
- Não exclua clientes que possuam pedidos ou movimentações relacionadas; prefira desativar o cadastro.

### 3.2 Produtos

O cadastro de produtos deve permitir:

- Nome/descrição;
- marca ou fabricante, quando aplicável;
- tipo de cimento;
- unidade de venda (inicialmente, saco);
- preço atual;
- situação (ativo/inativo).

Regras:
- Não presuma que o preço atual seja o preço histórico de um pedido.
- Ao adicionar um produto a um pedido, grave uma cópia do preço unitário efetivamente negociado naquele pedido.
- Alterações futuras no cadastro do produto não podem modificar pedidos antigos.
- Não deixe produtos inativos disponíveis para novos pedidos, mas mantenha-os visíveis no histórico.

### 3.3 Pedidos

Cada pedido deve possuir, no mínimo:

- Identificador único e legível;
- cliente;
- data e hora de criação;
- usuário responsável pelo registro, se houver autenticação;
- um ou mais itens;
- quantidade de cada item;
- preço unitário aplicado;
- subtotal e total;
- observações;
- situação do pedido;
- informações de entrega, quando aplicáveis.

Regras:
- Um pedido pode conter vários produtos.
- Quantidade deve ser maior que zero.
- Valores monetários devem usar precisão decimal adequada; nunca use ponto flutuante binário comum para cálculos financeiros.
- O total deve ser calculado a partir dos itens e das regras de desconto/frete que forem formalmente definidas.
- Não invente regras de desconto ou frete.
- O valor registrado no pedido deve permanecer consistente com o histórico.
- Alterações relevantes em pedidos devem ser rastreáveis.
- Não permita exclusão física de pedidos que já tenham pagamentos ou outras movimentações vinculadas. Use cancelamento ou inativação com registro do motivo.

### 3.4 Situação dos pedidos

Utilize estados claros e coerentes. Antes de definir o fluxo final, confirme com o responsável pela empresa quais etapas são realmente utilizadas.

Uma proposta inicial, sujeita a validação:

- Pendente;
- Confirmado;
- Em separação;
- Saiu para entrega;
- Concluído;
- Cancelado.

Não implemente transições automáticas sem regra aprovada. Um pedido cancelado não deve desaparecer do histórico.

### 3.5 Pagamentos e recebimentos

O sistema deve permitir registrar pagamentos vinculados a pedidos.

Cada lançamento deve considerar:

- pedido relacionado;
- valor;
- data do pagamento/recebimento;
- forma de pagamento;
- conta ou canal de destino, quando aplicável;
- observação;
- situação do lançamento, se houver necessidade de controle de compensação.

Formas/canais conhecidos:
- Pix;
- dinheiro;
- cheque;
- depósito;
- Bradesco;
- Caixa Econômica Federal.

**Importante:** forma de pagamento e conta de destino são conceitos diferentes. Por exemplo, Pix pode ser recebido em uma conta bancária. Não misture essas informações em um único campo se isso impedir relatórios corretos.

Regras:
- Um pedido pode ter pagamento integral ou vários pagamentos parciais.
- O sistema deve calcular o total pago e o saldo restante.
- Não considerar um pagamento como recebido duas vezes.
- Não permitir que um lançamento inválido altere silenciosamente o saldo.
- Estornos, cancelamentos e correções devem preservar o histórico.
- Não presumir integração automática com Bradesco, Caixa ou qualquer instituição. Inicialmente, considere registro manual, salvo decisão expressa em contrário.
- Não registrar senhas bancárias, tokens, credenciais ou dados de acesso bancário.

### 3.6 Parcelas e vencimentos

A necessidade de controle de parcelas deve ser confirmada com a empresa antes de definir o fluxo completo.

Se implementado:
- Uma venda poderá ter uma ou mais parcelas.
- Cada parcela deverá possuir valor, vencimento e situação.
- Pagamentos parciais devem ser associados corretamente às parcelas.
- O sistema deve distinguir valor previsto, valor pago e valor em aberto.
- Não marque uma parcela como paga apenas porque existe um pagamento vinculado; confira os valores e a situação do lançamento.

Não confunda parcelamento de uma venda com múltiplos recebimentos sem vencimentos definidos.

### 3.7 Painel e relatórios

O painel deve priorizar informações úteis para a gestão, tais como:

- quantidade de pedidos no período;
- valor total dos pedidos;
- pedidos pendentes/em andamento;
- total recebido;
- saldo em aberto;
- recebimentos por forma de pagamento ou conta;
- pedidos por período;
- histórico de movimentações.

Regras:
- Todo indicador financeiro deve ter definição clara.
- Diferencie valor vendido, valor recebido e valor ainda a receber.
- Filtros de período devem ser explícitos.
- Não apresente estimativas como valores confirmados.
- Relatórios devem refletir os dados persistidos no sistema, não valores simulados.

---

## 4. Regras de negócio e integridade dos dados

Estas regras são obrigatórias:

1. O banco de dados é a fonte oficial dos dados.
2. Não mantenha informações financeiras importantes apenas no estado visual da interface.
3. Preserve o histórico de pedidos e pagamentos.
4. Use identificadores únicos e relacionamentos consistentes.
5. Valide os dados no servidor, mesmo que também exista validação na interface.
6. Operações que alterem várias entidades relacionadas devem ser transacionais quando necessário.
7. Evite duplicidade de pagamentos e registros.
8. Não altere retroativamente o preço de pedidos antigos quando o preço de um produto mudar.
9. Não apague registros financeiros para corrigir erros; implemente cancelamento/estorno rastreável.
10. Datas, horários e valores devem ser tratados de forma consistente.
11. Exiba valores em Real brasileiro (R$), com formatação brasileira.
12. Use português do Brasil em textos, mensagens, rótulos e documentação voltada aos usuários.

Se duas regras entrarem em conflito, priorize integridade financeira, preservação do histórico e segurança dos dados. Explique o conflito antes de alterar o comportamento.

---

## 5. Diretrizes técnicas e arquitetura

### 5.1 Não presumir tecnologias

A stack foi definida na seção 0 deste arquivo. As orientações abaixo continuam valendo para bibliotecas e ferramentas novas.

Antes de iniciar uma implementação:
1. Inspecione os arquivos existentes.
2. Identifique linguagens, frameworks, banco de dados, dependências e comandos já utilizados.
3. Respeite a arquitetura existente quando ela estiver funcional.
4. Não substitua tecnologias ou reestruture o projeto sem justificativa e autorização.
5. Se o projeto estiver vazio ou a stack não estiver definida, apresente uma recomendação objetiva e explique os motivos antes de criar a estrutura principal.

Não instale bibliotecas apenas por conveniência quando a funcionalidade puder ser implementada com recursos já disponíveis.

### 5.2 Organização do código

- Separe responsabilidades de interface, regras de negócio e acesso a dados conforme os padrões da stack.
- Evite componentes, funções ou arquivos excessivamente grandes.
- Não duplique regras de negócio em vários lugares.
- Use nomes claros e consistentes.
- Mantenha dependências atualizadas apenas quando houver motivo.
- Não crie abstrações genéricas sem necessidade concreta.
- Prefira soluções simples, testáveis e fáceis de manter.

### 5.3 Banco de dados

- Modele corretamente os relacionamentos entre clientes, produtos, pedidos, itens, pagamentos e parcelas, quando aplicável.
- Use chaves estrangeiras e restrições de integridade.
- Crie índices quando houver benefício real de consulta.
- Utilize migrations ou o mecanismo de versionamento de schema adotado pelo projeto.
- Nunca altere o schema de produção manualmente sem um procedimento reproduzível.
- Não apague ou recrie o banco para resolver problemas de desenvolvimento.
- Não use dados reais de clientes em testes ou exemplos.
- Planeje backup e recuperação antes de qualquer implantação com dados reais.

### 5.4 Interface

A interface deve ser:
- simples e objetiva;
- responsiva para desktop e dispositivos móveis;
- adequada ao uso diário por funcionários;
- consistente entre telas;
- rápida para registrar e localizar pedidos;
- clara ao apresentar valores, status e pendências.

Evite:
- excesso de animações;
- telas visualmente carregadas;
- campos sem utilidade operacional;
- informações importantes escondidas;
- botões sem ação real;
- dados fictícios apresentados como se fossem reais.

Use estados de carregamento, sucesso, erro, vazio e confirmação quando forem relevantes.

---

## 6. Segurança e acesso

Se houver autenticação:

- Senhas devem ser armazenadas com hash seguro, nunca em texto puro.
- Proteja rotas e operações no servidor.
- Implemente autorização adequada para cada perfil, se houver perfis diferentes.
- Não exponha segredos no frontend, no repositório ou em logs.
- Utilize variáveis de ambiente para credenciais.
- Valide e normalize entradas.
- Proteja operações contra acesso não autorizado.
- Não registre dados pessoais ou financeiros desnecessários nos logs.

Não invente uma hierarquia de permissões. Confirme quem poderá visualizar, criar, editar, cancelar e administrar registros.

---

## 7. Testes e qualidade

Antes de considerar uma funcionalidade concluída:

1. Verifique os fluxos principais.
2. Teste entradas inválidas e campos obrigatórios.
3. Teste cálculos financeiros e arredondamentos.
4. Teste pagamentos parciais e saldo restante.
5. Teste alteração de preço de produto sem alterar pedidos antigos.
6. Teste cancelamento e preservação do histórico.
7. Teste relacionamentos e integridade do banco.
8. Execute os testes, verificações de tipos, lint e build disponíveis no projeto.

Não afirme que algo foi testado se o comando não foi executado. Informe testes não realizados e limitações encontradas.

Para cálculos financeiros, inclua casos de teste com valores decimais, pagamentos parciais e múltiplos itens.

---

## 8. Forma de trabalho do Claude Code

Atue como desenvolvedor responsável e também como instrutor técnico.

### Antes de modificar código

- Leia este arquivo.
- Inspecione os arquivos relevantes.
- Entenda o fluxo atual antes de propor alterações.
- Identifique dependências e possíveis efeitos colaterais.
- Para tarefas grandes, apresente um plano curto, dividido em etapas.
- Se faltar uma regra de negócio essencial, faça uma pergunta objetiva em vez de inventar uma resposta.

### Durante a implementação

- Faça alterações pequenas e coerentes.
- Preserve funcionalidades existentes.
- Não reescreva arquivos inteiros quando uma alteração localizada resolver.
- Não remova funcionalidades sem autorização.
- Não altere contratos de API, schema ou estrutura de dados sem avaliar impactos.
- Não adicione funcionalidades fora do escopo solicitado.
- Não use dados fictícios para mascarar funcionalidades ainda não implementadas.
- Não esconda erros com valores padrão silenciosos ou tratamento genérico.
- Comente o código quando isso realmente ajudar a explicar uma decisão não óbvia.

### Ao concluir cada tarefa

Apresente um resumo com:

1. O que foi implementado.
2. Quais arquivos foram criados ou alterados.
3. Como a solução funciona.
4. Quais comandos/testes foram executados e seus resultados.
5. O que ainda está pendente ou depende de decisão.

### Como ensinar durante o desenvolvimento

O usuário está aprendendo Engenharia de Software e deseja aprender programação enquanto utiliza IA para desenvolver o sistema.

Portanto:
- Explique decisões técnicas em linguagem clara.
- Ao introduzir um conceito novo, explique sua finalidade e onde aparece no projeto.
- Explique o fluxo dos dados entre interface, backend e banco de dados.
- Ao criar uma função importante, descreva o que recebe, o que faz e o que retorna.
- Explique erros relevantes e como investigá-los.
- Não transforme toda resposta em uma aula longa: priorize explicações curtas e relacionadas à alteração realizada.
- Não esconda a implementação atrás de soluções mágicas ou dependências desnecessárias.
- Incentive o usuário a compreender e revisar o código, não apenas copiar comandos.

---

## 9. Controle de escopo e decisões

Mantenha uma lista de decisões e pendências do projeto, preferencialmente em documentação versionada.

Não trate sugestões do Claude como decisões aprovadas.

As definições abaixo eram as pendências originais. Stack, banco, perfis, status, prazos, cheques, contas, documentos e backup já foram decididos (seção 0); os detalhes ainda abertos estão em `docs/planejamento-arquitetura.md`, seção 8. As seguintes definições ainda precisam ser confirmadas antes de uma implementação definitiva, caso não estejam documentadas em outro lugar do repositório:

- Stack de frontend e backend;
- banco de dados e ambiente de hospedagem;
- autenticação e quantidade/perfis de usuários;
- fluxo real de status dos pedidos;
- regras de frete e entrega;
- regras de descontos;
- política de edição e cancelamento de pedidos;
- funcionamento de vendas a prazo e parcelas;
- como serão registrados cheques e pagamentos ainda não compensados;
- contas bancárias e canais de recebimento que precisam aparecer nos relatórios;
- necessidade de impressão, PDF ou compartilhamento de pedidos;
- necessidade de importação/exportação de planilhas;
- política de backup e implantação.

Quando uma dessas definições for necessária:
1. Explique a decisão que precisa ser tomada.
2. Apresente opções simples, com vantagens e desvantagens.
3. Recomende uma opção quando houver base suficiente.
4. Aguarde confirmação se a escolha afetar regras de negócio, arquitetura ou dados.

---

## 10. Proibições explícitas

Não faça nenhuma das ações abaixo sem autorização:

- Trocar a stack ou o banco de dados.
- Apagar banco, tabelas ou dados.
- Executar comandos destrutivos em ambientes com dados reais.
- Remover funcionalidades existentes.
- Criar integrações bancárias ou automatizações financeiras presumidas.
- Inventar regras de preço, desconto, frete, comissão ou parcelamento.
- Inserir credenciais, tokens ou senhas no código.
- Publicar o sistema ou expor o banco de dados publicamente.
- Usar dados reais de clientes em ambientes de teste.
- Declarar uma funcionalidade pronta quando houver apenas uma interface demonstrativa.

---

## 11. Critério geral de prioridade

Em caso de dúvida, priorize nesta ordem:

1. Integridade e segurança dos dados;
2. Correção das regras financeiras e de negócio;
3. Preservação das funcionalidades existentes;
4. Simplicidade e facilidade de manutenção;
5. Facilidade de uso pela equipe;
6. Desempenho adequado à escala da empresa;
7. Expansibilidade futura.

**Princípio central:** construir um sistema confiável para a operação real do Armazém do Cimento, sem inventar regras de negócio, sem adicionar complexidade desnecessária e mantendo o usuário capaz de compreender e evoluir o código.
