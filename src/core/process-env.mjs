/** Browser child processes need no provider keys, signing keys or backup password.
 * This is secret minimisation, not protection against malicious same-user code. */
export function browserEnvironment(source=process.env){
 return Object.fromEntries(Object.entries(source).filter(([key])=>!/(?:ANTHROPIC|OPENAI|API_KEY|SECRET|TOKEN|PASSWORD|DATABASE_URL|PRIVATE_KEY)/i.test(key)));
}
