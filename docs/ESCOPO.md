# Escopo e evolução

## Atores

**Motorista:** acessa somente suas viagens, anexa comprovantes, solicita leitura, corrige rascunhos e despesas devolvidas e envia para a empresa. Não aprova despesas nem cria viagens.

**Empresa:** cadastra motoristas, organiza viagens, acompanha despesas e originais, registra aprovação/devolução e fecha a prestação de contas.

Uma instalação representa uma empresa. O contrato não prevê múltiplas transportadoras isoladas dentro do mesmo banco.

## Critérios de aceitação

- O acesso a viagem e comprovante é autorizado no servidor, inclusive download e exportação.
- Cada comprovante pertence a uma viagem. O envio exige documento, data, categoria, moeda BRL e total válido.
- A leitura da IA é uma sugestão, depende de consentimento e mantém o original.
- O motorista confirma campos antes de enviar. Uma despesa enviada não é editável até ser devolvida.
- A empresa aprova ou devolve com justificativa. Só aprovadas alimentam o total e o CSV de custos.
- Reenvio do mesmo arquivo é bloqueado; semelhança de valor/data/estabelecimento pede conferência, sem acusação automática.
- Respostas atrasadas, falhas da IA e reinícios não apagam anexos nem substituem correções recentes.
- O fechamento não aceita despesas pendentes; dados seguem disponíveis após encerramento.

## Fora desta entrega

Pagamento e reembolso automático, integração bancária ou com cartão, validação fiscal junto à Receita, GPS, cálculo de rota/pedágios, aplicativo Android nativo, captura automática de WhatsApp, anexos de e-mail, sincronização Google Sheets/365 e operação offline com sincronização posterior. Não há alegação de conformidade tributária, legal, antifraude ou homologação de segurança.

## Piloto real proposto

Selecionar um motorista e uma pessoa da operação. Com autorização, usar uma viagem pequena e comprovantes minimizados. Medir tempo de envio e revisão, campos corrigidos, documentos ilegíveis, repetições e divergência entre planilha aprovada e comprovantes. Conferir os resultados por outra pessoa. Registrar erros e amostra, sem afirmar economia de tempo antes da medição. O arquivo `piloto.csv` começa apenas com cabeçalho.

## Próximas fases

1. Teste físico em celulares e diferentes condições de fotografia; instruções de captura e retorno de qualidade por campo.
2. Convites de motorista, recuperação de senha, bloqueio de contas, retenção/exclusão, trilha completa de versões e regras de alçada.
3. Arquivamento de comprovantes devolvidos que não devem ser reenviados e fechamento com justificativa por exceção, sem apagar o histórico.
4. Integração com planilha online usando OAuth e escopo mínimo, fila idempotente e reconciliação; só depois de um piloto validar a necessidade.
5. Hospedagem HTTPS, armazenamento de objetos e PostgreSQL quando volume e disponibilidade justificarem.

As fases não estão implementadas e não devem aparecer como funcionalidades concluídas no portfólio.
