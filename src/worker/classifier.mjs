import {AnthropicClassifier} from '../adapters/anthropic.mjs';

/** Process-local opt-in. An existing key, database setting or browser request cannot
 * enable network access. No key is persisted, returned via HTTP, or put in workerData.
 * Platform messaging remains the isolated DemoAdapter regardless of this choice.
 */
export function createWorkerClassifier({store,env=process.env,fetchFn=fetch}={}){
  const provider=env.BIEDBOT_AI_PROVIDER||'offline';
  if(provider==='offline')return null;
  if(provider!=='anthropic')throw new Error('Onbekende lokale AI-aanbieder');
  if(typeof env.ANTHROPIC_API_KEY!=='string'||!env.ANTHROPIC_API_KEY.trim())throw new Error('Anthropic geselecteerd zonder lokale dealersleutel');
  return new AnthropicClassifier({store,fetchFn,apiKey:env.ANTHROPIC_API_KEY,
    model:env.BIEDBOT_AI_MODEL||store.settings().aiModel,workspaceId:env.ANTHROPIC_WORKSPACE_ID||undefined});
}
