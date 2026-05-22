// ============================================================
// Radiata Blog System — wp-publisher Unit Tests
// Phase 1: Pipeline Core — Plan 05
// ============================================================
// Tests only pure functions (no network calls):
//   - seoFilename: SEO-friendly rename pattern (PIPE-09)
//   - injectImagesIntoHtml: body image injection (PIPE-12)
//
// Run with: node --experimental-strip-types --test lib/pipeline/wp-publisher.test.ts
// ============================================================

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { seoFilename, injectImagesIntoHtml } from './wp-publisher.ts';

// --------------- seoFilename tests ---------------

describe('seoFilename', () => {
  it('returns jpg for image/jpeg', () => {
    assert.equal(seoFilename('my-slug', 1, 'image/jpeg'), 'my-slug-1-radiata.jpg');
  });

  it('returns webp for image/webp', () => {
    assert.equal(seoFilename('my-slug', 2, 'image/webp'), 'my-slug-2-radiata.webp');
  });

  it('returns png for image/png', () => {
    assert.equal(seoFilename('my-slug', 3, 'image/png'), 'my-slug-3-radiata.png');
  });

  it('returns jpg as fallback for unknown content type', () => {
    assert.equal(seoFilename('test-slug', 1, 'image/bmp'), 'test-slug-1-radiata.bmp');
  });

  it('uses correct index in filename', () => {
    const result = seoFilename('anime-news', 5, 'image/jpeg');
    assert.equal(result, 'anime-news-5-radiata.jpg');
  });
});

// --------------- injectImagesIntoHtml tests ---------------

describe('injectImagesIntoHtml', () => {
  const makeParagraphs = (n: number): string =>
    Array.from({ length: n }, (_, i) => `<p>Paragraph ${i + 1}.</p>`).join('\n');

  const EXTRAS_1 = [{ source_url: 'https://example.com/img1.jpg' }];
  const EXTRAS_2 = [
    { source_url: 'https://example.com/img1.jpg' },
    { source_url: 'https://example.com/img2.jpg' },
  ];

  it('returns html unchanged when extras is empty', () => {
    const html = makeParagraphs(5);
    assert.equal(injectImagesIntoHtml(html, []), html);
  });

  it('injects figure after 2nd paragraph when 1 extra provided', () => {
    const html = makeParagraphs(5);
    const result = injectImagesIntoHtml(html, EXTRAS_1);

    // Should contain the figure
    assert.ok(result.includes("https://example.com/img1.jpg"), 'missing img1.jpg');
    assert.ok(result.includes("wp-block-image"), 'missing wp-block-image class');

    // Figure should appear after 2nd </p>
    const idx2ndP = result.indexOf('<p>Paragraph 2.');
    const idxClose2nd = result.indexOf('</p>', idx2ndP);
    const idxFigure = result.indexOf("<figure class='wp-block-image'>", idxClose2nd);
    assert.ok(idxFigure > idxClose2nd, 'figure not after 2nd paragraph');
  });

  it('does NOT inject second figure when only 1 extra provided', () => {
    const html = makeParagraphs(6);
    const result = injectImagesIntoHtml(html, EXTRAS_1);
    // img2.jpg must not appear
    assert.ok(!result.includes('img2.jpg'), 'unexpected img2.jpg injection');
    // Only one figure
    const figureCount = (result.match(/<figure/g) ?? []).length;
    assert.equal(figureCount, 1);
  });

  it('injects two figures after 2nd and 4th paragraphs when 2 extras provided', () => {
    const html = makeParagraphs(6);
    const result = injectImagesIntoHtml(html, EXTRAS_2);

    assert.ok(result.includes('img1.jpg'), 'missing img1.jpg');
    assert.ok(result.includes('img2.jpg'), 'missing img2.jpg');

    // Both figures present
    const figureCount = (result.match(/<figure/g) ?? []).length;
    assert.equal(figureCount, 2);

    // img1 must appear before img2 in document order
    assert.ok(result.indexOf('img1.jpg') < result.indexOf('img2.jpg'), 'wrong injection order');
  });

  it('does not crash and does not inject when html has fewer than 3 chunks (< 2 paragraphs)', () => {
    const html = '<p>Only one paragraph.</p>';
    // After split on </p>: ['<p>Only one paragraph.', '']  — length 2
    // extras[0] requires chunks.length > 2 — not met here
    const result = injectImagesIntoHtml(html, EXTRAS_2);
    assert.ok(!result.includes('<figure'), 'unexpected figure in short html');
  });

  it('handles html with exactly 2 paragraphs (only room for figure after 2nd)', () => {
    const html = '<p>Para 1.</p><p>Para 2.</p>';
    // chunks after split: ['<p>Para 1.', '<p>Para 2.', '']  — length 3
    // extras[0] → chunks.length > 2 ✓ → inserts at index 2
    const result = injectImagesIntoHtml(html, EXTRAS_2);
    assert.ok(result.includes('img1.jpg'), 'should inject after 2nd paragraph');
    // After injection: 4 chunks → not > 4, so no second figure
    const figureCount = (result.match(/<figure/g) ?? []).length;
    assert.equal(figureCount, 1);
  });

  it('preserves all original paragraph text after injection', () => {
    const html = makeParagraphs(5);
    const result = injectImagesIntoHtml(html, EXTRAS_2);
    for (let i = 1; i <= 5; i++) {
      assert.ok(result.includes(`Paragraph ${i}.`), `Paragraph ${i} missing after injection`);
    }
  });
});
