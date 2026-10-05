export type Provider = "anthropic" | "openai";
export type Tier = "fast" | "balanced" | "strong";

export type Model = {
  id: string;
  name: string;
  compactName: string;
  provider: Provider;
  providerLabel: string;
  tier: Tier;
  inputPrice: number;
  outputPrice: number;
  runtimeFactor: number;
  descriptor: string;
};

// Standard uncached direct-API list-rate profile used by the simulator.
// Prices are USD per 1M tokens. Cache/batch/fast/regional pricing is excluded.
export const MODELS: Model[] = [
  {
    id: "claude-haiku-4-5",
    name: "Claude Haiku 4.5",
    compactName: "Haiku 4.5",
    provider: "anthropic",
    providerLabel: "Anthropic",
    tier: "fast",
    inputPrice: 1,
    outputPrice: 5,
    runtimeFactor: 0.72,
    descriptor: "Fast, focused work"
  },
  {
    id: "claude-sonnet-5-5",
    name: "Claude Sonnet 5.5",
    compactName: "Sonnet 5.5",
    provider: "anthropic",
    providerLabel: "Anthropic",
    tier: "balanced",
    inputPrice: 2,
    outputPrice: 10,
    runtimeFactor: 1,
    descriptor: "Balanced coding & agents"
  },
  {
    id: "claude-opus-5-5",
    name: "Claude Opus 5.5",
    compactName: "Opus 5.5",
    provider: "anthropic",
    providerLabel: "Anthropic",
    tier: "strong",
    inputPrice: 4,
    outputPrice: 20,
    runtimeFactor: 1.32,
    descriptor: "Deep, high-stakes work"
  },
  {
    id: "gpt-6-luna",
    name: "GPT-6 Luna",
    compactName: "GPT-6 Luna",
    provider: "openai",
    providerLabel: "OpenAI",
    tier: "fast",
    inputPrice: 0.1,
    outputPrice: 0.5,
    runtimeFactor: 0.7,
    descriptor: "Efficient, high-volume work"
  },
  {
    id: "gpt-6.1-sol",
    name: "GPT-6.1 Sol",
    compactName: "GPT-6.1 Sol",
    provider: "openai",
    providerLabel: "OpenAI",
    tier: "balanced",
    inputPrice: 2,
    outputPrice: 10,
    runtimeFactor: 0.98,
    descriptor: "Balanced complex work"
  },
  {
    id: "gpt-6-astra",
    name: "GPT-6 Astra",
    compactName: "GPT-6 Astra",
    provider: "openai",
    providerLabel: "OpenAI",
    tier: "strong",
    inputPrice: 10,
    outputPrice: 50,
    runtimeFactor: 1.42,
    descriptor: "Most demanding work"
  }
];

export const getModel = (id: string) =>
  MODELS.find((model) => model.id === id) ?? MODELS[2];

export const modelsForProvider = (provider: Provider) =>
  MODELS.filter((model) => model.provider === provider);

export const anthropicModelForTier = (tier: Tier) =>
  MODELS.find(
    (model) => model.provider === "anthropic" && model.tier === tier
  ) ?? MODELS[1];
