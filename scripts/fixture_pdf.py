"""Gera documento fictício para teste de leitura; dependência de desenvolvimento: reportlab."""
from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A4
import argparse

parser = argparse.ArgumentParser()
parser.add_argument('--kind', choices=['cotaflux', 'rota'], required=True)
args = parser.parse_args()
root = Path(__file__).resolve().parent.parent
target = root / 'fixtures' / ('proposta-ficticia.pdf' if args.kind == 'cotaflux' else 'comprovante-ficticio.pdf')
target.parent.mkdir(exist_ok=True)
c = canvas.Canvas(str(target), pagesize=A4)
c.setTitle('Documento ficticio para testes - sem valor fiscal ou comercial')
c.setAuthor('Projeto demonstrativo')
c.setFillColor(HexColor('#6353d5' if args.kind == 'cotaflux' else '#182b41'))
c.rect(0, 742, 595, 100, fill=1, stroke=0)
c.setFillColor(HexColor('#ffffff'))
c.setFont('Helvetica-Bold', 22)
c.drawString(42, 790, 'Proposta ficticia' if args.kind == 'cotaflux' else 'Comprovante ficticio')
c.setFont('Helvetica', 10)
c.drawString(42, 764, 'EXEMPLO DE TESTE - SEM VALOR FISCAL OU COMERCIAL')
c.setFillColor(HexColor('#242535'))
if args.kind == 'cotaflux':
    lines = [
        'Fornecedor: Aurora Exemplo',
        'Copo de papel 200 ml: pacote de 100 unidades.',
        'Preco de cada pacote de copos: R$ 18,90.',
        'Cafe torrado: pacote de 1 kg.',
        'Preco de cada pacote de cafe: R$ 26,00.',
        'Frete total da proposta: R$ 35,00.',
        'Entrega em 3 dias.',
        'Proposta valida ate 31/12/2026.',
    ]
else:
    lines = [
        'Estabelecimento: POSTO EXEMPLO',
        'Campinas - SP',
        'Data da despesa: 10/11/2026',
        'ABASTECIMENTO DIESEL',
        'TOTAL PAGO: R$ 385,50',
        'Valor recebido: R$ 400,00',
        'Troco: R$ 14,50',
        'Recibo DEMO-001',
    ]
for index, line in enumerate(lines):
    c.setFont('Helvetica-Bold' if 'TOTAL PAGO' in line else 'Helvetica', 12)
    c.drawString(42, 690 - index * 38, line)
c.setStrokeColor(HexColor('#e2e3e8'))
c.line(42, 300, 553, 300)
c.setFont('Helvetica', 9)
c.setFillColor(HexColor('#747582'))
c.drawString(42, 274, 'Documento sintetico. Nao corresponde a compra, pagamento ou fornecedor real.')
c.drawRightString(553, 35, '1 / 1')
c.showPage()
c.save()
print(target)
