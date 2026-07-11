// Radar de SEO — testes das funções puras (node:test)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeHtml, kwScore, topicsFromUrls } from './seo-radar.ts';

const HTML = `<html><head><title>Melhores animes isekai para assistir em 2026</title>
<meta name="description" content="${'x'.repeat(140)}"></head>
<body><h1>Os melhores animes isekai</h1>
<p>${'palavra '.repeat(700)}</p>
<h2>Ranking de isekai</h2><h2>Onde assistir</h2>
<img src="a.jpg"><img src="b.jpg">
<script type="application/ld+json">{"@type":"NewsArticle"}</script>
</body></html>`;

test('analyzeHtml: extrai título, h1, h2, palavras, imgs, schema', () => {
  const p = analyzeHtml('https://x', HTML);
  assert.ok(p.title.includes('Melhores animes isekai'));
  assert.equal(p.h1.length, 1);
  assert.equal(p.h2_count, 2);
  assert.ok(p.palavras >= 700);
  assert.equal(p.imgs, 2);
  assert.equal(p.schema, true);
  assert.ok(p.schema_types.includes('NewsArticle'));
});

test('kwScore: página bem otimizada tira nota alta', () => {
  const p = analyzeHtml('https://x', HTML);
  const { score, notes } = kwScore(p, 'isekai');
  assert.ok(score >= 80, `esperava >=80, veio ${score}`);
  assert.ok(notes.some((n) => n.includes('kw no título ✓')));
  assert.ok(notes.some((n) => n.includes('kw em H2 ✓')));
});

test('kwScore: página sem a keyword perde pontos e sinaliza', () => {
  const p = analyzeHtml('https://x', '<title>Outro assunto</title><h1>nada</h1>');
  const { score, notes } = kwScore(p, 'isekai');
  assert.ok(score < 40);
  assert.ok(notes.some((n) => n.includes('kw fora do título ✗')));
  assert.ok(notes.some((n) => n.includes('SEM schema ✗')));
});

test('kwScore: página com erro de fetch retorna 0', () => {
  const { score } = kwScore({ url: 'x', erro: 'timeout', title: '', title_len: 0, meta_len: 0, h1: [], h2_count: 0, h2_sample: [], palavras: 0, imgs: 0, schema: false, schema_types: [] }, 'isekai');
  assert.equal(score, 0);
});

test('topicsFromUrls: conta termos dos slugs ignorando stopwords', () => {
  const urls = [
    'https://s.com/naruto-ganha-trailer/',
    'https://s.com/one-piece-ganha-trailer/',
    'https://s.com/bleach-novo-anime/',
  ];
  const t = topicsFromUrls(urls, 5);
  const map = Object.fromEntries(t.map((x) => [x.termo, x.n]));
  assert.equal(map['ganha'], 2);
  assert.equal(map['trailer'], 2);
  assert.ok(!('de' in map), 'stopword não deve aparecer');
});
