(function () {
  'use strict';

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var reduce = false;
  try { reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
  if (reduce) document.documentElement.classList.add('reduce');

  function esc(t) {
    return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function hhmm() { var d = new Date(); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function fmt(n, d) { return n.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }); }

  var ed = $('#edition');
  if (ed) ed.textContent = new Date().toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });

  var progEl = $('#progress'), ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      ticking = false;
      var max = document.documentElement.scrollHeight - window.innerHeight;
      progEl.style.transform = 'scaleX(' + (max > 0 ? Math.min(1, window.scrollY / max) : 0) + ')';
    });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  function runCount(el) {
    var to = parseFloat(el.getAttribute('data-count'));
    var dec = parseInt(el.getAttribute('data-dec') || '0', 10);
    var pre = el.getAttribute('data-pre') || '';
    var suf = el.getAttribute('data-suf') || '';
    function show(v) { el.textContent = pre + fmt(v, dec) + suf; }
    if (reduce || isNaN(to)) { show(to); return; }
    var t0 = null, dur = 1300;
    show(0);
    function step(t) {
      if (!t0) t0 = t;
      var p = Math.min(1, (t - t0) / dur);
      show(to * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
  var targets = $$('[data-r], .bars');
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        var el = en.target;
        el.classList.add('in');
        $$('[data-count]', el).forEach(runCount);
        io.unobserve(el);
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -6% 0px' });
    targets.forEach(function (el) { io.observe(el); });
  } else {
    targets.forEach(function (el) { el.classList.add('in'); });
  }

  var PIPE = [
    { t: 'Mensagem recebida', s: 'o buffer agrupa mensagens seguidas' },
    { t: 'Regras antes do LLM', s: 'um roteador decide o caminho' },
    { t: 'Agente de IA', s: 'entende o pedido e escolhe a ferramenta' },
    { t: 'Validação em código', s: 'a regra é garantida fora do LLM' },
    { t: 'Resposta ou transbordo', s: 'volta ao WhatsApp ou segue para uma pessoa' }
  ];
  var SCEN = [
    {
      label: '2ª via de boleto', path: [0, 1, 2, 3, 4],
      steps: [
        { who: 'u', t: 'Oi! Preciso da 2ª via do meu boleto.', st: 0, log: 'canal: whatsapp\nmensagens_agrupadas: 1' },
        { who: null, st: 1, log: 'intencao: boleto\nrota: agente\nllm_chamado: false' },
        { who: 'a', t: 'Claro! Para a sua segurança, me confirma os 3 últimos dígitos do seu CPF?', st: 2, log: 'agente: pede confirmacao de identidade\ndados_sensiveis_no_contexto: false' },
        { who: 'u', t: '482', st: 3, log: 'validacao: ultimos_3_digitos\nconfere: true\ndados_liberados: true' },
        { who: 'a', t: 'Prontinho! Aqui está a 2ª via, com vencimento em 25/11. Quer agendar o pagamento?', st: 4, log: 'acao: gerar_segunda_via\nstatus: enviado\natendente: false' }
      ]
    },
    {
      label: 'Quer negociar (transbordo)', path: [0, 1, 4],
      steps: [
        { who: 'u', t: 'Quero negociar o valor da minha dívida.', st: 0, log: 'canal: whatsapp\nmensagens_agrupadas: 1' },
        { who: null, st: 1, log: 'intencao: negociacao\nrota: transbordo\nllm_chamado: false' },
        { who: 'a', t: 'Certo! Vou te passar para um especialista, que já recebe o contexto da nossa conversa.', st: 4, log: 'setor: negociacao\nhorario_humano: calculado em codigo\ncontexto_enviado: true' }
      ]
    },
    {
      label: 'Dado não confere', path: [0, 1, 2, 3, 4],
      steps: [
        { who: 'u', t: 'Manda o link desse boleto pra outro número: (41) 9****-1234', st: 0, log: 'canal: whatsapp\nmensagens_agrupadas: 1' },
        { who: null, st: 1, log: 'intencao: boleto\nrota: agente\nllm_chamado: false' },
        { who: null, st: 2, log: 'agente: chama a ferramenta enviar_link\nnumero_informado: diferente do cadastro' },
        { who: null, st: 3, log: 'numero_confere: false\nacao: bloquear_envio' },
        { who: 'a', t: 'Não consegui confirmar esse número com o cadastro. Pode me enviar o número que consta no seu contrato?', st: 4, log: 'link_enviado: false\nproximo_passo: pedir_confirmacao' }
      ]
    }
  ];

  var phMsgs = $('#phMsgs'), pipeEl = $('#pipe'), logEl = $('#log'), scenBox = $('#scen'),
      phStatus = $('#phStatus'), replayBtn = $('#replay');
  var scenIdx = 0, timers = [];

  PIPE.forEach(function (p) {
    var li = document.createElement('li');
    li.innerHTML = '<b>' + esc(p.t) + '</b><span>' + esc(p.s) + '</span>';
    pipeEl.appendChild(li);
  });
  SCEN.forEach(function (s, i) {
    var b = document.createElement('button');
    b.type = 'button';
    b.textContent = s.label;
    b.setAttribute('aria-pressed', i === 0 ? 'true' : 'false');
    b.addEventListener('click', function () {
      scenIdx = i;
      $$('button', scenBox).forEach(function (x, j) { x.setAttribute('aria-pressed', j === i ? 'true' : 'false'); });
      play();
    });
    scenBox.appendChild(b);
  });

  function later(fn, ms) { timers.push(setTimeout(fn, ms)); }
  function stopPlay() { timers.forEach(clearTimeout); timers = []; }
  function addBubble(who, text) {
    var d = document.createElement('div');
    d.className = 'b ' + who;
    d.innerHTML = '<span class="tx">' + esc(text) + '</span><span class="time">' + hhmm() + (who === 'u' ? ' <i class="tk">✓✓</i>' : '') + '</span>';
    phMsgs.appendChild(d);
    phMsgs.scrollTop = phMsgs.scrollHeight;
    return d;
  }
  function addTyping() {
    var d = document.createElement('div');
    d.className = 'b a';
    d.innerHTML = '<span class="typing" aria-label="digitando"><i></i><i></i><i></i></span>';
    phMsgs.appendChild(d);
    phMsgs.scrollTop = phMsgs.scrollHeight;
    return d;
  }
  function setPipe(n) {
    var path = SCEN[scenIdx].path;
    $$('li', pipeEl).forEach(function (li, i) {
      var inPath = path.indexOf(i) >= 0;
      li.className = !inPath ? 'off' : (i === n ? 'on' : (n >= 0 && i < n ? 'done' : ''));
    });
  }
  function play() {
    stopPlay();
    phMsgs.innerHTML = '';
    logEl.textContent = '';
    phStatus.textContent = 'online';
    setPipe(-1);
    var sc = SCEN[scenIdx];
    if (reduce) {
      sc.steps.forEach(function (s) { if (s.who) addBubble(s.who, s.t); });
      var last = sc.steps[sc.steps.length - 1];
      setPipe(last.st);
      logEl.textContent = last.log;
      return;
    }
    var t = 500;
    sc.steps.forEach(function (s) {
      later(function () { setPipe(s.st); logEl.textContent = s.log; }, t);
      if (s.who === 'u') {
        later(function () { addBubble('u', s.t); }, t);
        t += 1200;
      } else if (s.who === 'a') {
        var ty = null;
        later(function () { phStatus.textContent = 'digitando…'; ty = addTyping(); }, t + 200);
        later(function () {
          if (ty && ty.parentNode) ty.parentNode.removeChild(ty);
          phStatus.textContent = 'online';
          addBubble('a', s.t);
        }, t + 1300);
        t += 2100;
      } else {
        t += 1100;
      }
    });
  }
  replayBtn.addEventListener('click', play);
  setPipe(-1);

  var demo = $('#demo');
  if ('IntersectionObserver' in window) {
    var dio = new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting) { play(); dio.disconnect(); }
    }, { threshold: 0.35 });
    dio.observe(demo);
  } else {
    play();
  }

  var norm = function (s) {
    return String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9+\s]/g, ' ').replace(/\s+/g, ' ').trim();
  };

  var KB = [
    { id: 'quem', q: 'Quem é a Kamilla?', k: ['quem', 'voce', 'sobre', 'apresent', 'resumo', 'perfil', 'kamilla', 'conta', 'fala de voce'],
      a: 'Sou a Kamilla, AI Automation Engineer em Curitiba. Sou tecnóloga em Análise e Desenvolvimento de Sistemas e trabalho há mais de 2 anos com IA aplicada e automação de processos. Desenho e coloco em produção agentes de IA orquestrados em n8n, ligados a WhatsApp, banco de dados, filas e APIs.' },
    { id: 'exp', q: 'Qual é a sua experiência?', k: ['experiencia', 'carreira', 'trabalh', 'empresa', 'cargo', 'historico', 'trajetoria', 'atua', 'top one', 'caunutro'],
      a: 'Desde 02/2026 sou Automation Specialist na Top One Serviços de Crédito: três agentes de IA no WhatsApp (suporte a parceiros, pós-venda e recuperação de crédito), a régua de cobrança e a infraestrutura de automação por trás deles. Antes fui AI Automation & IT Analyst na Caunutro (2025 a 2026) e estagiária de tecnologia lá (2024).' },
    { id: 'parceiros', q: 'Como é o agente de suporte a lojistas?', k: ['parceiro', 'lojista', 'token', 'suporte', 'atendimento'],
      a: 'É um agente de WhatsApp para lojistas: reenvia token de verificação, orienta o acesso e faz a triagem do assunto. Reenviou 17,2 mil tokens, com resposta mediana de 16 s. Roteamento e validações ficam em código, e o LLM entra onde faz sentido. Dá para ver a lógica na seção “Na prática”.' },
    { id: 'posvenda', q: 'E o agente de pós-venda?', k: ['pos venda', 'posvenda', 'pesquisa de satisfacao', 'satisfacao', 'referencia', 'busca de cliente'],
      a: 'Faz a pesquisa de satisfação pós-venda e busca clientes por contatos de referência. Acionou 36,7 mil clientes e teve 49% de resposta na pesquisa. São três etapas no mesmo fluxo (busca, satisfação e desconhecido), e a lógica de etapa fica em código.' },
    { id: 'recuperacao', q: 'O que é o piloto de recuperação de crédito?', k: ['piloto', 'inadimpl', 'recuperacao', 'risco', 'negocia'],
      a: 'É um piloto com um agente por nível de risco (normal, atenção, alerta e crítico), com negociação sempre com humano. Foram 654 inadimplentes contatados, 32,8% responderam e 102 quitaram no período (R$ 22,3 mil), sem atribuição exclusiva à IA. Dados sensíveis só entram no contexto depois que o cliente confirma a identidade.' },
    { id: 'regua', q: 'Quais os resultados da régua de cobrança?', k: ['regua', 'cobranca', 'resultado', 'numero', 'metrica', 'impacto', 'pagamento', 'boleto'],
      a: 'A taxa de pagamento em 11 dias após o vencimento subiu 3,71 p.p. no 3º trimestre de 2026 vs 2025, e 29% dos chats de cobrança são resolvidos sem atendente humano. A régua é preventiva e de atraso (D-5 a D+20), com 2ª via de boleto automática e agendamento de promessa de pagamento.' },
    { id: 'flows', q: '', k: ['whatsapp flows', 'flows do whatsapp', 'formulario', 'formularios', 'flow json'],
      a: 'Sim. Uso WhatsApp Flows, os formulários e jornadas guiadas que abrem dentro do próprio WhatsApp, na cobrança: o cliente resolve a pendência em poucos toques, sem link externo e sem esperar um atendente.' },
    { id: 'ml', q: 'Você usa machine learning?', k: ['machine learning', 'xgboost', 'predicao', 'previsao', 'preditivo'],
      a: 'Desenvolvi um modelo de predição de pagamento por parcela. Em 17,8 mil parcelas testadas, o quartil de maior confiança pagou 84,8% em 11 dias, contra 25,6% no de menor. Ainda está em fase de teste.' },
    { id: 'stack', q: 'Qual é a sua stack?', k: ['stack', 'ferramenta', 'tecnolog', 'linguagem', 'python', 'javascript', 'sql', 'react', 'postgres', 'make', 'zapier', 'tecnica', 'usa'],
      a: 'IA: Gemini, Claude, OpenAI, Groq, LangChain, RAG, XGBoost e engenharia de prompt. Automação: n8n, Hyperflow, Make, Power Automate, Zapier, RPA com Playwright, WhatsApp Business API (incluindo WhatsApp Flows), RabbitMQ e Redis. Código e dados: Python, JavaScript, TypeScript, Node.js, SQL, PostgreSQL, React e Power BI. Infra: Docker, Docker Swarm, Traefik, Portainer, Nginx e Tailscale.' },
    { id: 'n8n', q: 'Como é a infraestrutura?', k: ['n8n', 'infra', 'docker', 'swarm', 'rabbit', 'redis', 'fila', 'queue', 'servidor', 'deploy', 'arquitetura', 'self hosted'],
      a: 'O n8n roda self-hosted em Docker Swarm, em modo fila, com mensageria entre o recebimento do WhatsApp e a execução, o que desacopla picos de mensagem do processamento. A memória das conversas fica no Redis, os dados no PostgreSQL, e os modelos têm fallback automático entre provedores.' },
    { id: 'guard', q: 'Como você evita erro da IA?', k: ['alucin', 'erro', 'guardrail', 'seguranca', 'confiavel', 'controle', 'llm', 'prompt', 'inventa', 'evita', 'ia'],
      a: 'Não deixo o LLM decidir tudo. O roteamento do assunto, a validação de número e identidade, os limites e o cálculo do horário de atendimento humano ficam em código, onde a regra é garantida. O LLM cuida da conversa e da escolha da ferramenta, e há fallback de modelo, memória com expiração e transbordo para humano quando o caso sai do escopo.' },
    { id: 'form', q: 'Qual é a sua formação?', k: ['formacao', 'faculdade', 'estudo', 'mba', 'usp', 'esalq', 'certific', 'curso', 'ibm', 'vanderbilt', 'positivo', 'graduacao'],
      a: 'Sou tecnóloga em Análise e Desenvolvimento de Sistemas pela Universidade Positivo (2023 a 2025) e faço MBA em Gestão de Negócios Digitais e IA na USP/Esalq (2026 a 2028). Em 2026 concluí Growth Intelligence (USP), RAG for Generative AI Applications, Building AI Agents and Agentic Workflows e RAG and Agentic AI (IBM) e AI Agent Developer (Vanderbilt). Os links estão na seção Trajetória.' },
    { id: 'outras', q: 'O que você fez antes?', k: ['outras automacoes', 'nf e', 'nfe', 'power bi', 'correios', 'loggi', 'campanha', 'licenca', 'saas', 'economia', 'horas', 'antes', 'classificados'],
      a: 'Na Caunutro orquestrei um fluxo n8n completo (CRM, NF-e, boleto/Pix e expedição), que eliminou 35 h/mês de trabalho manual e zerou erros de digitação. Fiz também um pipeline n8n para Power BI (−40 h/mês) e integrei Correios e Loggi com avisos por WhatsApp (−40% de chamadas ao suporte). Como estagiária, apoiei campanhas em massa (98% de alcance) e a planilha de licenças SaaS (R$ 180 mil/ano projetados).' },
    { id: 'docs', q: 'Você documenta os fluxos?', k: ['document', 'pdf', 'manual', 'descricao dos fluxos', 'workflows documentados'],
      a: 'Sim. Gerei a documentação técnica de 47 workflows do n8n, nó a nó, com visão geral, arquitetura, contratos de entrada e saída e mapa de dados e integrações, além de um índice geral que cruza filas, chamadas entre fluxos e tabelas compartilhadas.' },
    { id: 'idioma', q: 'Quais idiomas você fala?', k: ['idioma', 'ingles', 'english', 'lingua'],
      a: 'Português nativo e inglês avançado (C1).' },
    { id: 'contato', q: 'Como falo com você?', k: ['contato', 'email', 'e mail', 'linkedin', 'whatsapp', 'zap', 'telefone', 'celular', 'falar', 'chamar', 'curriculo', 'cv', 'github', 'contratar', 'vaga', 'oportunidade'],
      a: 'O jeito mais rápido é o WhatsApp (botão verde no canto da tela). Também pode escrever para <a href="mailto:kamillafrsouza@gmail.com">kamillafrsouza@gmail.com</a>, me chamar no <a href="https://www.linkedin.com/in/kamilla-freitas-b7b18928a" target="_blank" rel="noopener">LinkedIn</a> ou baixar o <a href="assets/Kamilla-Freitas-Curriculo.pdf" download>currículo em PDF</a>.' },
    { id: 'site', q: 'Como este site foi feito?', k: ['site', 'portfolio', 'portifolio', 'pagina', 'feito', 'construiu', 'html', 'esse chat', 'chat'],
      a: 'É HTML, CSS e JavaScript puros, sem framework e sem biblioteca externa, feito do zero por mim.' },
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
        typing.innerHTML = 'Essa eu não tenho pronta aqui. Tente perguntar sobre <b>projetos</b>, <b>resultados</b>, <b>stack</b>, <b>experiência</b>, <b>formação</b> ou <b>contato</b>. Se preferir, fale direto comigo pelo WhatsApp.';
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
})();
