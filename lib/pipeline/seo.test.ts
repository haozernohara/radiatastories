// ============================================================
// SEO / GEO — Unit Tests (node:test)
// ============================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildNewsArticleSchema, ensureImageAlts } from './seo.ts';

test('buildNewsArticleSchema: gera JSON-LD NewsArticle válido com URL do slug', () => {
  const out = buildNewsArticleSchema({
    titulo: 'Re:Zero revela arco da Retomada',
    slug: 'rezero-arco-retomada',
    meta: 'A 4ª temporada de Re:Zero revelou o arco da Retomada.',
    imageUrl: 'https://radiata.pro/wp-content/uploads/img.jpg',
    isoDate: '2026-06-17T10:00:00.000Z',
  });
  assert.ok(out.startsWith('<script type="application/ld+json">'));
  assert.ok(out.endsWith('</script>'));
  const json = JSON.parse(out.replace(/^<script[^>]*>/, '').replace(/<\/script>$/, ''));
  assert.equal(json['@type'], 'NewsArticle');
  assert.equal(json.inLanguage, 'pt-BR');
  assert.equal(json.headline, 'Re:Zero revela arco da Retomada');
  assert.equal(json.mainEntityOfPage['@id'], 'https://radiata.pro/rezero-arco-retomada/');
  assert.deepEqual(json.image, ['https://radiata.pro/wp-content/uploads/img.jpg']);
  assert.equal(json.publisher.name, 'Radiata Animes');
});

test('buildNewsArticleSchema: escapa </script> para não quebrar o HTML', () => {
  const out = buildNewsArticleSchema({
    titulo: 'Teste </script> injection',
    slug: 'teste',
    meta: 'x',
    imageUrl: null,
    isoDate: '2026-01-01T00:00:00.000Z',
  });
  // não pode existir um </script> real no meio (só o de fechamento no fim)
  const inner = out.replace(/<\/script>$/, '');
  assert.ok(!/<\/script>/i.test(inner), 'não deve haver </script> não-escapado no corpo');
});

test('buildNewsArticleSchema: sem imageUrl, omite o campo image', () => {
  const out = buildNewsArticleSchema({ titulo: 't', slug: 's', meta: 'm', imageUrl: null, isoDate: '2026-01-01T00:00:00.000Z' });
  const json = JSON.parse(out.replace(/^<script[^>]*>/, '').replace(/<\/script>$/, ''));
  assert.equal(json.image, undefined);
});

test('ensureImageAlts: preenche alt vazio com o nome do anime', () => {
  const html = "<figure><img src='x.jpg' alt='' /></figure>";
  const out = ensureImageAlts(html, 'Re:Zero');
  assert.ok(out.includes("alt='Re:Zero'"));
});

test('ensureImageAlts: adiciona alt quando não existe', () => {
  const html = '<img src="x.jpg" loading="lazy">';
  const out = ensureImageAlts(html, 'Chainsaw Man');
  assert.ok(/alt='Chainsaw Man'/.test(out));
});

test('ensureImageAlts: NÃO sobrescreve alt já preenchido', () => {
  const html = "<img src='x.jpg' alt='legenda original'/>";
  const out = ensureImageAlts(html, 'Naruto');
  assert.ok(out.includes("alt='legenda original'"));
  assert.ok(!out.includes('Naruto'));
});

test('ensureImageAlts: sanitiza aspas/brackets do nome', () => {
  const html = "<img src='x.jpg' alt=''>";
  const out = ensureImageAlts(html, `Anime "com" <aspas>`);
  assert.ok(!/alt='[^']*["<>]/.test(out), 'alt não deve conter aspas/brackets crus');
});
