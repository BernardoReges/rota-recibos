# API HTTP

POST exige `Content-Type: application/json` e `X-Requested-With: app`, na mesma origem. A sessão fica em cookie HttpOnly do produto. Não há token no localStorage. Valores monetários são centavos inteiros.

## Acesso

| Método e rota        | Função                                                          |
| -------------------- | --------------------------------------------------------------- |
| GET `/api/session`   | Sessão, necessidade de setup, demo e configuração               |
| POST `/api/setup`    | Primeiro administrador: `name`, `email`, `password`             |
| POST `/api/login`    | `email`, `password`                                             |
| POST `/api/logout`   | Invalidar sessão atual                                          |
| POST `/api/password` | Senha própria: `currentPassword`, `newPassword`                 |
| POST `/api/demo`     | Acesso fictício, somente quando habilitado: `role` admin/driver |
| GET `/api/users`     | Empresa vê equipe; motorista vê próprio perfil                  |
| POST `/api/users`    | Empresa cria motorista: `name`, `email`, `password`             |
| GET `/api/audit`     | Empresa consulta últimos 100 eventos                            |

## Viagens e despesas

| Método e rota                   | Acesso e comportamento                                                                                       |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| GET `/api/state`                | Viagens, despesas e tarefas autorizadas, com totais separados                                                |
| GET `/api/report`               | Empresa: aprovadas por `from`, `to`, `category` e `uf`, com distribuição de custos                           |
| GET `/api/report.csv`           | Empresa: CSV consolidado com os mesmos filtros do relatório                                                  |
| POST `/api/trips`               | Empresa: `title`, `origin`, `destination`, `startDate`, `endDate`, `driverId`, `advanceCents`, `budgetCents` |
| POST `/api/trips/:id/expenses`  | Viagem autorizada e aberta: `{file}`                                                                         |
| POST `/api/expenses/:id/read`   | `consent: true`; enfileira leitura, não aprova                                                               |
| POST `/api/expenses/:id/save`   | Salvar rascunho/correção com campos e versão atual                                                           |
| POST `/api/expenses/:id/submit` | Validar e encaminhar para empresa; confirma duplicidade quando aplicável                                     |
| POST `/api/expenses/:id/review` | Empresa: `status` approved/returned, `note`, `version`                                                       |
| GET `/api/trips/:id/export`     | CSV somente de aprovadas da viagem autorizada                                                                |
| POST `/api/trips/:id/close`     | Empresa, sem despesas pendentes                                                                              |
| GET `/api/files/:id`            | Original privado, sujeito a permissão                                                                        |

Arquivo: `{name, mime, data}`, com base64 canônico em `data`. Até 8 MB, nos formatos PDF, PNG, JPEG e TXT. O arquivo não recebe URL pública estática.

Campos de despesa: `{version, merchant, date, category, amountCents, currency, city, state, receiptNumber, note, duplicateAcknowledged}`. `date` é ISO YYYY-MM-DD dentro da viagem. `currency` precisa ser BRL. Categorias: combustivel, pedagio, alimentacao, hospedagem, outros. `duplicateAcknowledged` não prova legitimidade: registra a declaração para conferência da empresa.

Erros retornam `{error}`. 401 indica sessão ausente, 403 permissão/origem, 404 registro não autorizado ou inexistente, 409 conflito de versão/estado/duplicidade, 429 limite de chamadas. Tarefas de leitura têm estados pending/running/done/failed; um 200 ao enfileirar não significa sucesso da extração.
