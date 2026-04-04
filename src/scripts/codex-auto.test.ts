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

const codexWriteAndCompleteStub = `#!/usr/bin/env bash
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

echo "new durable work" >> generated-output.txt

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

const vpFormattingThenPassStub = `#!/usr/bin/env bash
set -euo pipefail

state_file=".vp-check-state"

if [[ "$1" == "fmt" ]]; then
  touch "$state_file"
  exit 0
fi

if [[ "$1" == "check" ]]; then
  if [[ ! -f "$state_file" ]]; then
    cat >&2 <<'EOF'
VITE+ - The Unified Toolchain for the Web

error: Formatting issues found
src/example.ts (0ms)

Found formatting issues in 1 file (12ms, 1 thread). Run \`vp check --fix\` to fix them.
EOF
    exit 1
  fi

  exit 0
fi

if [[ "$1" == "run" && "\${2:-}" == "test" ]]; then
  exit 0
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

const createReproRepo = async (vpContents = vpStub, codexContents = codexStub) => {
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
  await writeFile(join(binPath, "codex"), codexContents);
  await writeFile(join(binPath, "vp"), vpContents);
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

  it("auto-formats formatting-only vp check failures before retrying verification", async () => {
    const { repoPath, tempDirectory } = await createReproRepo(vpFormattingThenPassStub);

    try {
      const { stdout } = await execFile(
        "bash",
        ["./scripts/codex-auto.sh", "--max-iterations", "1", "--no-commit"],
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

      expect(stdout).toContain("completed 1 slice(s); reached max loop iterations: 1");
      expect(eventsLog).toContain("vp check reported formatting issues; running vp fmt");
      expect(eventsLog).toContain("vp fmt passed; re-running vp check");
      expect(eventsLog.match(/starting Codex iteration/g)).toHaveLength(1);
    } finally {
      await rm(tempDirectory, {
        force: true,
        recursive: true,
      });
    }
  }, 15_000);

  it("commits all repo changes after a slice is fully complete", async () => {
    const { repoPath, tempDirectory } = await createReproRepo(
      vpFormattingThenPassStub,
      codexWriteAndCompleteStub,
    );

    try {
      await execFile("bash", ["./scripts/codex-auto.sh", "--max-iterations", "1"], {
        cwd: repoPath,
        env: {
          ...process.env,
          PATH: `${join(repoPath, "bin")}:${inheritedPath}`,
        },
        timeout: 10_000,
      });

      const { stdout: logOutput } = await execFile("git", ["log", "--oneline", "--max-count=2"], {
        cwd: repoPath,
      });
      const { stdout: statusOutput } = await execFile("git", ["status", "--short"], {
        cwd: repoPath,
      });
      const { stdout: committedFilesOutput } = await execFile(
        "git",
        ["show", "--stat", "--name-only", "HEAD"],
        {
          cwd: repoPath,
        },
      );
      const meaningfulStatusLines = statusOutput
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line !== "")
        .filter((line) => !line.endsWith(".codex-auto/events.log"))
        .filter((line) => !line.endsWith(".codex-auto/status.json"));

      expect(logOutput).toContain("feat(auto): slice-a (iteration 1)");
      expect(committedFilesOutput).toContain("generated-output.txt");
      expect(meaningfulStatusLines).toEqual([]);
    } finally {
      await rm(tempDirectory, {
        force: true,
        recursive: true,
      });
    }
  }, 15_000);
});
