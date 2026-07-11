// GSC — teste do JWT assinado (usa par de chaves efêmero, sem credencial real)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { buildSignedJwt } from './gsc.ts';

test('buildSignedJwt: gera um JWT RS256 válido e verificável', () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
  const now = 1_800_000_000;
  const jwt = buildSignedJwt('sa@proj.iam.gserviceaccount.com', pem, now);

  const parts = jwt.split('.');
  assert.equal(parts.length, 3, 'JWT deve ter 3 partes');

  // header e claim decodificam corretamente
  const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
  const claim = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
  assert.equal(header.alg, 'RS256');
  assert.equal(claim.iss, 'sa@proj.iam.gserviceaccount.com');
  assert.equal(claim.aud, 'https://oauth2.googleapis.com/token');
  assert.equal(claim.scope, 'https://www.googleapis.com/auth/webmasters.readonly');
  assert.equal(claim.iat, now);
  assert.equal(claim.exp, now + 3600);

  // a assinatura confere com a chave pública correspondente
  const ok = crypto.createVerify('RSA-SHA256')
    .update(`${parts[0]}.${parts[1]}`)
    .verify(publicKey, Buffer.from(parts[2], 'base64url'));
  assert.ok(ok, 'assinatura RS256 deve ser válida');
});
