// ============================================================
// Radiata Blog System — Robust JSON Extractor
// Phase 1, Plan 04: AI Rewriter + QA Module
// ============================================================
// Handles the common LLM output quirks:
//   - Fenced code blocks (```json ... ```)
//   - Surrounding prose
//   - Trailing commas before } or ]

/**
 * Extracts the first JSON object from a raw string.
 *
 * Tolerates:
 * - ```json ... ``` or ``` ... ``` fences
 * - Surrounding prose (text before { and after })
 * - Trailing commas before } or ]
 *
 * Throws an Error with `.raw` property on parse failure.
 */
export function extractJsonObject(raw: string): unknown {
  // 1. Trim surrounding whitespace
  let cleaned = raw.trim();

  // 2. Strip ```json...``` or ```...``` fences
  cleaned = cleaned
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```\s*$/i, '');

  // 3. Strip <details>...</details> blocks (Claude tool-use visual summaries)
  cleaned = cleaned.replace(/<details>[\s\S]*?<\/details>/gi, '').trim();

  // 4. Find first { and last }
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');

  if (firstBrace === -1 || lastBrace === -1 || firstBrace >= lastBrace) {
    const err = new Error(`No JSON object found in input. Input starts with: ${cleaned.slice(0, 80)}`);
    (err as any).raw = cleaned;
    throw err;
  }

  // Take the substring from first { to last } (inclusive)
  const candidate = cleaned.slice(firstBrace, lastBrace + 1);

  // 5. Strip trailing commas before } or ]
  let withoutTrailingCommas = candidate.replace(/,\s*(?=[}\]])/g, '');

  // 6. Fix unescaped double quotes inside HTML tags (href="url" → href='url').
  //    JSON structural quotes are never inside HTML angle brackets.
  withoutTrailingCommas = withoutTrailingCommas.replace(/<[^>]+>/g, (tag) => tag.replace(/"/g, "'"));

  // 7. Parse — if it fails, repair unescaped quotes in string values and retry.
  try {
    return JSON.parse(withoutTrailingCommas);
  } catch {
    const repaired = repairUnescapedQuotes(withoutTrailingCommas);
    try {
      return JSON.parse(repaired);
    } catch (finalError) {
      const err = new Error(
        `Failed to parse JSON. Reason: ${(finalError as Error).message}`,
        { cause: finalError }
      );
      (err as any).raw = repaired;
      throw err;
    }
  }
}

/**
 * State-machine repair for JSON with unescaped " inside string values.
 * Scans character by character; when inside a string, a " is treated as
 * a closing quote only if followed (after optional whitespace) by : , } ]
 * — otherwise it is escaped as \".
 */
function repairUnescapedQuotes(json: string): string {
  let result = '';
  let i = 0;

  while (i < json.length) {
    const ch = json[i];

    if (ch !== '"') {
      result += ch;
      i++;
      continue;
    }

    // Opening quote of a JSON string
    result += '"';
    i++;

    while (i < json.length) {
      const c = json[i];

      if (c === '\\') {
        result += c;
        i++;
        if (i < json.length) { result += json[i]; i++; }
        continue;
      }

      if (c === '"') {
        // Peek past whitespace to find the next structural character
        let j = i + 1;
        while (j < json.length && (json[j] === ' ' || json[j] === '\t' || json[j] === '\n' || json[j] === '\r')) j++;
        const next = json[j] ?? '';
        if (next === ':' || next === ',' || next === '}' || next === ']') {
          result += '"';
          i++;
          break; // end of this string
        }
        // Unescaped quote inside value — escape it
        result += '\\"';
        i++;
        continue;
      }

      result += c;
      i++;
    }
  }

  return result;
}
