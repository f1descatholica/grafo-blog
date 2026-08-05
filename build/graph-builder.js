// ============================================================
// graph-builder.js
// Monta o grafo completo (posts + entidades) a partir dos posts
// já normalizados + relações extraídas dos spans.
// ============================================================

var Graph = require('graphology');
var { extrairSpansDoPost } = require('./span-parser.js');

function idEntidadeNormalizado(textoId) {
  // Chave de deduplicação: mesmo texto (case-insensitive, sem espaços
  // nas pontas) = mesma entidade, mesmo que o rótulo visível varie
  // ligeiramente de post pra post.
  return 'ent__' + textoId.trim().toLowerCase();
}

function idTagNormalizado(textoLabel) {
  return 'tag__' + textoLabel.trim().toLowerCase();
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
          texto: 'marca',
          peso: 1,
          dashes: true
        });
      } catch (e) { /* aresta já existe (multi:true evita erro aqui, mas por segurança) */ }
    });
  });

  return grafo;
}

module.exports = { construirGrafo };
