// ============================================================
// json-extract.test.ts — Tests for extractJsonObject
// Uses node:test (Node.js built-in, no dependencies needed)
// ============================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractJsonObject } from './json-extract.ts';

test('parses a plain JSON object', () => {
  const result = extractJsonObject('{"a":1}');
  assert.deepStrictEqual(result, { a: 1 });
});

test('parses JSON wrapped in ```json fence', () => {
  const result = extractJsonObject('```json\n{"a":1}\n```');
  assert.deepStrictEqual(result, { a: 1 });
});

test('extracts JSON from surrounding prose', () => {
  const result = extractJsonObject('Sure, here you go:\n{"a":1}\nLet me know if you need more.');
  assert.deepStrictEqual(result, { a: 1 });
});

test('throws on non-JSON input', () => {
  assert.throws(
    () => extractJsonObject('not valid'),
    (err: any) => {
      assert.ok(err instanceof Error, 'should be an Error');
      return true;
    }
  );
});

test('handles trailing comma before }', () => {
  const result = extractJsonObject('{"a":1,}');
  assert.deepStrictEqual(result, { a: 1 });
});

test('handles trailing comma in nested object and array', () => {
  const result = extractJsonObject('{ "a": 1, "b": [1,2,3,], }');
  assert.deepStrictEqual(result, { a: 1, b: [1, 2, 3] });
});

test('real-world LLM quirk: prose + ```json fence + trailing text', () => {
  const input = 'Here is the JSON:\n\n```json\n{\n  "aprovado": true,\n  "notas": { "humanizacao": 8 },\n  "media": 8.0\n}\n```\n\nLet me know if anything else is needed!';
  const result = extractJsonObject(input) as any;
  assert.strictEqual(result.aprovado, true);
  assert.strictEqual(result.notas.humanizacao, 8);
  assert.strictEqual(result.media, 8.0);
});

test('throws error with .raw property set on parse failure', () => {
  let caught: unknown = null;
  try {
    extractJsonObject('{ invalid json here }');
  } catch (err) {
    caught = err;
  }
  assert.ok(caught instanceof Error, 'should throw an Error');
  assert.ok(typeof (caught as any).raw === 'string', 'error should have .raw property');
});
