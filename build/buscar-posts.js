// ============================================================
// Busca TODOS os posts do blog via feed JSON público do Blogger,
// paginando automaticamente (o feed limita ~150 por chamada).
// ============================================================

var URL_BASE_BLOG = 'https://f1descatholica.blogspot.com'; // ajuste se o domínio mudar
var TAMANHO_PAGINA = 150;

async function buscarUmaPagina(indiceInicial) {
  var url = URL_BASE_BLOG + '/feeds/posts/default?alt=json' +
    '&max-results=' + TAMANHO_PAGINA +
    '&start-index=' + indiceInicial;
  var resp = await fetch(url);
  if (!resp.ok) throw new Error('Falha ao buscar feed: status ' + resp.status);
  var dados = await resp.json();
  var entradas = (dados.feed && dados.feed.entry) || [];
  return entradas;
}

function extrairCampoTexto(campo) {
  return campo && campo.$t ? campo.$t : '';
}

function extrairUrlPost(entrada) {
  var links = entrada.link || [];
  for (var i = 0; i < links.length; i++) {
    if (links[i].rel === 'alternate') return links[i].href;
  }
  return null;
}

function extrairImagem(entrada) {
  if (entrada.media$thumbnail && entrada.media$thumbnail.url) {
    // Blogger entrega miniatura pequena; troca o sufixo de tamanho por uma maior.
    return entrada.media$thumbnail.url.replace(/\/s\d+(-c)?\//, '/s1600/');
  }
  return null;
}

function extrairLabels(entrada) {
  var categorias = entrada.category || [];
  return categorias.map(function(c) { return c.term; });
}

function normalizarEntrada(entrada) {
  return {
    id: entrada.id.$t,
    titulo: extrairCampoTexto(entrada.title),
    url: extrairUrlPost(entrada),
    dataPublicacao: extrairCampoTexto(entrada.published),
    imagem: extrairImagem(entrada),
    labels: extrairLabels(entrada),
    conteudoHtml: extrairCampoTexto(entrada.content)
  };
}

async function buscarTodosOsPosts() {
  var todos = [];
  var indiceAtual = 1; // feed do Blogger é 1-indexado
  while (true) {
    var pagina = await buscarUmaPagina(indiceAtual);
    if (pagina.length === 0) break;
    pagina.forEach(function(entrada) { todos.push(normalizarEntrada(entrada)); });
    if (pagina.length < TAMANHO_PAGINA) break; // última página
    indiceAtual += TAMANHO_PAGINA;
  }
  return todos;
}

module.exports = { buscarTodosOsPosts };
