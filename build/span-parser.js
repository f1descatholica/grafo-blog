// ============================================================
// Extrai, do HTML de um post:
// 1) spans <span class="no-grafo" data-id data-tipo data-alvo
//    data-alvo-tipo data-acao> -> relações estruturadas (entidades)
// 2) nada relacionado a labels aqui — isso vem do feed (buscar-posts.js)
// ============================================================

var cheerio = require('cheerio');

function extrairSpansDoPost(conteudoHtml) {
  var $ = cheerio.load(conteudoHtml || '');
  var relacoes = [];

  $('span.no-grafo').each(function() {
    var el = $(this);
    var id = el.attr('data-id');
    if (!id) return; // span malformado, sem o essencial — ignora

    relacoes.push({
      id: id.trim(),
      tipo: el.attr('data-tipo') ? el.attr('data-tipo').trim() : null,
      alvo: el.attr('data-alvo') ? el.attr('data-alvo').trim() : null,
      alvoTipo: el.attr('data-alvo-tipo') ? el.attr('data-alvo-tipo').trim() : null,
      acao: el.attr('data-acao') ? el.attr('data-acao').trim() : 'relaciona-se com',
      textoVisivel: el.text().trim()
    });
  });

  return relacoes;
}

module.exports = { extrairSpansDoPost };
