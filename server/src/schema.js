export const ReviewSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    overall: {
      type: "object",
      additionalProperties: false,
      properties: {
        risk: { type: "string", enum: ["low","medium","high","critical"] },
        decision: { type: "string", enum: ["approve","comment","request_changes"] },
        summary: { type: "string" },
        test_suggestions: { type: "array", items: { type: "string" } },
        positives: { type: "array", items: { type: "string" } },
        caveats: { type: "array", items: { type: "string" } }
      },
      required: ["risk","decision","summary","test_suggestions","positives","caveats"]
    },
    highlights: { type: "array", items: { type: "string" } },
    file_summaries: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          path: { type: "string" },
          risk: { type: "string", enum: ["low","medium","high","critical"] },
          summary: { type: "string" }
        },
        required: ["path","risk","summary"]
      }
    },
    comments: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          path: { type: "string" },
          side: { type: "string", enum: ["RIGHT","LEFT"] },
          line: { type: "integer", minimum: 1 },
          start_line: { anyOf: [{ type: "integer", minimum: 1 }, { type: "null" }] },
          start_side: { anyOf: [{ type: "string", enum: ["RIGHT","LEFT"] }, { type: "null" }] },

          category: { type: "string", enum: ["bug","security","performance","testing","readability","style","design","documentation","other"] },
          severity: { type: "string", enum: ["nit","low","medium","high","critical"] },
          confidence: { type: "number", minimum: 0, maximum: 1 },

          title: { type: "string" },
          message: { type: "string" },
          suggestion: { anyOf: [{ type: "string" }, { type: "null" }] }
        },
        required: ["path","side","line","start_line","start_side","category","severity","confidence","title","message","suggestion"]
      }
    },
    meta: {
      type: "object",
      additionalProperties: false,
      properties: {},
      required: []
    }
  },
  required: ["overall","highlights","file_summaries","comments","meta"]
};
