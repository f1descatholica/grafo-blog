// ============================================================
// Orquestrador do build: busca posts -> monta grafo -> calcula
// layout (ForceAtlas2) -> grava JSON final.
// Rodado localmente OU via GitHub Action (ver workflow).
// ============================================================

var fs = require('fs');
var path = require('path');
var forceAtlas2 = require('graphology-layout-forceatlas2');
var layoutRandom = require('graphology-layout/random');

var { buscarTodosOsPosts } = require('./buscar-posts.js');
var { construirGrafo } = require('./graph-builder.js');

async function main() {
  console.log('Buscando posts do blog...');
  var posts = await buscarTodosOsPosts();
  console.log('Total de posts encontrados:', posts.length);

  console.log('Montando grafo (posts + entidades)...');
  var grafo = construirGrafo(posts);
  console.log('Nós:', grafo.order, '| Arestas:', grafo.size);

  console.log('Calculando layout (ForceAtlas2)...');
  layoutRandom.assign(grafo, { scale: 1000 });
  var configuracoes = forceAtlas2.inferSettings(grafo);
  forceAtlas2.assign(grafo, { iterations: 300, settings: configuracoes });

  var nodesFinais = [];
  grafo.forEachNode(function(id, attrs) {
    nodesFinais.push(Object.assign({ id: id }, attrs));
  });
  var edgesFinais = [];
  grafo.forEachEdge(function(edgeId, attrs, source, target) {
    edgesFinais.push(Object.assign({ from: source, to: target }, attrs));
  });

  var resultado = {
    nodes: nodesFinais,
    edges: edgesFinais,
    geradoEm: new Date().toISOString(),
    totalPosts: posts.length
  };

  var caminhoSaida = path.join(__dirname, '..', 'dados-grafo-conhecimento.json');
  fs.writeFileSync(caminhoSaida, JSON.stringify(resultado));
  console.log('Gravado em', caminhoSaida);
}

main().catch(function(erro) {
  console.error('ERRO no build:', erro);
  process.exit(1);
});
