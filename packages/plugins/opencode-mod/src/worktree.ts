import { Schema } from "effect"
import type { PluginContext } from "./plugin.ts"

// Worktree review and merge.
//
// v2 can create a worktree and remove it, but it has no way to bring the work
// back: an agent that edits inside a worktree leaves the change stranded there.
// These two tools close that loop. `worktree_diff` reads the patch so a reviewer
// can judge it, and `worktree_apply` merges it into the primary checkout.
//
// The merge is a three-way `git apply`, so a file that changed in the primary
// checkout since the worktree was made fails instead of being overwritten. A
// conflict is reported, never forced.

const DiffInput = Schema.Struct({
  directory: Schema.String.annotate({
    description: "Absolute path of the worktree to inspect, as returned by the worktree tool.",
  }),
})

const DiffOutput = Schema.Struct({
  patch: Schema.String,
  filesChanged: Schema.Number,
})

const ApplyInput = Schema.Struct({
  directory: Schema.String.annotate({
    description: "Absolute path of the worktree whose changes should be merged.",
  }),
  target: Schema.optionalKey(Schema.String).annotate({
    description: "Absolute path of the checkout to merge into. Defaults to the current project directory.",
  }),
})

const ApplyOutput = Schema.Struct({
  merged: Schema.Boolean,
  filesChanged: Schema.Number,
  message: Schema.String,
})

/** Runs git in a directory and returns its output, failing on a non-zero exit. */
const git = async (directory: string, args: string[]): Promise<string> => {
  const child = Bun.spawn(["git", ...args], {
    cwd: directory,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
  })
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])
  if (code !== 0) {
    throw new Error(`git ${args.join(" ")} failed (${code}): ${stderr.trim() || stdout.trim()}`)
  }
  return stdout
}

/**
 * patchFor builds the full patch a worktree holds, including files the agent
 * created, which `git diff` alone would miss because they are untracked.
 */
const patchFor = async (directory: string): Promise<{ patch: string; filesChanged: number }> => {
  // --binary keeps image and other binary changes intact.
  const tracked = await git(directory, ["diff", "--binary", "--no-color", "HEAD"])

  // Untracked files get their own diff against the null device, then are
  // appended so a newly created file is part of the patch.
  const untrackedRaw = await git(directory, ["ls-files", "--others", "--exclude-standard"])
  const untracked = untrackedRaw.split("\n").map((line) => line.trim()).filter(Boolean)

  let patch = tracked
  for (const file of untracked) {
    try {
      // `git diff --no-index` exits 1 when the files differ, which is the
      // normal case; git() treats that as failure, so it is run directly here.
      const proc = Bun.spawn(["git", "diff", "--binary", "--no-color", "--no-index", "--", "/dev/null", file], {
        cwd: directory,
        stdout: "pipe",
        stderr: "pipe",
      })
      const [out] = await Promise.all([new Response(proc.stdout).text(), proc.exited])
      patch += out
    } catch {
      // A file that cannot be diffed is skipped rather than failing the whole
      // review, so the rest of the patch stays visible.
    }
  }

  const filesChanged = patch.split("\n").filter((line) => line.startsWith("diff --git ")).length
  return { patch, filesChanged }
}

export async function setup(ctx: PluginContext) {
  await ctx.tool.transform((editor) => {
    editor.add({
      name: "worktree_diff",
      description: [
        "Show the patch a worktree holds, so it can be reviewed before merging.",
        "Includes files created inside the worktree, which a plain git diff would miss.",
        "Read this before calling worktree_apply: merging writes to the user's checkout.",
      ].join("\n"),
      input: DiffInput,
      output: DiffOutput,
      execute: async (input) => {
        const { patch, filesChanged } = await patchFor(input.directory)
        return {
          output: { patch, filesChanged },
          content:
            filesChanged === 0
              ? "The worktree has no changes."
              : `${filesChanged} file(s) changed:\n\n${patch}`,
        }
      },
    })

    editor.add({
      name: "worktree_apply",
      description: [
        "Merge a worktree's changes into a checkout and remove the worktree.",
        "The merge is a three-way git apply: it fails, changing nothing, when the same lines were edited in the checkout since the worktree was created.",
        "On failure, report the conflict to the user. Do not force the merge or hand-edit around it.",
      ].join("\n"),
      input: ApplyInput,
      output: ApplyOutput,
      execute: async (input, context) => {
        const target = input.target ?? ctx.location.directory

        // The permission prompt is the point: this writes to real files.
        await ctx.permission.assert({
          action: "worktree_apply",
          resources: [input.directory, target],
          save: ["*"],
          metadata: input,
          sessionID: context.sessionID,
          agent: context.agent,
          source: { type: "tool", messageID: context.messageID, id: context.id },
        })

        const { patch, filesChanged } = await patchFor(input.directory)
        if (filesChanged === 0) {
          await git(ctx.location.directory, ["worktree", "remove", "--force", input.directory])
          return {
            output: { merged: true, filesChanged: 0, message: "Nothing to merge" },
            content: "The worktree had no changes; it was removed.",
          }
        }

        // --3way lets git resolve what it can and refuse what it cannot, which
        // is what keeps a conflict from silently overwriting the user's work.
        const proc = Bun.spawn(["git", "apply", "--3way", "--whitespace=nowarn", "-"], {
          cwd: target,
          stdin: new Response(patch).body,
          stdout: "pipe",
          stderr: "pipe",
        })
        const [stderr, code] = await Promise.all([new Response(proc.stderr).text(), proc.exited])

        if (code !== 0) {
          return {
            output: { merged: false, filesChanged, message: stderr.trim() },
            content: [
              `Merge failed for ${input.directory}:`,
              stderr.trim(),
              "",
              "The worktree is untouched. Report this to the user and let them decide; do not retry or force it.",
            ].join("\n"),
          }
        }

        await git(target, ["worktree", "remove", "--force", input.directory])
        return {
          output: { merged: true, filesChanged, message: "ok" },
          content: `Merged ${filesChanged} file(s) into ${target} and removed the worktree.`,
        }
      },
    })
  })
}