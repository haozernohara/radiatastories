import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// These imports will fail until extractor.ts is created (RED phase)
import { _parseHtml } from './extractor.ts';

const fixturesDir = join(__dirname, '__fixtures__');

function loadFixture(name: string): string {
  return readFileSync(join(fixturesDir, name), 'utf-8');
}

describe('_parseHtml - og:image extraction', () => {
  it('extracts og:image from meta[property="og:image"]', () => {
    const html = loadFixture('article-with-og.html');
    const result = _parseHtml(html, 'https://example.com/article');
    assert.equal(result.og_image, 'https://example.com/og-image.jpg');
  });

  it('falls back to twitter:image when og:image is absent', () => {
    const html = loadFixture('article-without-og.html');
    const result = _parseHtml(html, 'https://example.com/article');
    assert.equal(result.og_image, 'https://example.com/twitter-image.jpg');
  });

  it('falls back to first non-logo img when neither og nor twitter meta present', () => {
    const html = `<html><body>
      <img src="https://example.com/logo.png" alt="logo">
      <img src="https://example.com/article-image.jpg" alt="article">
      <p>${'word '.repeat(300)}</p>
    </body></html>`;
    const result = _parseHtml(html, 'https://example.com/article');
    assert.equal(result.og_image, 'https://example.com/article-image.jpg');
  });

  it('returns null og_image when no valid image found', () => {
    const html = `<html><body><p>${'word '.repeat(300)}</p></body></html>`;
    const result = _parseHtml(html, 'https://example.com/article');
    assert.equal(result.og_image, null);
  });
});

describe('_parseHtml - YouTube embed extraction', () => {
  it('extracts YouTube embed URL from iframe src', () => {
    const html = loadFixture('article-with-iframe.html');
    const result = _parseHtml(html, 'https://example.com/article');
    assert.ok(result.videos_embed.length > 0, 'Should have at least one video embed');
    assert.ok(
      result.videos_embed.some(v => v.includes('youtube.com/embed/')),
      'Embed URL should be in youtube.com/embed/ format'
    );
  });

  it('extracts YouTube video ID from watch?v= URL in text/links', () => {
    const html = `<html><body>
      <a href="https://www.youtube.com/watch?v=abc123XYZQR">Video</a>
      <p>${'word '.repeat(300)}</p>
    </body></html>`;
    const result = _parseHtml(html, 'https://example.com/article');
    assert.ok(
      result.videos_embed.includes('https://www.youtube.com/embed/abc123XYZQR'),
      'Should extract video from watch?v= URL'
    );
  });

  it('extracts YouTube video from youtu.be short URL', () => {
    const html = `<html><body>
      <a href="https://youtu.be/shortId1234">Short link</a>
      <p>${'word '.repeat(300)}</p>
    </body></html>`;
    const result = _parseHtml(html, 'https://example.com/article');
    assert.ok(
      result.videos_embed.includes('https://www.youtube.com/embed/shortId1234'),
      'Should extract video from youtu.be URL'
    );
  });
});

describe('_parseHtml - text cleaning', () => {
  it('strips nav and footer content from texto_limpo', () => {
    const html = `<html><body>
      <nav>NAV CONTENT SHOULD NOT APPEAR</nav>
      <article>
        <p>${'word '.repeat(300)}</p>
      </article>
      <footer>FOOTER CONTENT SHOULD NOT APPEAR</footer>
    </body></html>`;
    const result = _parseHtml(html, 'https://example.com/article');
    assert.ok(!result.texto_limpo.includes('NAV CONTENT SHOULD NOT APPEAR'), 'nav should be stripped');
    assert.ok(!result.texto_limpo.includes('FOOTER CONTENT SHOULD NOT APPEAR'), 'footer should be stripped');
  });

  it('strips script and style tags from texto_limpo', () => {
    const html = `<html><head>
      <style>body { display: none; STYLE_MARKER }</style>
    </head><body>
      <script>var x = 'SCRIPT_MARKER';</script>
      <p>${'word '.repeat(300)}</p>
    </body></html>`;
    const result = _parseHtml(html, 'https://example.com/article');
    assert.ok(!result.texto_limpo.includes('SCRIPT_MARKER'), 'script content should be stripped');
    assert.ok(!result.texto_limpo.includes('STYLE_MARKER'), 'style content should be stripped');
  });

  it('returns palavras < 200 for short text', () => {
    const html = `<html><body><p>This is a very short article with fewer than 200 words.</p></body></html>`;
    const result = _parseHtml(html, 'https://example.com/article');
    assert.ok(result.palavras < 200, `palavras should be < 200, got ${result.palavras}`);
  });

  it('returns palavras >= 200 for the og fixture (250+ words)', () => {
    const html = loadFixture('article-with-og.html');
    const result = _parseHtml(html, 'https://example.com/article');
    assert.ok(result.palavras >= 200, `palavras should be >= 200, got ${result.palavras}`);
  });
});

describe('_parseHtml - URL resolution', () => {
  it('resolves protocol-relative URLs (//...)', () => {
    const html = `<html><body>
      <img src="//example.com/image.jpg" alt="test">
      <p>${'word '.repeat(300)}</p>
    </body></html>`;
    const result = _parseHtml(html, 'https://base.com/article');
    assert.ok(
      result.body_images.some(img => img === 'https://example.com/image.jpg'),
      'Should resolve // URLs to https'
    );
  });

  it('resolves root-relative paths (/path)', () => {
    const html = `<html><body>
      <img src="/images/article-photo.jpg" alt="photo">
      <p>${'word '.repeat(300)}</p>
    </body></html>`;
    const result = _parseHtml(html, 'https://base.com/article');
    assert.ok(
      result.body_images.some(img => img === 'https://base.com/images/article-photo.jpg'),
      'Should resolve root-relative paths to absolute URLs'
    );
  });

  it('leaves absolute URLs unchanged', () => {
    const html = `<html><body>
      <img src="https://cdn.example.com/photo.jpg" alt="photo">
      <p>${'word '.repeat(300)}</p>
    </body></html>`;
    const result = _parseHtml(html, 'https://base.com/article');
    assert.ok(
      result.body_images.some(img => img === 'https://cdn.example.com/photo.jpg'),
      'Absolute URLs should remain unchanged'
    );
  });
});

describe('_parseHtml - body_images', () => {
  it('collects body images excluding logo/avatar/icon URLs', () => {
    const html = `<html><body>
      <img src="https://example.com/logo.png" alt="logo">
      <img src="https://example.com/user-avatar.jpg" alt="avatar">
      <img src="https://example.com/article-photo.jpg" alt="article photo">
      <p>${'word '.repeat(300)}</p>
    </body></html>`;
    const result = _parseHtml(html, 'https://example.com/article');
    assert.ok(
      !result.body_images.some(img => img.includes('logo')),
      'body_images should not include logo images'
    );
    assert.ok(
      !result.body_images.some(img => img.includes('avatar')),
      'body_images should not include avatar images'
    );
    assert.ok(
      result.body_images.some(img => img.includes('article-photo')),
      'body_images should include regular article images'
    );
  });

  it('deduplicates body images', () => {
    const html = `<html><body>
      <img src="https://example.com/photo.jpg" alt="photo 1">
      <img src="https://example.com/photo.jpg" alt="photo 2 same url">
      <p>${'word '.repeat(300)}</p>
    </body></html>`;
    const result = _parseHtml(html, 'https://example.com/article');
    const photoCount = result.body_images.filter(img => img === 'https://example.com/photo.jpg').length;
    assert.equal(photoCount, 1, 'Duplicate images should be deduplicated');
  });
});
