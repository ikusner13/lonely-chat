import { chmod, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "@effect/vitest";

const execFile = promisify(execFileCallback);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const codexAutoScript = join(repoRoot, "scripts", "codex-auto.sh");
const inheritedPath = process.env["PATH"] ?? "";
const promptContents = "# prompt\n";
const agentsContents = "# agents\n";
const learningsContents = "# learnings\n";
const implementationPromptContents = "# implementation prompt\n";

const codexStub = `#!/usr/bin/env bash
set -euo pipefail

result=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --output-last-message)
      result="$2"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done

cat <<'JSON'
{"type":"thread.started","thread_id":"test-thread"}
{"type":"turn.started"}
{"type":"item.completed","item":{"type":"agent_message","text":"working"}}
{"type":"turn.completed","usage":{"input_tokens":1,"output_tokens":1}}
JSON

cat > "$result" <<'JSON'
{"status":"slice_complete","selected_slice":"slice-a","summary":"ok","tests_run":[],"manual_verification":"none","task_checkbox_updated":true,"follow_ups":[]}
JSON
`;

const vpStub = `#!/usr/bin/env bash
set -euo pipefail

if [[ "$1" == "check" ]]; then
  echo "simulated vp check failure" >&2
  exit 1
fi

exit 0
`;

const initializeGitRepo = async (repoPath: string) => {
  await execFile("git", ["init", "-q"], { cwd: repoPath });
  await execFile("git", ["config", "user.email", "test@example.com"], { cwd: repoPath });
  await execFile("git", ["config", "user.name", "test"], { cwd: repoPath });
  await execFile("git", ["add", "."], { cwd: repoPath });
  await execFile("git", ["commit", "-qm", "init"], { cwd: repoPath });
};

const createReproRepo = async () => {
  const tempDirectory = await mkdtemp(join(tmpdir(), "lonely-chat-codex-auto-"));
  const repoPath = join(tempDirectory, "repro");
  const binPath = join(repoPath, "bin");

  await mkdir(join(repoPath, "scripts"), { recursive: true });
  await mkdir(join(repoPath, "specs"), { recursive: true });
  await mkdir(binPath, { recursive: true });
  await copyFile(codexAutoScript, join(repoPath, "scripts", "codex-auto.sh"));
  await writeFile(join(repoPath, "PROMPT.md"), promptContents);
  await writeFile(join(repoPath, "AGENTS.md"), agentsContents);
  await writeFile(join(repoPath, "LEARNINGS.md"), learningsContents);
  await writeFile(
    join(repoPath, "specs", "implementation-agent-prompt.md"),
    implementationPromptContents,
  );
  await writeFile(join(binPath, "codex"), codexStub);
  await writeFile(join(binPath, "vp"), vpStub);
  await chmod(join(binPath, "codex"), 0o755);
  await chmod(join(binPath, "vp"), 0o755);
  await initializeGitRepo(repoPath);

  return {
    repoPath,
    tempDirectory,
  };
};

describe("codex-auto", () => {
  it("stops after the requested number of loop iterations even when verification keeps failing", async () => {
    const { repoPath, tempDirectory } = await createReproRepo();

    try {
      const { stdout } = await execFile(
        "bash",
        ["./scripts/codex-auto.sh", "--max-iterations", "2", "--no-commit"],
        {
          cwd: repoPath,
          env: {
            ...process.env,
            PATH: `${join(repoPath, "bin")}:${inheritedPath}`,
          },
          timeout: 10_000,
        },
      );
      const eventsLog = await readFile(join(repoPath, ".codex-auto", "events.log"), "utf8");

      expect(stdout).toContain("reached max loop iterations: 2");
      expect(eventsLog.match(/starting Codex iteration/g)).toHaveLength(2);
      expect(eventsLog).not.toContain("starting Codex iteration 3");
    } finally {
      await rm(tempDirectory, {
        force: true,
        recursive: true,
      });
    }
  }, 15_000);
});
