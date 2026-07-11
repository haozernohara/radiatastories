// ============================================================
// Motor de Oportunidades (GSC) — API
//   GET /api/gsc  -> queries em "distancia de ataque" (posicao 5-20)
//   Retorna { configured:false } enquanto GSC_SERVICE_ACCOUNT_JSON nao existir.
// ============================================================
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { strikingDistance } from '@/lib/pipeline/gsc';

export async function GET(): Promise<Response> {
  const result = await strikingDistance();
  return Response.json(result);
}
