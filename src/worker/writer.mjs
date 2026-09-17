import {AnthropicWriter} from '../adapters/anthropic.mjs';
/** Writing is a separate explicit network/cost opt-in. A key by itself, a UI
 * preference or the legacy classifier opt-in cannot enable new paid requests. */
export function createWorkerWriter({store,env=process.env,fetchFn=fetch}={}) {
  const provider=env.BIEDBOT_WRITER_PROVIDER||'offline';
  if(provider==='offline')return null;
  if(provider!=='anthropic')throw new Error('Onbekende lokale schrijfaanbieder');
  if(typeof env.ANTHROPIC_API_KEY!=='string'||!env.ANTHROPIC_API_KEY.trim())throw new Error('Anthropic-schrijver geselecteerd zonder lokale dealersleutel');
  return new AnthropicWriter({store,fetchFn,apiKey:env.ANTHROPIC_API_KEY,
    model:env.BIEDBOT_WRITER_MODEL||env.BIEDBOT_AI_MODEL||store.settings().aiModel,
    workspaceId:env.ANTHROPIC_WORKSPACE_ID||undefined});
}
