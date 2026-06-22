// Testes unitários simples (sem framework) — rodar com: node commissionLogic.test.js
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { calcularImediato, calcularAdesao, calcularParcela, calcularGratificacao } = require("./commissionLogic.js");

const rules = JSON.parse(fs.readFileSync(path.join(__dirname, "commissionRules.json"), "utf8"));

let passed = 0;
function test(nome, fn) {
  try {
    fn();
    passed++;
    console.log(`OK  - ${nome}`);
  } catch (e) {
    console.error(`FAIL - ${nome}`);
    console.error(`      ${e.message}`);
    process.exitCode = 1;
  }
}

// --- Imediato: Urnas, Plantão Diurno ---
test("Urnas Diurno - piso da faixa (R$0) = 0,75%", () => {
  const r = calcularImediato(0, "urnas", "plantao_diurno", rules);
  assert.strictEqual(r.comissaoPercentual, 0.75);
  assert.strictEqual(r.comissaoValor, 0);
});

test("Urnas Diurno - exatamente no teto da faixa (R$3.000,99) ainda 0,75%", () => {
  const r = calcularImediato(3000.99, "urnas", "plantao_diurno", rules);
  assert.strictEqual(r.comissaoPercentual, 0.75);
});

test("Urnas Diurno - logo após o teto da faixa (R$3.001,00) sobe pra 2%", () => {
  const r = calcularImediato(3001.00, "urnas", "plantao_diurno", rules);
  assert.strictEqual(r.comissaoPercentual, 2);
});

test("Urnas Diurno - acima do teto máximo (R$20.000) fica na faixa 8%, tetoAtingido=true", () => {
  const r = calcularImediato(20000, "urnas", "plantao_diurno", rules);
  assert.strictEqual(r.comissaoPercentual, 8);
  assert.strictEqual(r.tetoAtingido, true);
  assert.strictEqual(r.faixaProxima, null);
  assert.strictEqual(r.faltaParaProxima, null);
});

test("Urnas Diurno - valor negativo lança erro", () => {
  assert.throws(() => calcularImediato(-1, "urnas", "plantao_diurno", rules));
});

test("Urnas Diurno - valor não numérico lança erro", () => {
  assert.throws(() => calcularImediato("abc", "urnas", "plantao_diurno", rules));
});

test("Urnas Diurno - progresso até a próxima faixa calculado corretamente", () => {
  const r = calcularImediato(5000, "urnas", "plantao_diurno", rules);
  // faixa 4600.00-7000.00, 4%
  assert.strictEqual(r.comissaoPercentual, 4);
  assert.strictEqual(r.faixaProxima.percentual, 6);
  assert.strictEqual(r.faltaParaProxima, 2000.01);
});

// --- Itens Diversos ---
test("Itens Diversos Comercial - piso (R$0) = 0,35%", () => {
  const r = calcularImediato(0, "itens_diversos", "plantao_comercial", rules);
  assert.strictEqual(r.comissaoPercentual, 0.35);
});

test("Itens Diversos Noturno - teto máximo (acima R$11.900,01) = 2,6%", () => {
  const r = calcularImediato(50000, "itens_diversos", "plantao_noturno", rules);
  assert.strictEqual(r.comissaoPercentual, 2.6);
  assert.strictEqual(r.tetoAtingido, true);
});

// --- Adesão Televendas ---
test("Adesão Televendas base - até 14 planos = 20%", () => {
  const r = calcularAdesao(1000, 10, "televendas", null, "base", rules);
  assert.strictEqual(r.comissaoPercentual, 20);
  assert.strictEqual(r.comissaoValor, 200);
});

test("Adesão Televendas base - 34+ planos = 70% + nota de bônus 2%", () => {
  const r = calcularAdesao(1000, 40, "televendas", null, "base", rules);
  assert.strictEqual(r.comissaoPercentual, 70);
  assert.strictEqual(r.bonusPrimeiraParcela, 2);
});

test("Adesão Televendas out2026 - teto cai pra 65% (regra dos -5pp)", () => {
  const r = calcularAdesao(1000, 40, "televendas", null, "out2026", rules);
  assert.strictEqual(r.comissaoPercentual, 65);
});

test("Adesão Televendas jan2027 - teto cai pra 60% (regra dos -10pp)", () => {
  const r = calcularAdesao(1000, 40, "televendas", null, "jan2027", rules);
  assert.strictEqual(r.comissaoPercentual, 60);
});

test("Adesão Atendimento Noturno/Cemitério - zero planos não bate nenhuma faixa (mínimo é 1)", () => {
  const r = calcularAdesao(1000, 0, "atendimento", "plantao_noturno_cemiterio", "base", rules);
  assert.strictEqual(r.faixaAtual, null);
  assert.strictEqual(r.comissaoValor, 0);
});

test("Adesão - taxa negativa lança erro", () => {
  assert.throws(() => calcularAdesao(-100, 10, "televendas", null, "base", rules));
});

// --- Parcelas Televendas ---
test("Parcela 1ª - piso (R$0) = 4%", () => {
  const r = calcularParcela(0, "primeira", rules);
  assert.strictEqual(r.comissaoPercentual, 4);
});

test("Parcela 1ª - teto máximo (acima de R$2.500) = 28%", () => {
  const r = calcularParcela(5000, "primeira", rules);
  assert.strictEqual(r.comissaoPercentual, 28);
  assert.strictEqual(r.tetoAtingido, true);
});

test("Parcela 4ª - valor exatamente no limite superior de uma faixa (R$999)", () => {
  const r = calcularParcela(999, "quarta", rules);
  assert.strictEqual(r.comissaoPercentual, 16);
});

test("Parcela - valor negativo lança erro", () => {
  assert.throws(() => calcularParcela(-50, "primeira", rules));
});

// --- Gratificações ---
test("Gratificação Vendas Imediatas - abaixo de R$2.000 = 0%", () => {
  const r = calcularGratificacao(1500, "vendas_imediatas", rules);
  assert.strictEqual(r.comissaoPercentual, 0);
  assert.strictEqual(r.comissaoValor, 0);
});

test("Gratificação Vendas Imediatas - piso (R$0) = 0%", () => {
  const r = calcularGratificacao(0, "vendas_imediatas", rules);
  assert.strictEqual(r.comissaoPercentual, 0);
});

test("Gratificação Vendas Imediatas - exatamente R$2.000 = 0,5%", () => {
  const r = calcularGratificacao(2000, "vendas_imediatas", rules);
  assert.strictEqual(r.comissaoPercentual, 0.5);
  assert.strictEqual(r.comissaoValor, 10);
});

test("Gratificação Vendas Imediatas - exatamente R$4.000 = 1%", () => {
  const r = calcularGratificacao(4000, "vendas_imediatas", rules);
  assert.strictEqual(r.comissaoPercentual, 1);
});

test("Gratificação Vendas Imediatas - acima do teto (R$20.000) = 2%, tetoAtingido", () => {
  const r = calcularGratificacao(20000, "vendas_imediatas", rules);
  assert.strictEqual(r.comissaoPercentual, 2);
  assert.strictEqual(r.tetoAtingido, true);
});

test("Gratificação Vendas Imediatas - valor negativo lança erro", () => {
  assert.throws(() => calcularGratificacao(-10, "vendas_imediatas", rules));
});

test("Gratificação Vendas Previdenciárias - exatamente R$8.000 = 2%", () => {
  const r = calcularGratificacao(8000, "vendas_previdenciarias", rules);
  assert.strictEqual(r.comissaoPercentual, 2);
  assert.strictEqual(r.comissaoValor, 160);
});

test("Gratificação Vendas Previdenciárias - valor não numérico lança erro", () => {
  assert.throws(() => calcularGratificacao("abc", "vendas_previdenciarias", rules));
});

console.log(`\n${passed} teste(s) passaram.`);
