export const string = { type: "string", minLength: 1, maxLength: 200 };
export const params = {
  type: "object",
  required: ["id"],
  additionalProperties: false,
  properties: { id: string, conversationId: string },
};
export const nameBody = {
  type: "object",
  additionalProperties: false,
  required: ["name"],
  properties: {
    name: { type: "string", minLength: 1, maxLength: 80, pattern: "\\S" },
  },
};
