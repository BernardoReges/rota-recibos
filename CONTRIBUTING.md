# Contribuir

Use Node.js 24 LTS. Não há dependências npm de runtime.

1. Trabalhe com documentos fictícios e uma pasta `DATA_DIR` separada.
2. Rode `npm test`; para mudanças de extração, execute `npm run evaluate:ai` com sua própria chave e examine os erros, não apenas a média.
3. Preserve valores monetários em centavos, conferência humana e controle de versão dos registros.
4. Acrescente testes de comportamento para alterações em regras ou permissões. Não use um modelo de IA como teste determinístico.
5. Revise o diff para evitar bancos, anexos, dados pessoais e chaves. Não inclua `.env` em issues ou pull requests.

O desenvolvimento inicial foi assistido por IA. Contribuições também podem usar essas ferramentas, com revisão humana das alterações, testes e explicação das decisões. A infraestrutura inicial é compartilhada com o outro projeto deste conjunto; alterações de segurança devem ser verificadas em ambos.
