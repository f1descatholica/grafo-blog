// ============================================================
// graph-builder.js
// Monta o grafo completo (posts + entidades) a partir dos posts
// já normalizados + relações extraídas dos spans.
// ============================================================

var Graph = require('graphology');
var { extrairBlocoGrafoDoPost } = require('./grafo-dados-parser.js');

function idEntidadeNormalizado(textoId) {
  // Chave de deduplicação: mesmo texto (case-insensitive, sem espaços
  // nas pontas) = mesma entidade, mesmo que o rótulo visível varie
  // ligeiramente de post pra post.
  return 'ent__' + textoId.trim().toLowerCase();
}

function idTagNormalizado(textoLabel) {
  return 'tag__' + textoLabel.trim().toLowerCase();
}

// Normalização p/ RÓTULO VISÍVEL de aresta (diferente da normalização
// de busca do motor V12, que remove acentos — aqui o texto ainda vai
// pra tela, então mantém acentuação e pontuação do português).
function normalizarRotuloArestaSub(texto) {
  return String(texto || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function construirGrafo(posts) {
  var grafo = new Graph({ multi: true, allowSelfLoops: false });
  var tiposConhecidosPorEntidade = {}; // idNormalizado -> tipo (primeiro tipo explícito encontrado)

  function garantirNoEntidade(textoId, tipoSugerido, rotuloVisivel, nivelSugerido, corSugerida) {
    var idNorm = idEntidadeNormalizado(textoId);
    if (tipoSugerido && !tiposConhecidosPorEntidade[idNorm]) {
      tiposConhecidosPorEntidade[idNorm] = tipoSugerido;
    }
    if (!grafo.hasNode(idNorm)) {
      var attrsNovoNo = {
        label: rotuloVisivel || textoId,
        tipoNo: 'entidade',
        grupo: tipoSugerido || 'entidade'
      };
      // Campos opcionais do bloco declarativo (ver documentação de
      // campos reconhecidos) — só aplica se vierem definidos.
      if (nivelSugerido !== undefined && nivelSugerido !== null) attrsNovoNo.level = nivelSugerido;
      if (corSugerida) attrsNovoNo.color = corSugerida;
      grafo.addNode(idNorm, attrsNovoNo);
    } else {
      // Entidade já existia (mencionada em outro post) — atualiza
      // tipo se ainda genérico, e nivel/cor se este post os declarar
      // e o nó ainda não tiver (1º post a declarar define; evita
      // sobrescrever decisão anterior de outro post silenciosamente).
      var attrs = grafo.getNodeAttributes(idNorm);
      if (tipoSugerido && attrs.grupo === 'entidade' && tipoSugerido !== 'entidade') {
        grafo.setNodeAttribute(idNorm, 'grupo', tipoSugerido);
      }
      if (nivelSugerido !== undefined && nivelSugerido !== null && attrs.level === undefined) {
        grafo.setNodeAttribute(idNorm, 'level', nivelSugerido);
      }
      if (corSugerida && !attrs.color) {
        grafo.setNodeAttribute(idNorm, 'color', corSugerida);
      }
    }
    return idNorm;
  }

  // ---- Passo 1: nó de cada post ----
  posts.forEach(function(post) {
    grafo.addNode(post.id, {
      label: post.titulo,
      tipoNo: 'post',
      grupo: 'post',
      url: post.url,
      dataPublicacao: post.dataPublicacao,
      imagem: post.imagem,
      labels: post.labels
    });
  });

  // ---- Passo 2: bloco #grafo-dados -> entidades + relações fortes ----
  posts.forEach(function(post) {
    var blocoGrafo = extrairBlocoGrafoDoPost(post.conteudoHtml);
    if (!blocoGrafo) return; // post sem bloco de grafo — pula, não quebra o build

    // Mapa id-declarado-no-post -> id-normalizado-no-grafo, usado
    // para resolver "de"/"para" das arestas deste mesmo post.
    var idNormPorIdDeclarado = {};

    blocoGrafo.nos.forEach(function(no) {
      var idNorm = garantirNoEntidade(no.id, no.tipo, no.id, no.nivel, no.cor);
      idNormPorIdDeclarado[no.id] = idNorm;

      // Post -> entidade ("menciona") — 1 por nó declarado no bloco,
      // equivalente ao que cada span gerava antes.
      try {
        grafo.addEdge(post.id, idNorm, {
          tipoAresta: 'mencao',
          texto: 'menciona',
          peso: 1
        });
      } catch (e) { /* aresta já existe (multi:true evita erro aqui, mas por segurança) */ }
    });

    blocoGrafo.arestas.forEach(function(aresta) {
      var idOrigem = idNormPorIdDeclarado[aresta.de];
      var idAlvo = idNormPorIdDeclarado[aresta.para];
      if (!idOrigem || !idAlvo) return; // parser já validou de/para contra "nos", mas por segurança

      grafo.addEdge(idOrigem, idAlvo, {
        tipoAresta: 'relacao',
        texto: aresta.rotulo || '', // verbatim, como o autor escreveu — ver nota de decisão
        peso: 2,
        dashes: !!aresta.tracejada,
        postOrigemId: post.id
      });
    });
  });

  // ---- Passo 3: tag (label nativa) -> post ----
  // Cada label vira 1 nó próprio; todo post com aquela label ganha
  // 1 aresta pra ela. Um post pode se conectar a VÁRIAS tags ao
  // mesmo tempo (uma aresta por label que ele tiver). Sem comparação
  // par-a-par, sem limiar arbitrário — a proximidade entre posts
  // emerge naturalmente no ForceAtlas2, por ambos puxarem pro mesmo
  // nó de tag.
  posts.forEach(function(post) {
    post.labels.forEach(function(textoLabel) {
      var idTag = idTagNormalizado(textoLabel);
      if (!grafo.hasNode(idTag)) {
        grafo.addNode(idTag, {
          label: textoLabel,
          tipoNo: 'tag',
          grupo: 'tag'
        });
      }
      try {
        grafo.addEdge(idTag, post.id, {
          tipoAresta: 'tag',
          texto: '',
          peso: 1,
          dashes: true
        });
      } catch (e) { /* aresta já existe (multi:true evita erro aqui, mas por segurança) */ }
    });
  });

  return grafo;
}

module.exports = { construirGrafo };
