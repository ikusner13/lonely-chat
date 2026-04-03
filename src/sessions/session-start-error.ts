import * as Schema from "effect/Schema";

export class SessionStartError extends Schema.TaggedErrorClass<SessionStartError>()(
  "SessionStartError",
  {
    cause: Schema.optional(Schema.Defect),
    reason: Schema.String,
  },
) {}
