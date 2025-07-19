import { BotOrchestrator } from "./BotOrchestrator";

// Create and start the bot orchestrator
const orchestrator = new BotOrchestrator();

// Start the orchestrator
orchestrator.start().catch((error) => {
  console.error("❌ Failed to start BotOrchestrator:", error);
  process.exit(1);
});

// Handle graceful shutdown
process.on("SIGINT", async () => {
  console.log("\n⚠️  Shutting down...");
  await orchestrator.stop();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("\n⚠️  Shutting down...");
  await orchestrator.stop();
  process.exit(0);
});

console.log("🎮 Twitch Bot Service Running");
console.log("Press Ctrl+C to stop\n");