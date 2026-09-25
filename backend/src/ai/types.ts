// What the model is allowed to see about a message. Internal database ids
// and processing state are deliberately excluded.
export interface AIMessageInput {
  content: string;
  senderName: string | null;
  messageType: string;
  sentAt: Date;
  groupName: string | null;
}

// Raw provider output. Parsing and validation happen once, in the caller,
// through parseAIAnalysis, so providers stay interchangeable.
export interface AIProviderResponse {
  model: string;
  content: string;
}

export interface AIProvider {
  analyze(input: AIMessageInput): Promise<AIProviderResponse>;
}
