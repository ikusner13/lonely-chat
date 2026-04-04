import type { BotAuthStatusRecord } from "./bot-token-record";

const validStatusLabel = "Valid";
const expiredStatusLabel = "Expired";
const missingStatusLabel = "Missing";

export const getBotAuthStatusLabel = (auth: BotAuthStatusRecord): string => {
  switch (auth.status) {
    case "valid": {
      return validStatusLabel;
    }
    case "expired": {
      return expiredStatusLabel;
    }
    case "missing": {
      return missingStatusLabel;
    }
    default: {
      return missingStatusLabel;
    }
  }
};

export const getBotAuthStatusBadgeClass = (auth: BotAuthStatusRecord): string => {
  switch (auth.status) {
    case "valid": {
      return "bg-green-500/10 text-green-400 ring-1 ring-green-500/20 ring-inset";
    }
    case "expired": {
      return "bg-amber-500/10 text-amber-300 ring-1 ring-amber-500/20 ring-inset";
    }
    case "missing": {
      return "bg-zinc-700/50 text-zinc-300 ring-1 ring-zinc-600/50 ring-inset";
    }
    default: {
      return "bg-zinc-700/50 text-zinc-300 ring-1 ring-zinc-600/50 ring-inset";
    }
  }
};

export const getBotAuthStatusDetail = (auth: BotAuthStatusRecord): string => {
  switch (auth.status) {
    case "valid": {
      return auth.expiresAt === null
        ? "Credential metadata is stored."
        : `Credential expires ${auth.expiresAt}.`;
    }
    case "expired": {
      return auth.expiresAt === null
        ? "Credential metadata is stale."
        : `Credential expired ${auth.expiresAt}.`;
    }
    case "missing": {
      return "No credential metadata stored yet.";
    }
    default: {
      return "No credential metadata stored yet.";
    }
  }
};
