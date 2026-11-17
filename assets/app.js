(function () {
  'use strict';

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var NS = 'http://www.w3.org/2000/svg';
  var reduce = false;
  try { reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
  if (reduce) document.documentElement.classList.add('reduce');

  function esc(t) {
    return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
  }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  function val(v) {
    if (typeof v === 'string') return '<span class="s">"' + esc(v) + '"</span>';
    return '<span class="n">' + esc(v) + '</span>';
  }
  function jsonHtml(obj) {
    var keys = Object.keys(obj);
    var h = '<span class="ln" style="--i:0">{</span>';
    keys.forEach(function (k, i) {
      h += '<span class="ln" style="--i:' + (i + 1) + '">  <span class="k">"' + esc(k) + '"</span>: ' + val(obj[k]) + (i < keys.length - 1 ? ',' : '') + '</span>';
    });
    h += '<span class="ln" style="--i:' + (keys.length + 1) + '">}</span>';
    return h;
  }
  function putJson(el, obj, animate) {
    el.classList.remove('type');
    el.innerHTML = jsonHtml(obj);
    if (animate && !reduce) { void el.offsetWidth; el.classList.add('type'); }
  }
  function tableHtml(obj) {
    var h = '<table class="kv">';
    Object.keys(obj).forEach(function (k) {
      var v = obj[k];
      h += '<tr><td>' + esc(k) + '</td><td class="' + (typeof v === 'string' ? 's' : 'n') + '">' + esc(v) + '</td></tr>';
    });
    return h + '</table>';
  }

  /* ---------- contadores ---------- */
  function setCount(el, v) {
    var dec = parseInt(el.getAttribute('data-dec') || '0', 10);
    el.textContent = (el.getAttribute('data-pre') || '') +
      v.toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec }) +
      (el.getAttribute('data-suf') || '');
  }
  function runCount(el) {
    if (el.getAttribute('data-ran')) return;
    el.setAttribute('data-ran', '1');
    var to = parseFloat(el.getAttribute('data-count'));
    if (isNaN(to)) return;
    if (reduce) { setCount(el, to); return; }
    var t0 = null, dur = 1200;
    function step(t) {
      if (!t0) t0 = t;
      var p = Math.min(1, (t - t0) / dur);
      setCount(el, to * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  var clockEl = $('#clock');
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function now() { var d = new Date(); return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()); }
  var t0 = now();
  if (clockEl) { clockEl.textContent = t0; }

  (function heroJson() {
    var host = 'direto';
    try { if (document.referrer) host = new URL(document.referrer).hostname || 'direto'; } catch (e) {}
    var lang = (navigator.language || 'pt-BR');
    var w = window.innerWidth, h = window.innerHeight;
    putJson($('#trigJson'), {
      evento: 'visita',
      horario: t0,
      dispositivo: w < 760 ? 'mobile' : 'desktop',
      idioma: lang,
      origem: host,
      tela: w + 'x' + h
    }, true);
  })();

  var flow = $('#flow');
  var wires = $('#wires');
  var seq = $$('[data-n]');
  var TOTAL = seq.filter(function (e) { return e.id !== 'n-anchor'; }).length;
  var hudLabel = $('#hudLabel'), hudBar = $('#hudBar'), hudCount = $('#hudCount');
  var doneIdx = -1;

  function portOf(el, kind) {
    if (el.id === 'n-anchor') return el;
    if (el.id === 'chat') return kind === 'in' ? $('#chatAnchor') : null;
    return $('.port.' + kind, el);
  }

  var wireList = [];
  function addWire(out, inn, to) {
    var base = document.createElementNS(NS, 'path');
    base.setAttribute('class', 'w-base');
    var act = document.createElementNS(NS, 'path');
    act.setAttribute('class', 'w-act');
    act.setAttribute('pathLength', '1');
    act.style.strokeDasharray = '1';
    act.style.strokeDashoffset = '1';
    act.style.transition = reduce ? 'none' : 'stroke-dashoffset .9s cubic-bezier(.22,1,.36,1)';
    wires.appendChild(base);
    wires.appendChild(act);
    wireList.push({ out: out, inn: inn, base: base, act: act, to: to });
  }
  function buildWires() {
    wires.innerHTML = '';
    wireList = [];
    for (var i = 0; i < seq.length - 1; i++) {
      var a = seq[i], b = seq[i + 1];
      if (a.hasAttribute('data-nowire')) continue;
      var out = portOf(a, 'out'), inn = portOf(b, 'in');
      if (!out || !inn) continue;
      addWire(out, inn, i + 1);
    }
    $$('.fan').forEach(function (fan) {
      var from = document.getElementById(fan.getAttribute('data-from'));
      var to = document.getElementById(fan.getAttribute('data-to'));
      if (!from || !to) return;
      var fi = seq.indexOf(from), ti = seq.indexOf(to);
      var pOut = portOf(from, 'out'), nIn = portOf(to, 'in');
      if (!pOut || !nIn) return;
      $$('.sub', fan).forEach(function (c) {
        addWire(pOut, $('.port.in', c), fi);
        addWire($('.port.out', c), nIn, ti);
      });
    });
    layoutWires();
    updateWires();
  }
  function center(el, fr) {
    var r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2 - fr.left, y: r.top + r.height / 2 - fr.top };
  }
  function layoutWires() {
    var fr = flow.getBoundingClientRect();
    wires.setAttribute('width', Math.ceil(fr.width));
    wires.setAttribute('height', Math.ceil(fr.height));
    wireList.forEach(function (w) {
      var p1 = center(w.out, fr), p2 = center(w.inn, fr);
      var d = Math.max(40, (p2.y - p1.y) * 0.5);
      var path = 'M' + p1.x.toFixed(1) + ' ' + p1.y.toFixed(1) + ' C' + p1.x.toFixed(1) + ' ' + (p1.y + d).toFixed(1) + ' ' + p2.x.toFixed(1) + ' ' + (p2.y - d).toFixed(1) + ' ' + p2.x.toFixed(1) + ' ' + p2.y.toFixed(1);
      w.base.setAttribute('d', path);
      w.act.setAttribute('d', path);
    });
  }
  function updateWires() {
    wireList.forEach(function (w) {
      w.act.style.strokeDashoffset = (w.to <= doneIdx) ? '0' : '1';
    });
  }

  function countDone() {
    var c = 0;
    for (var i = 0; i <= doneIdx && i < seq.length; i++) if (seq[i].id !== 'n-anchor') c++;
    return c;
  }
  function paintHud() {
    var c = countDone();
    hudCount.textContent = c + '/' + TOTAL;
    hudBar.style.transform = 'scaleX(' + (c / TOTAL) + ')';
    if (c >= TOTAL) {
      hudLabel.textContent = 'Workflow executado com sucesso';
      document.body.classList.add('at-chat');
    } else if (c === 0) {
      hudLabel.textContent = 'Aguardando execução';
      document.body.classList.remove('at-chat');
    } else {
      var el = seq[doneIdx];
      if (el.id === 'n-anchor') el = seq[doneIdx - 1];
      hudLabel.textContent = el.getAttribute('data-name') || '';
      document.body.classList.remove('at-chat');
    }
  }
  function stamp(el) {
    try {
      var d = $('.status .d', el);
      if (d && !d.getAttribute('data-s')) {
        d.setAttribute('data-s', '1');
        d.innerHTML = 'executado <small>' + now() + '</small>';
      }
      $$('[data-count]', el).forEach(runCount);
    } catch (e) {}
  }
  function markUpTo(idx) {
    if (idx <= doneIdx) return;
    for (var i = 0; i <= idx; i++) {
      var el = seq[i];
      if (i > doneIdx) stamp(el);
      el.classList.add('done');
      if (el.id === 'chat') { var ca = $('#chatAnchor'); if (ca) ca.classList.add('done'); }
    }
    doneIdx = idx;
    $$('.fan .sub').forEach(function (c) {
      var pi = seq.indexOf(document.getElementById(c.parentNode.getAttribute('data-from')));
      if (pi >= 0 && pi <= idx) c.classList.add('done');
    });
    paintHud();
    updateWires();
  }

  var io = null;
  if ('IntersectionObserver' in window) {
    io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        var idx = seq.indexOf(en.target);
        if (idx === 0) return;
        markUpTo(idx);
      });
    }, { rootMargin: '0px 0px -22% 0px', threshold: 0.02 });
    seq.forEach(function (el) { if (el.id !== 'n-trigger') io.observe(el); });
  } else {
    markUpTo(seq.length - 1);
  }
  setTimeout(function () { markUpTo(0); }, reduce ? 0 : 750);

  /* ---------- demonstração ---------- */
  var IC = { wa: '#i-wa', db: '#i-db', split: '#i-split', spark: '#i-spark', key: '#i-key', rpa: '#i-rpa', send: '#i-send', user: '#i-user' };
  var NODES = {
    trig:   { x: 65,  y: 180, ic: 'wa',    t: 'Mensagem',      s: 'cliente escreve',       trig: true },
    queue:  { x: 210, y: 180, ic: 'db',    t: 'Fila e buffer', s: 'RabbitMQ · Redis 10 s' },
    router: { x: 355, y: 180, ic: 'split', t: 'Roteador',      s: 'regras antes do LLM' },
    agent:  { x: 520, y: 180, ic: 'spark', t: 'Agente de IA',  s: 'Gemini, fallback Groq' },
    human:  { x: 520, y: 55,  ic: 'user',  t: 'Transbordo',    s: 'setor e horário' },
    guard:  { x: 690, y: 55,  ic: 'key',   t: 'Guardrail',     s: 'valida em código' },
    tool:   { x: 690, y: 180, ic: 'rpa',   t: 'Ferramenta',    s: 'executa a ação' },
    reply:  { x: 885, y: 180, ic: 'send',  t: 'Resposta',      s: 'volta ao WhatsApp' }
  };
  var EDGES = [
    ['trig', 'queue'], ['queue', 'router'], ['router', 'agent'], ['router', 'human'],
    ['agent', 'guard'], ['guard', 'tool'], ['tool', 'reply'], ['human', 'reply'], ['guard', 'reply']
  ];
  var SCEN = [
    {
      id: 'boleto', label: '2ª via de boleto',
      path: ['trig', 'queue', 'router', 'agent', 'guard', 'tool', 'reply'],
      steps: [
        { say: 'Um cliente escreve no WhatsApp pedindo a 2ª via do boleto.',
          out: { de: '+55 41 9****-0000', texto: 'Oi, preciso da 2ª via do meu boleto', canal: 'whatsapp' },
          msg: { w: 'u', t: 'Oi! Preciso da 2ª via do meu boleto.' } },
        { say: 'A mensagem entra numa fila. Um buffer no Redis espera 10 s para juntar quem escreve em várias mensagens seguidas.',
          out: { fila: 'whatsapp.entrada', buffer_s: 10, mensagens: 1 } },
        { say: 'Antes de gastar um token de LLM, um roteador com regras decide para onde a conversa vai.',
          out: { intencao: 'boleto', rota: 'agente', llm_chamado: false } },
        { say: 'O agente entende o pedido, lê a memória da conversa e pede a confirmação de identidade antes de agir.',
          out: { modelo: 'gemini', fallback: 'groq', memoria: 'redis, 7 dias', dados_sensiveis_no_contexto: false },
          msg: { w: 'a', t: 'Claro! Para a sua segurança, me confirma os 3 últimos dígitos do seu CPF?' } },
        { say: 'O dado informado é validado em código. Quem garante a regra não é o LLM.',
          out: { validacao: 'ultimos_3_digitos', confere: true, dados_liberados: true },
          msg: { w: 'u', t: '482' } },
        { say: 'Só depois da validação a ferramenta executa a ação.',
          out: { acao: 'gerar_segunda_via', status: 'gerada' } },
        { say: 'A resposta volta ao WhatsApp em segundos, sem atendente.',
          out: { texto: 'Prontinho! Enviei a 2ª via, com vencimento em 25/11.', tempo_s: 14, atendente: false },
          msg: { w: 'a', t: 'Prontinho! Enviei a 2ª via, com vencimento em 25/11.' } }
      ]
    },
    {
      id: 'negociar', label: 'Quer negociar (transbordo)',
      path: ['trig', 'queue', 'router', 'human', 'reply'],
      steps: [
        { say: 'O cliente quer negociar a dívida. Esse assunto não é do agente.',
          out: { de: '+55 41 9****-0000', texto: 'Quero negociar o valor da minha dívida', canal: 'whatsapp' },
          msg: { w: 'u', t: 'Quero negociar o valor da minha dívida.' } },
        { say: 'Mesma entrada: fila e buffer de 10 s.',
          out: { fila: 'whatsapp.entrada', buffer_s: 10, mensagens: 1 } },
        { say: 'O roteador reconhece o assunto sem acionar o LLM e desvia a conversa antes do agente.',
          out: { intencao: 'negociacao', rota: 'transbordo', llm_chamado: false } },
        { say: 'O transbordo usa uma frase pré-aprovada, o setor certo e o horário real de atendimento humano.',
          out: { setor: 'negociacao', horario_humano: 'aberto', frase: 'pre-aprovada', contexto_enviado: true } },
        { say: 'O cliente recebe a confirmação e a conversa segue com uma pessoa.',
          out: { texto: 'Certo! Vou te passar para o time de negociação, que já recebe o seu contexto.', atendente: true },
          msg: { w: 'a', t: 'Certo! Vou te passar para o time de negociação, que já recebe o seu contexto.' } }
      ]
    },
    {
      id: 'numero', label: 'Número não confere',
      path: ['trig', 'queue', 'router', 'agent', 'guard', 'reply'],
      steps: [
        { say: 'O cliente pede o link do boleto, mas num número diferente do cadastro.',
          out: { de: '+55 41 9****-0000', texto: 'Manda o boleto pra esse outro número', canal: 'whatsapp' },
          msg: { w: 'u', t: 'Manda o boleto pra esse outro número aqui: (41) 9****-1234' } },
        { say: 'Entrada normal: fila e buffer.',
          out: { fila: 'whatsapp.entrada', buffer_s: 10, mensagens: 1 } },
        { say: 'O assunto é de boleto, então a conversa vai para o agente.',
          out: { intencao: 'boleto', rota: 'agente', llm_chamado: false } },
        { say: 'O agente tenta atender e chama a ferramenta. A decisão final não fica com ele.',
          out: { modelo: 'gemini', ferramenta: 'enviar_link', numero_informado: 'diferente do cadastro' } },
        { say: 'O guardrail em código bloqueia o envio. O link nunca sai para um número que não bate com o cadastro.',
          out: { numero_confere: false, acao: 'bloquear_envio', proximo_passo: 'pedir confirmacao' } },
        { say: 'O agente pede o número que está no contrato, sem expor nenhum dado sensível.',
          out: { texto: 'Não consegui confirmar esse número com o cadastro. Pode me enviar o número que consta no contrato?', link_enviado: false },
          msg: { w: 'a', t: 'Não consegui confirmar esse número com o cadastro. Pode me enviar o número que consta no contrato?' } }
      ]
    }
  ];

  var stage = $('.stage'), pin = $('#demo'), wfView = $('#wfView'), wf = $('#wf'), wfWires = $('#wfWires');
  var scenBox = $('#scen'), sayEl = $('#say'), progEl = $('#prog'), outName = $('#outName'), outJson = $('#outJson');
  var paneChat = $('#paneChat'), paneTable = $('#paneTable');
  var H = 270;
  var scenIdx = 0, lastKey = '', manualStep = null;
  var nodeEls = {}, edgeEls = [];

  var panes = { chat: paneChat, table: paneTable, json: outJson };
  function showTab(name) {
    Object.keys(panes).forEach(function (k) { if (panes[k]) panes[k].hidden = (k !== name); });
    $$('.tabs button').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-tab') === name ? 'true' : 'false'); });
  }
  $$('.tabs button').forEach(function (b) {
    b.addEventListener('click', function () { showTab(b.getAttribute('data-tab')); });
  });
  showTab('chat');

  function renderPanes(sc, step) {
    if (!paneChat || !paneTable) return;
    var h = '';
    for (var i = 0; i <= step && i < sc.steps.length; i++) {
      var m = sc.steps[i].msg;
      if (!m) continue;
      h += '<div class="wb ' + m.w + (i === step ? ' new' : '') + '">' + esc(m.t) + '</div>';
    }
    paneChat.innerHTML = h || '<p class="wa-empty">A conversa aparece aqui conforme o fluxo executa.</p>';
    paneChat.scrollTop = paneChat.scrollHeight;
    paneTable.innerHTML = step < 0 ? '<p class="wa-empty">Role para executar o fluxo.</p>' : tableHtml(sc.steps[step].out);
  }

  function buildWorkflow() {
    Object.keys(NODES).forEach(function (k) {
      var n = NODES[k];
      var d = document.createElement('div');
      d.className = 'wn' + (n.trig ? ' trig' : '');
      d.style.setProperty('--x', n.x);
      d.style.setProperty('--y', n.y);
      d.innerHTML = '<svg class="ico"><use href="' + IC[n.ic] + '"/></svg><div class="lab">' + esc(n.t) + '<small>' + esc(n.s) + '</small></div>';
      wf.appendChild(d);
      nodeEls[k] = d;
    });
    EDGES.forEach(function (e) {
      var a = NODES[e[0]], b = NODES[e[1]];
      var x1 = a.x + 36, y1 = a.y, x2 = b.x - 36, y2 = b.y;
      var dx = Math.max(30, (x2 - x1) * 0.5);
      var d = 'M' + x1 + ' ' + y1 + ' C' + (x1 + dx) + ' ' + y1 + ' ' + (x2 - dx) + ' ' + y2 + ' ' + x2 + ' ' + y2;
      var base = document.createElementNS(NS, 'path'); base.setAttribute('class', 'e-base'); base.setAttribute('d', d);
      var act = document.createElementNS(NS, 'path'); act.setAttribute('class', 'e-act'); act.setAttribute('d', d);
      act.setAttribute('pathLength', '1'); act.style.strokeDasharray = '1'; act.style.strokeDashoffset = '1';
      if (reduce) act.style.transition = 'none';
      wfWires.appendChild(base); wfWires.appendChild(act);
      edgeEls.push({ from: e[0], to: e[1], act: act });
    });
  }

  function buildScen() {
    SCEN.forEach(function (s, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = s.label;
      b.setAttribute('aria-pressed', i === 0 ? 'true' : 'false');
      b.addEventListener('click', function () {
        scenIdx = i;
        manualStep = reduce ? SCEN[i].steps.length - 1 : null;
        $$('button', scenBox).forEach(function (x, j) { x.setAttribute('aria-pressed', j === i ? 'true' : 'false'); });
        lastKey = '';
        renderDemo(true);
      });
      scenBox.appendChild(b);
    });
  }

  function progress() {
    var r = pin.getBoundingClientRect();
    var span = pin.offsetHeight - window.innerHeight;
    if (span <= 0) return 1;
    return clamp(-r.top / span, 0, 1);
  }

  var fit = { s: 1, tx: 0, compact: false };
  function computeFit(activeX) {
    var W = wfView.clientWidth;
    var st = getComputedStyle(stage);
    var gap = parseFloat(st.rowGap) || 0;
    var padV = (parseFloat(st.paddingTop) || 0) + (parseFloat(st.paddingBottom) || 0);
    var head = $('.stage-head').offsetHeight, foot = $('.stage-foot').offsetHeight;
    var availH = stage.clientHeight - padV - head - foot - gap * 2;
    var sW = W / 980;
    var sH = availH / H;
    var s = clamp(Math.min(1, sW, sH > 0 ? sH : 1), 0.7, 1);
    if (reduce || stage.style.position === 'relative') s = clamp(Math.min(1, sW), 0.7, 1);
    var cw = 980 * s;
    var tx;
    if (cw <= W + 1) tx = (W - cw) / 2;
    else tx = clamp(W / 2 - activeX * s, W - cw, 0);
    fit = { s: s, tx: tx, compact: s < 0.85 };
  }

  function renderDemo(force) {
    var sc = SCEN[scenIdx];
    var n = sc.steps.length;
    var step;
    if (manualStep !== null) step = manualStep;
    else {
      var p = progress();
      step = clamp(Math.floor(p * (n + 1)) - 1, -1, n - 1);
    }
    var key = scenIdx + ':' + step;
    var activeNode = sc.path[Math.max(0, step)];
    computeFit(NODES[activeNode].x);
    wf.classList.toggle('compact', fit.compact);
    wf.style.setProperty('--ls', fit.compact ? '1.25' : '1');
    wf.style.transform = 'translateX(' + fit.tx.toFixed(1) + 'px) scale(' + fit.s.toFixed(3) + ')';
    wfView.style.height = Math.ceil(H * fit.s) + 'px';

    if (key === lastKey && !force) return;
    lastKey = key;

    Object.keys(nodeEls).forEach(function (k) {
      var idx = sc.path.indexOf(k);
      var el = nodeEls[k];
      el.classList.toggle('off', idx < 0);
      el.classList.toggle('done', idx >= 0 && idx < step);
      el.classList.toggle('run', idx >= 0 && idx === step);
    });
    edgeEls.forEach(function (e) {
      var i = sc.path.indexOf(e.from);
      var on = i >= 0 && sc.path[i + 1] === e.to && step >= i + 1;
      e.act.style.strokeDashoffset = on ? '0' : '1';
    });

    progEl.innerHTML = '';
    for (var i = 0; i < n; i++) {
      var b = document.createElement('i');
      if (i <= step) b.className = 'on';
      if (manualStep !== null) { b.style.cursor = 'pointer'; b.style.height = '8px'; b.style.padding = '0'; (function (j) { b.addEventListener('click', function () { manualStep = j; renderDemo(true); }); })(i); }
      progEl.appendChild(b);
    }

    if (step < 0) {
      sayEl.textContent = 'Role para executar. O fluxo começa quando um cliente escreve no WhatsApp.';
      outName.textContent = '—';
      putJson(outJson, {}, false);
      outJson.innerHTML = '<span class="ln">{ }</span>';
    } else {
      var st = sc.steps[step];
      sayEl.textContent = st.say;
      outName.textContent = NODES[sc.path[step]].t;
      putJson(outJson, st.out, true);
    }
    renderPanes(sc, step);
    if (step >= n - 1 && manualStep === null && progress() >= 0.999) {
      var an = $('#n-anchor');
      if (an) { var ai = seq.indexOf(an); if (ai >= 0) markUpTo(ai); }
    }
  }

  buildWorkflow();
  buildScen();
  if (reduce) manualStep = SCEN[0].steps.length - 1;

  var ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () { ticking = false; renderDemo(false); });
  }
  window.addEventListener('scroll', onScroll, { passive: true });

  var rz = 0;
  function relayout() {
    layoutWires();
    wf.classList.add('nt');
    renderDemo(true);
    requestAnimationFrame(function () { wf.classList.remove('nt'); });
  }
  window.addEventListener('resize', function () { clearTimeout(rz); rz = setTimeout(relayout, 120); });
  window.addEventListener('load', function () { relayout(); setTimeout(relayout, 400); });
  if ('ResizeObserver' in window) {
    var ro = new ResizeObserver(function () { clearTimeout(rz); rz = setTimeout(layoutWires, 80); });
    ro.observe(flow);
  }
  $$('details.how').forEach(function (d) { d.addEventListener('toggle', function () { setTimeout(layoutWires, 30); }); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(relayout);

  buildWires();
  renderDemo(true);
  wf.classList.add('nt');
  requestAnimationFrame(function () { requestAnimationFrame(function () { wf.classList.remove('nt'); }); });

  var auto = false, raf = 0, lastT = 0, savedBehavior = '';
  function stopAuto() {
    if (!auto) return;
    auto = false;
    cancelAnimationFrame(raf);
    document.body.classList.remove('auto');
    document.documentElement.style.scrollBehavior = savedBehavior;
    ['wheel', 'touchstart', 'keydown'].forEach(function (ev) { window.removeEventListener(ev, stopAuto); });
  }
  function startAuto() {
    if (auto) return;
    var maxY = document.documentElement.scrollHeight - window.innerHeight;
    savedBehavior = document.documentElement.style.scrollBehavior;
    document.documentElement.style.scrollBehavior = 'auto';
    if (window.scrollY >= maxY - 40) window.scrollTo(0, 0);
    auto = true;
    document.body.classList.add('auto');
    ['wheel', 'touchstart', 'keydown'].forEach(function (ev) { window.addEventListener(ev, stopAuto, { passive: true }); });
    lastT = 0;
    var y = window.scrollY;
    function tick(t) {
      if (!auto) return;
      if (!lastT) lastT = t;
      var dt = Math.min(0.05, (t - lastT) / 1000);
      lastT = t;
      var r = pin.getBoundingClientRect();
      var span = pin.offsetHeight - window.innerHeight;
      var inPin = r.top <= 0 && r.bottom > window.innerHeight;
      var v = inPin ? Math.max(70, span / 26) : 300;
      y += v * dt;
      var mx = document.documentElement.scrollHeight - window.innerHeight;
      window.scrollTo(0, y);
      if (y >= mx - 2) { stopAuto(); return; }
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
  }
  ['autoBtn', 'autoBtn2'].forEach(function (id) {
    var b = document.getElementById(id);
    if (b) b.addEventListener('click', startAuto);
  });
  var sb = $('#stopBtn');
  if (sb) sb.addEventListener('click', stopAuto);

  /* ---------- chat de perguntas ---------- */
  var norm = function (s) {
    return String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9+\s]/g, ' ').replace(/\s+/g, ' ').trim();
  };

  var KB = [
    { id: 'quem', q: 'Quem é a Kamilla?', k: ['quem', 'voce', 'sobre', 'apresent', 'resumo', 'perfil', 'kamilla', 'conta', 'fala de voce'],
      a: 'Sou a Kamilla, AI & Automation Specialist em Curitiba. Sou tecnóloga em Análise e Desenvolvimento de Sistemas e trabalho há mais de 2 anos com IA aplicada e automação de processos. Desenho e coloco em produção agentes de IA orquestrados em n8n, ligados a WhatsApp, banco de dados, filas e APIs.' },
    { id: 'exp', q: 'Qual é a sua experiência?', k: ['experiencia', 'carreira', 'trabalh', 'empresa', 'cargo', 'historico', 'trajetoria', 'atua', 'top one', 'caunutro'],
      a: 'Desde 02/2026 sou Automation Specialist na Top One Serviços de Crédito: três agentes de IA no WhatsApp (suporte a parceiros, pós-venda e recuperação de crédito), a régua de cobrança, WhatsApp Flows e a infraestrutura de n8n, filas e Docker Swarm por trás deles. Antes fui AI Automation & IT Analyst na Caunutro (2025 a 2026) e estagiária de tecnologia lá (2024).' },
    { id: 'parceiros', q: 'Como é o agente de suporte a lojistas?', k: ['parceiro', 'lojista', 'token', 'suporte', 'atendimento'],
      a: 'É um agente de WhatsApp para lojistas: reenvia token de verificação, orienta o acesso e faz a triagem do assunto. Reenviou 17,2 mil tokens, com resposta mediana de 16 s. Roteamento e validações ficam em código, e o LLM entra onde faz sentido. Dá para ver a lógica na demonstração acima.' },
    { id: 'posvenda', q: 'E o agente de pós-venda?', k: ['pos venda', 'posvenda', 'pesquisa de satisfacao', 'satisfacao', 'referencia', 'busca de cliente'],
      a: 'Faz a pesquisa de satisfação pós-venda e busca clientes por contatos de referência. Acionou 36,7 mil clientes e teve 49% de resposta na pesquisa. São três etapas no mesmo fluxo (busca, satisfação e desconhecido), e a lógica de etapa fica em código.' },
    { id: 'recuperacao', q: 'O que é o piloto de recuperação de crédito?', k: ['piloto', 'inadimpl', 'recuperacao', 'risco', 'negocia'],
      a: 'É um piloto com um agente por nível de risco (normal, atenção, alerta e crítico), com negociação sempre com humano. Foram 654 inadimplentes contatados, 32,8% responderam e 102 quitaram no período (R$ 22,3 mil), sem atribuição exclusiva à IA. Dados sensíveis só entram no contexto depois que o cliente confirma a identidade.' },
    { id: 'regua', q: 'Quais os resultados da régua de cobrança?', k: ['regua', 'cobranca', 'resultado', 'numero', 'metrica', 'impacto', 'pagamento', 'boleto'],
      a: 'A taxa de pagamento em 11 dias após o vencimento subiu 3,71 p.p. no 3º trimestre de 2026 vs 2025, e 29% dos chats de cobrança são resolvidos sem atendente humano. A régua é preventiva e de atraso (D-5 a D+20), com 2ª via de boleto automática e agendamento de promessa de pagamento.' },
    { id: 'flows', q: '', k: ['whatsapp flows', 'flows do whatsapp', 'formulario', 'formularios', 'flow json'],
      a: 'Sim. Uso WhatsApp Flows, os formulários e jornadas guiadas que abrem dentro do próprio WhatsApp, na cobrança: o cliente resolve a pendência em poucos toques, sem link externo e sem esperar um atendente, o que reduz o esforço manual da operação.' },
    { id: 'ml', q: 'Você usa machine learning?', k: ['machine learning', 'xgboost', 'predicao', 'previsao', 'preditivo'],
      a: 'Desenvolvi um modelo de predição de pagamento por parcela. Em 17,8 mil parcelas testadas, o quartil de maior confiança pagou 84,8% em 11 dias, contra 25,6% no de menor. Ainda está em fase de teste.' },
    { id: 'stack', q: 'Qual é a sua stack?', k: ['stack', 'ferramenta', 'tecnolog', 'linguagem', 'python', 'javascript', 'sql', 'react', 'postgres', 'make', 'zapier', 'tecnica', 'usa'],
      a: 'IA: Gemini, Claude, OpenAI, Groq, LangChain, RAG, XGBoost e engenharia de prompt. Automação: n8n, Hyperflow, Make, Power Automate, Zapier, RPA com Playwright, WhatsApp Business API (incluindo WhatsApp Flows), RabbitMQ e Redis. Código e dados: Python, JavaScript, TypeScript, Node.js, SQL, PostgreSQL, React e Power BI. Infra: Docker, Docker Swarm, Traefik, Portainer, Nginx e Tailscale.' },
    { id: 'n8n', q: 'Como é a infraestrutura?', k: ['n8n', 'infra', 'docker', 'swarm', 'rabbit', 'redis', 'fila', 'queue', 'servidor', 'deploy', 'arquitetura', 'self hosted'],
      a: 'O n8n roda self-hosted em Docker Swarm, em modo fila, com Traefik na frente e RabbitMQ entre o recebimento do WhatsApp e a execução, o que desacopla picos de mensagem do processamento. A memória das conversas fica no Redis, os dados no PostgreSQL, e os modelos têm fallback automático entre Gemini, Claude e Groq.' },
    { id: 'guard', q: 'Como você evita erro da IA?', k: ['alucin', 'erro', 'guardrail', 'seguranca', 'confiavel', 'controle', 'llm', 'prompt', 'inventa', 'evita', 'ia'],
      a: 'Não deixo o LLM decidir tudo. O roteamento do assunto, a validação de número e identidade, os limites por parceiro e o cálculo do horário de atendimento humano ficam em código, onde a regra é garantida. O LLM cuida da conversa e da escolha da ferramenta, e há fallback de modelo, memória com expiração e transbordo para humano quando o caso sai do escopo.' },
    { id: 'form', q: 'Qual é a sua formação?', k: ['formacao', 'faculdade', 'estudo', 'mba', 'usp', 'esalq', 'certific', 'curso', 'ibm', 'vanderbilt', 'positivo', 'graduacao'],
      a: 'Sou tecnóloga em Análise e Desenvolvimento de Sistemas pela Universidade Positivo (2023 a 2025) e faço MBA em Gestão de Negócios Digitais e IA na USP/Esalq (2026 a 2028). Em 2026 concluí Growth Intelligence (USP), RAG for Generative AI Applications, Building AI Agents and Agentic Workflows e RAG and Agentic AI (IBM) e AI Agent Developer (Vanderbilt). Os links estão na seção de certificações.' },
    { id: 'outras', q: 'O que você fez antes?', k: ['outras automacoes', 'nf e', 'nfe', 'power bi', 'correios', 'loggi', 'campanha', 'licenca', 'saas', 'economia', 'horas', 'antes'],
      a: 'Na Caunutro orquestrei um fluxo n8n completo (CRM, NF-e, boleto/Pix e expedição), que eliminou 35 h/mês de trabalho manual e zerou erros de digitação. Fiz também um pipeline n8n para Power BI (−40 h/mês) e integrei Correios e Loggi com avisos por WhatsApp (−40% de chamadas ao suporte). Como estagiária, apoiei campanhas em massa (98% de alcance) e a planilha de licenças SaaS (R$ 180 mil/ano projetados).' },
    { id: 'docs', q: 'Você documenta os fluxos?', k: ['document', 'pdf', 'manual', 'descricao dos fluxos', 'workflows documentados'],
      a: 'Sim. Gerei a documentação técnica de 47 workflows do n8n, nó a nó, seguindo a estrutura de pastas, com visão geral, arquitetura, contratos de entrada e saída e mapa de dados e integrações, além de um índice geral que cruza filas, chamadas entre fluxos e tabelas compartilhadas.' },
    { id: 'idioma', q: 'Quais idiomas você fala?', k: ['idioma', 'ingles', 'english', 'lingua'],
      a: 'Português nativo e inglês avançado (C1).' },
    { id: 'contato', q: 'Como falo com você?', k: ['contato', 'email', 'e mail', 'linkedin', 'whatsapp', 'zap', 'telefone', 'celular', 'falar', 'chamar', 'curriculo', 'cv', 'github', 'contratar', 'vaga', 'oportunidade'],
      a: 'O jeito mais rápido é o WhatsApp (botão verde no canto da tela). Também pode escrever para <a href="mailto:kamillafrsouza@gmail.com">kamillafrsouza@gmail.com</a>, me chamar no <a href="https://www.linkedin.com/in/kamilla-freitas-b7b18928a" target="_blank" rel="noopener">LinkedIn</a> ou baixar o <a href="assets/Kamilla-Freitas-Curriculo.pdf" download>currículo em PDF</a>.' },
    { id: 'site', q: 'Como este site foi feito?', k: ['site', 'portfolio', 'portifolio', 'pagina', 'feito', 'construiu', 'html', 'esse chat', 'chat'],
      a: 'É HTML, CSS e JavaScript puros, sem framework e sem biblioteca externa, feito do zero por mim. A página é desenhada como um workflow do n8n: cada seção é um nó que executa conforme você rola.' },
    { id: 'oi', q: '', k: ['oi', 'ola', 'bom dia', 'boa tarde', 'boa noite', 'e ai', 'hey', 'hello', 'hi'],
      a: 'Oi! Pergunte sobre meus projetos, resultados, stack, experiência ou como falar comigo.' }
  ];

  var SUGG_FIRST = ['parceiros', 'regua', 'posvenda', 'stack', 'contato'];
  var asked = {};
  var msgs = $('#msgs'), sugg = $('#sugg'), form = $('#chatForm'), input = $('#chatIn');

  function addMsg(cls, html, isText) {
    var d = document.createElement('div');
    d.className = 'msg ' + cls;
    if (isText) d.textContent = html; else d.innerHTML = html;
    msgs.appendChild(d);
    msgs.scrollTop = msgs.scrollHeight;
    return d;
  }
  function pickAnswer(text) {
    var q = ' ' + norm(text) + ' ';
    var best = null, bestScore = 0;
    KB.forEach(function (e) {
      var score = 0;
      e.k.forEach(function (kw) {
        var nk = norm(kw);
        if (!nk) return;
        var hit = nk.length <= 3 ? q.indexOf(' ' + nk + ' ') >= 0 : q.indexOf(nk) >= 0;
        if (hit) score += 1 + Math.min(2, nk.split(' ').length - 1) + (nk.length > 6 ? 0.5 : 0);
      });
      if (score > bestScore) { bestScore = score; best = e; }
    });
    return bestScore > 0 ? best : null;
  }
  function renderSugg() {
    sugg.innerHTML = '';
    var pool = KB.filter(function (e) { return e.q && !asked[e.id]; });
    var firsts = SUGG_FIRST.map(function (id) { return pool.filter(function (e) { return e.id === id; })[0]; }).filter(Boolean);
    var list = (firsts.length >= 3 ? firsts : pool).slice(0, 5);
    list.forEach(function (e) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = e.q;
      b.addEventListener('click', function () { ask(e.q, e); });
      sugg.appendChild(b);
    });
  }
  var busy = false;
  function ask(text, forced) {
    text = (text || '').trim();
    if (!text || busy) return;
    busy = true;
    addMsg('u', text, true);
    var entry = forced || pickAnswer(text);
    var typing = addMsg('a', '<span class="typing" aria-label="digitando"><i></i><i></i><i></i></span>');
    setTimeout(function () {
      if (entry) {
        asked[entry.id] = true;
        typing.innerHTML = entry.a;
      } else {
        typing.innerHTML = 'Essa eu não tenho pronta aqui. Tente perguntar sobre <b>projetos</b> (agentes de IA, régua), <b>resultados</b>, <b>stack</b>, <b>experiência</b>, <b>formação</b> ou <b>contato</b>. Se preferir, fale direto comigo pelo WhatsApp.';
      }
      msgs.scrollTop = msgs.scrollHeight;
      renderSugg();
      busy = false;
    }, reduce ? 0 : 550);
  }
  function resetChat() {
    msgs.innerHTML = '';
    asked = {};
    addMsg('a', 'Oi! Eu sou o chat do portfólio da Kamilla. Posso falar sobre projetos, resultados, stack e experiência. O que você quer saber?');
    renderSugg();
  }
  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    var v = input.value;
    input.value = '';
    ask(v);
  });
  $('#chatClear').addEventListener('click', resetChat);
  resetChat();

  /* ---------- efeitos extras: só ligam se tudo acima carregou ---------- */
  try {
    $$('[data-count]').forEach(function (el) {
      if (!reduce && !el.getAttribute('data-ran')) setCount(el, 0);
    });
    document.documentElement.classList.add('js-on');
  } catch (e) {}
})();
