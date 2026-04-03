import * as Schema from "effect/Schema";

export class AiGenerationError extends Schema.TaggedErrorClass<AiGenerationError>()(
  "AiGenerationError",
  {
    botName: Schema.String,
    model: Schema.String,
    cause: Schema.optional(Schema.Defect),
  },
) {}
