// ============================================================
// build/grafo-dados-parser.js
// Substitui span-parser.js. Extrai o bloco declarativo:
// <script type="application/json" id="grafo-dados">{...}</script>
// ============================================================

var cheerio = require('cheerio');

function extrairBlocoGrafoDoPost(conteudoHtml) {
  var $ = cheerio.load(conteudoHtml || '');
  var scriptEl = $('script#grafo-dados');
  if (scriptEl.length === 0) return null; // post sem bloco de grafo — não é erro

  var textoJson = scriptEl.html();
  try {
    var dados = JSON.parse(textoJson);
  } catch (erro) {
    console.warn('JSON malformado em #grafo-dados, post ignorado no grafo:', erro.message);
    return null;
  }

  var nos = Array.isArray(dados.nos) ? dados.nos : [];
  var arestas = Array.isArray(dados.arestas) ? dados.arestas : [];

  // Validação leve: descarta entradas sem os campos obrigatórios,
  // sem derrubar o post inteiro por causa de 1 item malformado.
  var nosValidos = nos.filter(function(n) { return n && n.id; });
  var idsValidos = {};
  nosValidos.forEach(function(n) { idsValidos[n.id] = true; });

  var arestasValidas = arestas.filter(function(a) {
    return a && a.de && a.para && idsValidos[a.de] && idsValidos[a.para];
  });

  return { nos: nosValidos, arestas: arestasValidas };
}

module.exports = { extrairBlocoGrafoDoPost: extrairBlocoGrafoDoPost };
