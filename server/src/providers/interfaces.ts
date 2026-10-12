export interface IEmbeddingProvider {
  readonly name: string;
  readonly dimensions: number;
  embedQuery(text: string): Promise<number[]>;
  embedDocuments(texts: string[]): Promise<number[][]>;
}

export interface ILLMProvider {
  readonly name: string;
  generateResponse(prompt: string, systemInstruction?: string): Promise<string>;
}
