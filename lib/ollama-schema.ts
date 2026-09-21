const grammarUnsupported=new Set([
  "$schema","additionalProperties","pattern","minLength","maxLength","minItems","maxItems","enum","const",
]);

// Ollama/llama.cpp builds vary in the JSON Schema keywords their grammar
// compiler accepts. This projection keeps structural guidance while the shared
// response validator remains the final authority boundary.
export function toOllamaGrammarSchema(value:unknown):unknown{
  if(Array.isArray(value))return value.map(toOllamaGrammarSchema);
  if(!value||typeof value!=="object")return value;
  return Object.fromEntries(Object.entries(value as Record<string,unknown>)
    .filter(([key])=>!grammarUnsupported.has(key))
    .map(([key,item])=>[key,toOllamaGrammarSchema(item)]));
}
