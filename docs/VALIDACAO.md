# Validação — 11 de novembro de 2026

## Resultado desta entrega

Aplicação local executada com Node.js 24 no Windows. Após a queda de energia ocorrida entre as sessões, `PRAGMA integrity_check` retornou **ok** no banco demonstrativo, preservando a viagem e os três comprovantes que já existiam. Os ensaios seguintes adicionaram uma imagem e concluíram o fluxo de motorista para empresa. Isso documenta a recuperação observada; não garante recuperação em todo tipo de falha de disco ou energia.

## Testes determinísticos

**27 testes aprovados, zero falhas na rodada final.** São verificados: acesso direto à viagem/arquivo/exportação de outro motorista, bloqueio de aprovação pelo motorista, ciclo de devolução e reenvio, categorias e período, centavos, totais separados, comprovante duplicado, possível duplicidade semântica, versão obsoleta, fechamento com pendências, resposta de IA atrasada, arquivo preservado em falha do provedor, sessão, CSRF e troca de senha com revogação.

Os testes também conferem o motorista escolhido pelo botão demonstrativo, o relatório por período/categoria/UF, o acesso do motorista ao anexo enviado pela empresa à própria viagem e a reconstrução do CSV sem repetir linhas já aprovadas. O arquivo mantém BOM UTF-8; o comparativo com a API considera que a decodificação de Fetch remove esse marcador.

## Ensaios reais com Gemini

Dados fictícios escritos no próprio projeto; não são uma amostra independente de comprovantes de estrada.

| Ensaio                               | Verificação                                             | Resultado final                                 |
| ------------------------------------ | ------------------------------------------------------- | ----------------------------------------------- |
| Texto com total, recebido e troco    | Total R$ 385,50, data e categoria                       | 3/3 campos esperados                            |
| Texto ilegível/incompleto            | Não inventar valor ou data                              | 2/2 campos esperados                            |
| Imagem PNG do comprovante fictício   | Total pago, data e categoria                            | 3/3 campos esperados                            |
| PDF do comprovante fictício          | Total pago, data e categoria                            | 3/3 campos esperados                            |
| Imagem enviada pela API do motorista | Upload privado, fila, leitura e campos para conferência | Tarefa concluída, total sugerido 38550 centavos |

Relatórios: `ai-evaluation.json`, `ai-image-evaluation.json`, `ai-pdf-evaluation.json` e `integration-image-evaluation.json`. O PDF foi renderizado e conferido visualmente. Os ensaios isolados finais registrados levaram aproximadamente 1,3 a 6,5 segundos; isso não é uma garantia de latência em outros documentos ou contas.

O modelo de texto apresentou falha/timeout ao receber imagem. O relatório inicial foi preservado em `ai-image-evaluation-inicial.json`, e a investigação está em `vision-probe.json`. Foi configurado um modelo de visão separado, que respondeu no ensaio final. Os primeiros ensaios também motivaram reforço do formato ISO de data; o resultado inicial ficou em `ai-evaluation-inicial.json`.

## Fluxo observado na interface

1. Entrada como motorista fictício, com viagem vinculada e sem acesso aos menus administrativos.
2. Abertura da imagem original no painel, conferência do total sugerido e bloqueio ao tentar enviar uma possível duplicidade de estabelecimento/data/valor.
3. Envio do pedágio fictício de R$ 18,70, previamente em rascunho.
4. Saída e entrada como empresa, leitura do original e aprovação com justificativa explícita de teste.
5. Total aprovado passou de R$ 45,90 para **R$ 64,60**. O CSV vinculado contém somente alimentação e pedágio, com total de R$ 64,60; o combustível pendente e a imagem em rascunho não foram aprovados.
6. Filtro por Pedágio e UF SP retornou R$ 18,70, um comprovante e uma viagem.

Nenhum pagamento foi realizado. Os valores são dados sintéticos do fluxo de validação. Os totais pendentes sinalizam quando há comprovantes sem valor confirmado.

## Interface e privacidade

Layout verificado em 1366 × 900 e 412 × 915, sem transbordamento horizontal nas medições observadas. Capturas: `painel.png`, `mobile.png`, `comprovante.png` e `relatorios.png`. As imagens representam momentos diferentes do fluxo e somente dados fictícios. Não houve homologação em aparelho físico nem teste da câmera de um motorista.

Os campos não inserem HTML de documentos. A prévia de fotos e textos consulta o endpoint privado e aplica a mesma permissão do download. A chave permanece fora do navegador. A conferência de credenciais e arquivos distribuíveis está em `credential-review.json`, sem valores secretos. Isso não substitui auditoria de segurança independente.

## Limites e próxima etapa

Não houve piloto real, medição de horas economizadas, benchmark de OCR com diversidade de imagens, homologação fiscal, integração bancária ou sincronização de Google Sheets/365. O CSV é uma exportação e um arquivo local atualizado, não uma conexão de planilha online. Docker e CI remoto estão preparados, mas não foram executados nesta entrega. O próximo passo é um piloto pequeno, descrito em `ESCOPO.md`; `piloto.csv` começa somente com cabeçalho. Nenhuma publicação no GitHub ou implantação pública foi realizada.
