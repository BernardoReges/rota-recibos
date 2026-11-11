# Instalação e operação — Rota Recibos

Este guia descreve a execução no próprio ambiente, a configuração da IA e a proteção dos dados. O repositório distribui o código; não inclui um serviço hospedado.

## Experimente em minutos

Requisito: **Node.js 24 LTS**. Sem dependências npm de runtime. Na pasta do projeto, execute:

```sh
npm run demo
```

Abra **http://127.0.0.1:3070**. Na demonstração, escolha **Entrar como motorista** ou **Entrar como empresa**. Os acessos reais são verificados no servidor; não é apenas uma troca visual de perfil.

Sugestão de teste:

1. Entre como motorista e abra a viagem fictícia.
2. Selecione o comprovante de pedágio em rascunho ou anexe um arquivo de `fixtures/`.
3. Autorize a leitura, confira os campos e envie à empresa.
4. Saia e entre como empresa. Abra a fila de despesas, confira o original e registre uma decisão.
5. Abra a viagem e exporte a planilha. Somente aprovadas entram no total.

Não envie dados reais ao ambiente de demonstração. O botão de acesso sem senha só existe quando `DEMO=true`, e essa modalidade só inicia em loopback.

## Instalação real separada

Copie `.env.example` para `.env` e configure a sua chave e uma pasta diferente da demonstração:

```dotenv
GEMINI_API_KEY=sua_chave_somente_no_arquivo_local
GEMINI_MODEL=gemini-3.1-flash-lite
GEMINI_VISION_MODEL=gemini-3.5-flash-lite
DATA_DIR=./data/real
DEMO=false
```

```sh
npm start
```

Na primeira abertura, crie o acesso da empresa com senha de pelo menos 12 caracteres. O administrador cria os acessos dos motoristas e entrega as senhas por canal privado. Não existe senha padrão de produção. A troca de senha própria está disponível em Minha conta e encerra outras sessões. Recuperação de senha e MFA ainda precisam ser implementadas antes de exposição pública.

O adaptador aceita `LLM_API_KEY` como compatibilidade com configuração privada existente. A chave do autor não acompanha o código. Sem IA configurada, o cadastro, envio, preenchimento manual, revisão e exportação continuam disponíveis.

### Cliente-servidor e uso pelo celular

O navegador é o cliente; os dados e os documentos ficam no servidor da empresa. O layout é responsivo e usa o seletor de arquivos do navegador. A captura por câmera depende do sistema e do navegador do aparelho; não foi homologada em um celular físico.

O endereço `127.0.0.1` funciona apenas no próprio computador. Para vários aparelhos, é necessário hospedar o servidor em endereço alcançável, com proxy HTTPS, `APP_ORIGIN` exato, `SECURE_COOKIES=true` e demonstração desligada. Nenhuma hospedagem, túnel público ou regra de firewall foi criada nesta entrega.

`docker compose up --build` inclui uma receita de instalação vazia em **http://localhost:3070**, com volume persistente e porta restrita ao loopback. A receita está preparada, mas a execução Docker não foi homologada nesta entrega; os testes foram feitos com Node no Windows.

## Dados, acessos e privacidade

Uma instalação representa uma empresa de gestão logística. O administrador vê todas as viagens dessa instalação; cada motorista vê somente as suas. Empresas diferentes devem usar instalações e bancos separados. Não há portal SaaS multiempresa.

O SQLite em `DATA_DIR/app.sqlite` guarda usuários, sessões, viagens, despesas, anexos, fila e eventos. Os anexos são BLOBs privados: não há pasta pública de comprovantes. Downloads verificam a sessão e a permissão. Limites atuais: 8 MB por arquivo e 500 documentos por instalação.

`npm run demo` usa `DEMO_DATA_DIR` (padrão `./data/demo`), independente da pasta real em `DATA_DIR`. O banco registra modo e produto e recusa a troca entre demonstração e instalação real ou a abertura por outro aplicativo. No Windows, uma opção de pasta externa é `D:/DadosProjetos/rota-recibos-real`.

A IA recebe o documento completo autorizado. Não há anonimização garantida de foto ou PDF, e o filtro de saída não impede que dados sensíveis do original sejam transmitidos. Use somente o necessário e avalie as condições do provedor antes de dados reais. A extração instrui o modelo a não reproduzir CPF, dados bancários ou cartões. Isso é uma redução de exposição na saída, não uma garantia de remoção na entrada.

Senhas usam scrypt e salt; sessões usam tokens aleatórios com hashes no banco e vencimento. O SQLite, os CSVs e backups não são criptografados pelo aplicativo. Proteja a máquina e o volume. Veja [SECURITY.md](../SECURITY.md).

## Backup e restauração

```sh
npm run backup -- ./backups
```

O comando copia a base apontada por `DATA_DIR`; para salvar uma demonstração, aponte essa variável explicitamente para a pasta demonstrativa. O backup usa a API online do SQLite e valida integridade. Inclui os anexos, mas não a chave do provedor; guarde o `.env` de forma privada separada. Para restaurar, pare o servidor, preserve a pasta original, copie o backup para uma pasta nova como `app.sqlite` e aponte `DATA_DIR` para ela. As exportações podem ser regeneradas dos registros aprovados. Não substitua bancos em execução nem publique bancos, CSVs reais ou backups.
