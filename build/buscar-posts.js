// ============================================================
// build/buscar-posts.js
// Busca TODOS os posts do blog via feed JSON público do Blogger,
// paginando automaticamente (o feed limita ~150 por chamada).
// ============================================================
var URL_BASE_BLOG = 'https://f1descatholica.blogspot.com'; // ajuste se o domínio mudar
var TAMANHO_PAGINA = 150;
var MAX_TENTATIVAS_POR_PAGINA = 3;

function esperar(ms) {
  return new Promise(function(resolve) { setTimeout(resolve, ms); });
}

async function buscarUmaPaginaBruta(indiceInicial) {
  var url = URL_BASE_BLOG + '/feeds/posts/default?alt=json' +
    '&max-results=' + TAMANHO_PAGINA +
    '&start-index=' + indiceInicial;

  var ultimoErro = null;
  for (var tentativa = 1; tentativa <= MAX_TENTATIVAS_POR_PAGINA; tentativa++) {
    try {
      var resp = await fetch(url);
      if (!resp.ok) throw new Error('Falha ao buscar feed: status ' + resp.status);
      var dados = await resp.json();
      var entradas = (dados.feed && dados.feed.entry) || [];
      var totalResults = (dados.feed && dados.feed.openSearch$totalResults && dados.feed.openSearch$totalResults.$t)
        ? parseInt(dados.feed.openSearch$totalResults.$t, 10)
        : Infinity; // se por algum motivo não vier, não trava o loop no total
      return { entradas: entradas, totalResults: totalResults };
    } catch (erro) {
      ultimoErro = erro;
      console.warn('Tentativa ' + tentativa + '/' + MAX_TENTATIVAS_POR_PAGINA +
        ' falhou para start-index=' + indiceInicial + ': ' + erro.message);
      if (tentativa < MAX_TENTATIVAS_POR_PAGINA) {
        await esperar(1000 * tentativa); // espera crescente entre tentativas
      }
    }
  }
  throw new Error('Falha ao buscar feed apos ' + MAX_TENTATIVAS_POR_PAGINA +
    ' tentativas (start-index=' + indiceInicial + '): ' + ultimoErro.message);
}

function extrairCampoTexto(campo) {
  return campo && campo.$t ? campo.$t : '';
}

function extrairUrlPost(entrada) {
  var links = entrada.link || [];
  for (var i = 0; i < links.length; i++) {
    if (links[i].rel === 'alternate') return links[i].href;
  }
  console.warn('Post sem URL alternate:', entrada.id && entrada.id.$t);
  return null;
}

function extrairImagem(entrada) {
  if (entrada.media$thumbnail && entrada.media$thumbnail.url) {
    // Blogger entrega miniatura pequena; troca o sufixo de tamanho por uma maior.
    // Ponto de atenção monitorado: se o Blogger mudar esse padrão de URL no
    // futuro, o replace simplesmente não casa e a URL original (miniatura
    // pequena) é mantida sem erro — comportamento seguro, não uma falha silenciosa.
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
  var idsVistos = new Set(); // proteção contra duplicidade
  var duplicadosIgnorados = 0;
  var indiceAtual = 1; // feed do Blogger é 1-indexado
  var totalEsperado = null; // vem do próprio feed na 1ª resposta

  while (true) {
    var respostaBruta = await buscarUmaPaginaBruta(indiceAtual);
    var pagina = respostaBruta.entradas;
    if (totalEsperado === null) {
      totalEsperado = respostaBruta.totalResults;
    }
    if (pagina.length === 0) break; // fim real: página veio vazia

    pagina.forEach(function(entrada) {
      var entradaNormalizada = normalizarEntrada(entrada);
      if (idsVistos.has(entradaNormalizada.id)) {
        duplicadosIgnorados++;
        return;
      }
      idsVistos.add(entradaNormalizada.id);
      todos.push(entradaNormalizada);
    });

    // só encerra se já atingimos o total informado pelo Blogger,
    // não pelo tamanho da página individual (pode vir truncada)
    if (todos.length >= totalEsperado) break;
    indiceAtual += TAMANHO_PAGINA;
  }

  if (duplicadosIgnorados > 0) {
    console.warn('Posts duplicados ignorados: ' + duplicadosIgnorados);
  }

  return todos;
}

module.exports = { buscarTodosOsPosts };
