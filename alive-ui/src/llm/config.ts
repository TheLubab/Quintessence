export const llm = {
  endpoint: "/llm/chat/completions",
  model: import.meta.env.VITE_LLM_MODEL,
  temperature: 1,
  extra: { enable_thinking: false },
};
