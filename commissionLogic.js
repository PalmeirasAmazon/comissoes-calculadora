// Camada de lógica de cálculo — funções puras, sem efeito colateral.
// Nunca lê commissionRules.json diretamente em outro lugar: este é o único ponto de acesso.

(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.CommissionLogic = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function validarValor(valor) {
    if (typeof valor !== "number" || Number.isNaN(valor)) {
      throw new Error("Valor inválido: deve ser numérico.");
    }
    if (valor < 0) {
      throw new Error("Valor inválido: não pode ser negativo.");
    }
  }

  function encontrarFaixa(faixas, valor) {
    for (const faixa of faixas) {
      const dentroDoMin = valor >= faixa.min;
      const dentroDoMax = faixa.max === null || valor <= faixa.max;
      if (dentroDoMin && dentroDoMax) return faixa;
    }
    return null;
  }

  function calcularProgresso(faixas, valor, faixaAtual) {
    if (!faixaAtual) {
      return { faixaProxima: null, faltaParaProxima: null, percentualProgresso: 0 };
    }
    const idx = faixas.indexOf(faixaAtual);
    const faixaProxima = idx >= 0 && idx < faixas.length - 1 ? faixas[idx + 1] : null;

    if (!faixaProxima) {
      return { faixaProxima: null, faltaParaProxima: null, percentualProgresso: 100 };
    }

    const inicioFaixa = faixaAtual.min;
    const fimFaixa = faixaAtual.max;
    const faltaParaProxima = Math.max(0, +(fimFaixa - valor + 0.01).toFixed(2));
    const tamanhoFaixa = fimFaixa - inicioFaixa;
    const percentualProgresso = tamanhoFaixa > 0
      ? Math.min(100, Math.max(0, +(((valor - inicioFaixa) / tamanhoFaixa) * 100).toFixed(2)))
      : 100;

    return { faixaProxima, faltaParaProxima, percentualProgresso };
  }

  function montarResultado(faixas, valor, faixaAtual, comissaoValor) {
    if (!faixaAtual) {
      return {
        comissaoPercentual: 0,
        comissaoValor: 0,
        faixaAtual: null,
        faixaProxima: faixas[0] || null,
        faltaParaProxima: faixas[0] ? faixas[0].min - valor : null,
        percentualProgresso: 0,
        tetoAtingido: false
      };
    }
    const { faixaProxima, faltaParaProxima, percentualProgresso } = calcularProgresso(faixas, valor, faixaAtual);
    return {
      comissaoPercentual: faixaAtual.percentual,
      comissaoValor: +comissaoValor.toFixed(2),
      faixaAtual,
      faixaProxima,
      faltaParaProxima,
      percentualProgresso,
      tetoAtingido: faixaAtual.max === null,
      bonusPrimeiraParcela: faixaAtual.bonusPrimeiraParcela || null
    };
  }

  /**
   * Comissão sobre Imediato (Urnas ou Itens Diversos).
   * @param {number} valor - faturamento da categoria
   * @param {"urnas"|"itens_diversos"} categoria
   * @param {"plantao_diurno"|"plantao_comercial"|"plantao_noturno"} turno
   * @param {object} rules - commissionRules.json já carregado
   */
  function calcularImediato(valor, categoria, turno, rules) {
    validarValor(valor);
    const faixas = rules.imediato[categoria] && rules.imediato[categoria][turno];
    if (!faixas) throw new Error(`Tabela não encontrada: imediato.${categoria}.${turno}`);

    const faixaAtual = encontrarFaixa(faixas, valor);
    const comissaoValor = faixaAtual ? valor * (faixaAtual.percentual / 100) : 0;
    return montarResultado(faixas, valor, faixaAtual, comissaoValor);
  }

  /**
   * Comissão sobre Adesão.
   * @param {number} taxaAdesao - valor da taxa de adesão paga pelo cliente
   * @param {number} quantidadePlanos - qtd de planos vendidos no mês (define a faixa)
   * @param {"televendas"|"atendimento"} setor
   * @param {string|null} turno - obrigatório se setor === "atendimento"
   * @param {"base"|"out2026"|"jan2027"} periodo
   */
  function calcularAdesao(taxaAdesao, quantidadePlanos, setor, turno, periodo, rules) {
    validarValor(taxaAdesao);
    validarValor(quantidadePlanos);

    let faixas;
    if (setor === "televendas") {
      faixas = rules.adesao.televendas[periodo];
    } else if (setor === "atendimento") {
      faixas = rules.adesao.atendimento[turno] && rules.adesao.atendimento[turno][periodo];
    }
    if (!faixas) throw new Error(`Tabela não encontrada: adesao.${setor}.${turno || ""}.${periodo}`);

    const faixaAtual = encontrarFaixa(faixas, quantidadePlanos);
    const comissaoValor = faixaAtual ? taxaAdesao * (faixaAtual.percentual / 100) : 0;
    return montarResultado(faixas, quantidadePlanos, faixaAtual, comissaoValor);
  }

  /**
   * Comissão sobre Parcelas Pagas (exclusiva Televendas).
   * @param {number} valorParcela
   * @param {"primeira"|"segunda"|"terceira"|"quarta"} numeroParcela
   */
  function calcularParcela(valorParcela, numeroParcela, rules) {
    validarValor(valorParcela);
    const faixas = rules.parcelas.televendas[numeroParcela];
    if (!faixas) throw new Error(`Tabela não encontrada: parcelas.televendas.${numeroParcela}`);

    const faixaAtual = encontrarFaixa(faixas, valorParcela);
    const comissaoValor = faixaAtual ? valorParcela * (faixaAtual.percentual / 100) : 0;
    return montarResultado(faixas, valorParcela, faixaAtual, comissaoValor);
  }

  /**
   * Gratificação sobre Vendas Imediatas ou Vendas Previdenciárias.
   * Campo de faturamento próprio, independente do valor usado em Urnas/Itens Diversos.
   * @param {number} valor - faturamento da categoria de gratificação
   * @param {"vendas_imediatas"|"vendas_previdenciarias"} tipo
   */
  function calcularGratificacao(valor, tipo, rules) {
    validarValor(valor);
    const faixas = rules.gratificacoes && rules.gratificacoes[tipo];
    if (!faixas) throw new Error(`Tabela não encontrada: gratificacoes.${tipo}`);

    const faixaAtual = encontrarFaixa(faixas, valor);
    const comissaoValor = faixaAtual ? valor * (faixaAtual.percentual / 100) : 0;
    return montarResultado(faixas, valor, faixaAtual, comissaoValor);
  }

  return { calcularImediato, calcularAdesao, calcularParcela, calcularGratificacao };
});
