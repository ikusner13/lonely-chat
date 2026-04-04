import { Schema } from "effect";

import { BotId, BotPlatform } from "./bot-record";

export const BotTokenId = Schema.String.pipe(Schema.brand("BotTokenId"));
export type BotTokenId = typeof BotTokenId.Type;

export const BotAuthStatus = Schema.Literals(["missing", "expired", "valid"]);
export type BotAuthStatus = typeof BotAuthStatus.Type;

export class BotTokenRecord extends Schema.Class("BotTokenRecord")({
  accessToken: Schema.NonEmptyString,
  botId: BotId,
  createdAt: Schema.String,
  expiresAt: Schema.String,
  id: BotTokenId,
  platform: BotPlatform,
  refreshToken: Schema.NonEmptyString,
  scopes: Schema.Array(Schema.NonEmptyString),
  updatedAt: Schema.String,
}) {}

export class BotAuthStatusRecord extends Schema.Class("BotAuthStatusRecord")({
  botId: BotId,
  expiresAt: Schema.NullOr(Schema.String),
  platform: BotPlatform,
  scopes: Schema.Array(Schema.String),
  status: BotAuthStatus,
  updatedAt: Schema.NullOr(Schema.String),
}) {}
