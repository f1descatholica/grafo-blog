// ============================================================
// Monta o grafo completo (posts + entidades) a partir dos posts
// já normalizados + relações extraídas dos spans.
// ============================================================

var Graph = require('graphology');
var { extrairSpansDoPost } = require('./span-parser.js');

var PESO_MINIMO_SIMILARIDADE = 2;   // labels em comum mínimas p/ conectar 2 posts
var TOP_K_SIMILARIDADE_POR_POST = 8; // só as N conexões mais fortes de cada post

function idEntidadeNormalizado(textoId) {
  // Chave de deduplicação: mesmo texto (case-insensitive, sem espaços
  // nas pontas) = mesma entidade, mesmo que o rótulo visível varie
  // ligeiramente de post pra post.
  return 'ent__' + textoId.trim().toLowerCase();
}

function construirGrafo(posts) {
  var grafo = new Graph({ multi: true, allowSelfLoops: false });
  var tiposConhecidosPorEntidade = {}; // idNormalizado -> tipo (primeiro tipo explícito encontrado)

  function garantirNoEntidade(textoId, tipoSugerido, rotuloVisivel) {
    var idNorm = idEntidadeNormalizado(textoId);
    if (tipoSugerido && !tiposConhecidosPorEntidade[idNorm]) {
      tiposConhecidosPorEntidade[idNorm] = tipoSugerido;
    }
    if (!grafo.hasNode(idNorm)) {
      grafo.addNode(idNorm, {
        label: rotuloVisivel || textoId,
        tipoNo: 'entidade',
        grupo: tipoSugerido || 'entidade'
      });
    } else if (tipoSugerido) {
      // Entidade já existia sem tipo definido — atualiza assim que
      // algum span finalmente declarar o tipo dela.
      var attrs = grafo.getNodeAttributes(idNorm);
      if (attrs.grupo === 'entidade' && tipoSugerido !== 'entidade') {
        grafo.setNodeAttribute(idNorm, 'grupo', tipoSugerido);
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

  // ---- Passo 2: spans -> entidades + relações fortes ----
  posts.forEach(function(post) {
    var relacoes = extrairSpansDoPost(post.conteudoHtml);
    var idsEntidadesJaMencionadasNestePost = {}; // dedup só da aresta "menciona"

    relacoes.forEach(function(rel) {
      var idOrigem = garantirNoEntidade(rel.id, rel.tipo, rel.textoVisivel);

      // Post -> entidade ("menciona"), deduplicada por post (não
      // repete a mesma aresta se a entidade aparece várias vezes
      // no mesmo post).
      if (!idsEntidadesJaMencionadasNestePost[idOrigem]) {
        idsEntidadesJaMencionadasNestePost[idOrigem] = true;
        try {
          grafo.addEdge(post.id, idOrigem, {
            tipoAresta: 'mencao',
            texto: 'menciona',
            peso: 1
          });
        } catch (e) { /* aresta já existe (multi:true evita erro aqui, mas por segurança) */ }
      }

      // Entidade -> alvo ("relação real"), UMA aresta por menção,
      // sem deduplicar — cada span é uma relação própria.
      if (rel.alvo) {
        var idAlvo = garantirNoEntidade(rel.alvo, rel.alvoTipo, rel.alvo);
        grafo.addEdge(idOrigem, idAlvo, {
          tipoAresta: 'relacao',
          texto: rel.acao,
          peso: 2,
          postOrigemId: post.id // referência: de qual post essa relação veio
        });
      }
    });
  });

  // ---- Passo 3: similaridade fraca post<->post (labels nativas) ----
  var paresContados = {}; // evita computar A-B e B-A separadamente
  for (var i = 0; i < posts.length; i++) {
    var candidatosSimilares = [];
    for (var j = 0; j < posts.length; j++) {
      if (i === j) continue;
      var a = posts[i], b = posts[j];
      var labelsA = new Set(a.labels);
      var comuns = b.labels.filter(function(l) { return labelsA.has(l); });
      if (comuns.length >= PESO_MINIMO_SIMILARIDADE) {
        candidatosSimilares.push({ id: b.id, peso: comuns.length });
      }
    }
    candidatosSimilares.sort(function(x, y) { return y.peso - x.peso; });
    candidatosSimilares.slice(0, TOP_K_SIMILARIDADE_POR_POST).forEach(function(c) {
      var chavePar = [posts[i].id, c.id].sort().join('||');
      if (paresContados[chavePar]) return;
      paresContados[chavePar] = true;
      try {
        grafo.addEdge(posts[i].id, c.id, {
          tipoAresta: 'similaridade',
          texto: 'marcadores em comum',
          peso: c.peso,
          dashes: true
        });
      } catch (e) { /* aresta duplicada, ignora */ }
    });
  }

  return grafo;
}

module.exports = { construirGrafo };
