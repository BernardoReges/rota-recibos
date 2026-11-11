# Segurança e dados

Uma instalação representa uma empresa de gestão logística. A empresa acessa suas viagens; motoristas acessam somente as viagens vinculadas a eles, inclusive no download dos comprovantes. Isto não é um SaaS com isolamento entre organizações.

- A pasta de dados registra modo (real/demo) e produto. O servidor recusa configurações incompatíveis; o comando demo usa DEMO_DATA_DIR e ignora a pasta real DATA_DIR.
- Senhas usam scrypt com salt aleatório. Sessões usam tokens aleatórios, apenas seus hashes ficam no banco, com validade de oito horas.
- Cookies HttpOnly e SameSite=Strict; `SECURE_COOKIES=true` deve ser usado atrás de HTTPS.
- O servidor valida Host, Origin, cabeçalho da aplicação e tipo de conteúdo. SQL parametrizado; arquivos sem acesso estático público.
- PDF, PNG, JPEG e TXT têm limite de 8 MB e conferência básica de assinatura. Isso não substitui antivírus ou sandbox de PDF.
- Leitura de IA exige consentimento por documento, tem timeout, fila serial, limite por pessoa e validação posterior. A IA não compra, transfere dinheiro ou envia mensagens.
- O conteúdo completo do comprovante/documento autorizado, inclusive dados não removidos, vai ao provedor Gemini. O filtro não anonimiza imagens. Use documentos fictícios na demonstração e avalie a política do provedor antes de usar dados reais.
- O SQLite e os CSVs não têm criptografia própria. Proteja o volume e os backups com as permissões do sistema e criptografia de disco.
- Nenhuma chave acompanha o código. `.env`, bancos, anexos e exportações privadas devem ficar fora do Git. A chave é enviada em cabeçalho ao provedor, nunca ao navegador.
- O log de eventos identifica ações; não é um registro inviolável. Pessoas com acesso ao banco podem alterá-lo.

Antes de uso público: HTTPS, política de privacidade/retenção e exclusão, recuperação de senha, gestão do ciclo de vida dos acessos, MFA/SSO conforme o risco, limites de armazenamento e monitoramento operacional, revisão de segurança independente e teste com os documentos reais do negócio. Configure a primeira conta em ambiente privado antes de expor a instalação; o setup inicial só é permitido enquanto não há usuários. Não anuncie conformidade legal ou certificação sem verificação própria.

Não publique falhas com credenciais ou documentos de clientes. Para uma cópia local ainda não publicada, comunique a falha diretamente ao responsável pela instalação por canal privado. Após publicação, habilite o canal privado de segurança do repositório.
