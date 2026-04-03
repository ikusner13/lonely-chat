import * as Schema from "effect/Schema";
import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

import { effectRunner } from "$lib/server/runtime";
import {
  SessionExportFormat,
  SessionId,
  SessionService,
} from "../../../../../sessions/Services/session-service";

const notFound = 404;
const badRequest = 400;

export const GET: RequestHandler = async ({ params }) => {
  const decodedFormat = Schema.decodeUnknownResult(SessionExportFormat)(params.format);

  if (decodedFormat._tag !== "Success") {
    error(badRequest, { message: "Invalid export format" });
  }

  const format = decodedFormat.success;
  const sessionId = SessionId.makeUnsafe(params.sessionId);

  const exported = await effectRunner(
    SessionService.use((s) => s.exportSession(sessionId, format)),
  );

  if (exported === null) {
    error(notFound, { message: "Session not found" });
  }

  const contentType =
    format === "csv" ? "text/csv; charset=utf-8" : "application/json; charset=utf-8";
  const filename = `session-${params.sessionId}.${format}`;

  return new Response(exported, {
    headers: {
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Type": contentType,
    },
  });
};
