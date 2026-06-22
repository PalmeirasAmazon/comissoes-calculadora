// Camada de UI — nunca lê commissionRules.json diretamente; só repassa o objeto pra CommissionLogic.
(function () {
  "use strict";

  let rules = null;
  const HISTORICO_KEY = "comissoes_historico";
  const ultimosResultados = {};
  const RESUMO_ORDEM = [
    ["adesao", "Adesão"],
    ["urnas", "Imediato — Urnas"],
    ["itens", "Imediato — Itens Diversos"],
    ["gratImediatas", "Gratificação de Vendas Imediatas"],
    ["gratPrevidenciarias", "Gratificação de Vendas Previdenciárias"],
    ["parcela", "Parcelas (Televendas)"]
  ];

  const fmtMoeda = (v) =>
    v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const fmtPct = (v) => `${v.toString().replace(".", ",")}%`;

  function carregarRegras() {
    return fetch("commissionRules.json").then((r) => {
      if (!r.ok) throw new Error("Não foi possível carregar commissionRules.json");
      return r.json();
    });
  }

  function lerHistorico() {
    try {
      return JSON.parse(localStorage.getItem(HISTORICO_KEY) || "[]");
    } catch {
      return [];
    }
  }

  function salvarNoHistorico(item) {
    const lista = lerHistorico();
    lista.unshift({ ...item, data: new Date().toISOString() });
    localStorage.setItem(HISTORICO_KEY, JSON.stringify(lista.slice(0, 50)));
    renderizarHistorico();
  }

  function renderizarHistorico() {
    const ul = document.getElementById("lista-historico");
    const lista = lerHistorico();
    ul.innerHTML = "";
    if (lista.length === 0) {
      ul.innerHTML = '<li class="historico-meta">Nenhuma simulação ainda.</li>';
      return;
    }
    lista.forEach((item) => {
      const li = document.createElement("li");
      const dataFmt = new Date(item.data).toLocaleString("pt-BR");
      li.innerHTML = `
        <span>${item.secao} — ${item.detalhe}</span>
        <span class="historico-meta">${fmtPct(item.percentual)} · ${fmtMoeda(item.valor)} · ${dataFmt}</span>
      `;
      ul.appendChild(li);
    });
  }

  function lerValorPositivo(input) {
    const bruto = input.value.trim();
    if (bruto === "") return { erro: "Informe um valor." };
    const num = Number(bruto);
    if (Number.isNaN(num)) return { erro: "Valor precisa ser numérico." };
    if (num < 0) return { erro: "Valor não pode ser negativo." };
    return { valor: num };
  }

  function renderizarResumoTotal() {
    const ul = document.getElementById("lista-resumo-total");
    const totalEl = document.getElementById("resumo-total-valor");
    if (!ul || !totalEl) return;

    ul.innerHTML = "";
    let total = 0;
    RESUMO_ORDEM.forEach(([key, label]) => {
      const r = ultimosResultados[key];
      const li = document.createElement("li");
      if (r) {
        total += r.valor;
        li.innerHTML = `<span class="resumo-categoria">${label}<small>${r.detalhe}</small></span><span class="resumo-valor">${fmtMoeda(r.valor)}</span>`;
      } else {
        li.innerHTML = `<span class="resumo-categoria resumo-vazio">${label}<small>ainda não calculado</small></span><span class="resumo-valor resumo-vazio">—</span>`;
      }
      ul.appendChild(li);
    });
    totalEl.textContent = fmtMoeda(total);
  }

  function renderizarResultado(containerId, resultado, detalhe) {
    const container = document.getElementById(containerId);
    if (!resultado.faixaAtual) {
      container.innerHTML = `<div class="resultado-card"><p class="erro">Valor abaixo da menor faixa cadastrada.</p></div>`;
      if (detalhe.categoriaKey) {
        ultimosResultados[detalhe.categoriaKey] = { detalhe: detalhe.label, valor: 0 };
        renderizarResumoTotal();
      }
      return;
    }

    const tetoBadge = resultado.tetoAtingido
      ? '<span class="badge-teto">Teto atingido</span>'
      : "";

    const barraProgresso = resultado.faixaProxima
      ? `
        <div class="progresso-track">
          <div class="progresso-fill" style="width:${resultado.percentualProgresso}%"></div>
        </div>
        <div class="resultado-linha">
          <span>Falta para próxima faixa (${fmtPct(resultado.faixaProxima.percentual)})</span>
          <span class="valor">${fmtMoeda(resultado.faltaParaProxima)}</span>
        </div>
      `
      : "";

    const notaBonus = resultado.bonusPrimeiraParcela
      ? `<p class="nota-bonus">+ bônus informativo de ${resultado.bonusPrimeiraParcela}% sobre a 1ª parcela da comissão (não somado automaticamente).</p>`
      : "";

    container.innerHTML = `
      <div class="resultado-card">
        ${tetoBadge}
        <div class="resultado-linha"><span>Faixa atual</span><span class="valor">${fmtPct(resultado.comissaoPercentual)}</span></div>
        <div class="resultado-comissao">${fmtMoeda(resultado.comissaoValor)}</div>
        ${barraProgresso}
        ${notaBonus}
      </div>
    `;

    salvarNoHistorico({
      secao: detalhe.secao,
      setor: detalhe.setor,
      turno: detalhe.turno || "-",
      detalhe: detalhe.label,
      percentual: resultado.comissaoPercentual,
      valor: resultado.comissaoValor
    });

    if (detalhe.categoriaKey) {
      ultimosResultados[detalhe.categoriaKey] = { detalhe: detalhe.label, valor: resultado.comissaoValor };
      renderizarResumoTotal();
    }
  }

  function mostrarErro(containerId, mensagem) {
    document.getElementById(containerId).innerHTML = `<p class="erro">${mensagem}</p>`;
  }

  function init() {
    carregarRegras()
      .then((data) => {
        rules = data;
        renderizarHistorico();
        renderizarResumoTotal();
      })
      .catch((e) => {
        document.querySelector(".container").innerHTML =
          `<p class="erro">Erro ao carregar regras de comissão: ${e.message}</p>`;
      });

    // Navegação por abas
    document.querySelectorAll(".aba").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".aba").forEach((b) => b.classList.remove("ativa"));
        document.querySelectorAll(".aba-conteudo").forEach((s) => s.classList.add("escondida"));
        btn.classList.add("ativa");
        document.getElementById(`aba-${btn.dataset.aba}`).classList.remove("escondida");
      });
    });

    const setorSelect = document.getElementById("setor");
    const campoTurno = document.getElementById("campo-turno");
    setorSelect.addEventListener("change", () => {
      campoTurno.style.display = setorSelect.value === "televendas" ? "none" : "flex";
    });

    // Adesão
    document.getElementById("btn-adesao").addEventListener("click", () => {
      if (!rules) return;
      const taxaInput = document.getElementById("adesao-taxa");
      const qtdInput = document.getElementById("adesao-qtd");
      const taxa = lerValorPositivo(taxaInput);
      const qtd = lerValorPositivo(qtdInput);

      if (taxa.erro) return mostrarErro("resultado-adesao", taxa.erro);
      if (qtd.erro) return mostrarErro("resultado-adesao", qtd.erro);

      const setor = setorSelect.value;
      const turno = document.getElementById("turno").value;
      const periodo = document.getElementById("periodo").value;

      try {
        const resultado = CommissionLogic.calcularAdesao(
          taxa.valor, qtd.valor, setor, setor === "atendimento" ? turno : null, periodo, rules
        );
        renderizarResultado("resultado-adesao", resultado, {
          secao: "Adesão",
          setor,
          turno: setor === "atendimento" ? turno : "televendas",
          label: `${setor}${setor === "atendimento" ? " / " + turno : ""} (${periodo})`,
          categoriaKey: "adesao"
        });
      } catch (e) {
        mostrarErro("resultado-adesao", e.message);
      }
    });

    // Imediato — Urnas
    document.getElementById("btn-urnas").addEventListener("click", () => {
      if (!rules) return;
      const v = lerValorPositivo(document.getElementById("urnas-valor"));
      if (v.erro) return mostrarErro("resultado-urnas", v.erro);

      const turno = document.getElementById("turno").value;
      try {
        const resultado = CommissionLogic.calcularImediato(v.valor, "urnas", turno, rules);
        renderizarResultado("resultado-urnas", resultado, {
          secao: "Imediato — Urnas", setor: "atendimento", turno, label: turno, categoriaKey: "urnas"
        });
      } catch (e) {
        mostrarErro("resultado-urnas", e.message);
      }
    });

    // Imediato — Itens Diversos
    document.getElementById("btn-itens").addEventListener("click", () => {
      if (!rules) return;
      const v = lerValorPositivo(document.getElementById("itens-valor"));
      if (v.erro) return mostrarErro("resultado-itens", v.erro);

      const turno = document.getElementById("turno").value;
      try {
        const resultado = CommissionLogic.calcularImediato(v.valor, "itens_diversos", turno, rules);
        renderizarResultado("resultado-itens", resultado, {
          secao: "Imediato — Itens Diversos", setor: "atendimento", turno, label: turno, categoriaKey: "itens"
        });
      } catch (e) {
        mostrarErro("resultado-itens", e.message);
      }
    });

    // Imediato — Gratificação de Vendas Imediatas
    document.getElementById("btn-grat-imediatas").addEventListener("click", () => {
      if (!rules) return;
      const v = lerValorPositivo(document.getElementById("grat-imediatas-valor"));
      if (v.erro) return mostrarErro("resultado-grat-imediatas", v.erro);

      try {
        const resultado = CommissionLogic.calcularGratificacao(v.valor, "vendas_imediatas", rules);
        renderizarResultado("resultado-grat-imediatas", resultado, {
          secao: "Gratificação — Vendas Imediatas", setor: "atendimento", turno: null, label: "Vendas Imediatas", categoriaKey: "gratImediatas"
        });
      } catch (e) {
        mostrarErro("resultado-grat-imediatas", e.message);
      }
    });

    // Imediato — Gratificação de Vendas Previdenciárias
    document.getElementById("btn-grat-previdenciarias").addEventListener("click", () => {
      if (!rules) return;
      const v = lerValorPositivo(document.getElementById("grat-previdenciarias-valor"));
      if (v.erro) return mostrarErro("resultado-grat-previdenciarias", v.erro);

      try {
        const resultado = CommissionLogic.calcularGratificacao(v.valor, "vendas_previdenciarias", rules);
        renderizarResultado("resultado-grat-previdenciarias", resultado, {
          secao: "Gratificação — Vendas Previdenciárias", setor: "atendimento", turno: null, label: "Vendas Previdenciárias", categoriaKey: "gratPrevidenciarias"
        });
      } catch (e) {
        mostrarErro("resultado-grat-previdenciarias", e.message);
      }
    });

    // Parcelas
    document.getElementById("btn-parcela").addEventListener("click", () => {
      if (!rules) return;
      const v = lerValorPositivo(document.getElementById("parcela-valor"));
      if (v.erro) return mostrarErro("resultado-parcela", v.erro);

      const numeroParcela = document.getElementById("parcela-numero").value;
      try {
        const resultado = CommissionLogic.calcularParcela(v.valor, numeroParcela, rules);
        renderizarResultado("resultado-parcela", resultado, {
          secao: "Parcelas (Televendas)", setor: "televendas", turno: null, label: numeroParcela, categoriaKey: "parcela"
        });
      } catch (e) {
        mostrarErro("resultado-parcela", e.message);
      }
    });

    document.getElementById("btn-limpar-historico").addEventListener("click", () => {
      localStorage.removeItem(HISTORICO_KEY);
      renderizarHistorico();
    });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
