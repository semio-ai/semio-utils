// Run with node .github/tests/release-harness.mjs. The workflow's shell steps use
// isolated npm/git stubs; no registry requests or Git writes reach the real repo.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { load } = require("js-yaml");

const repo = fileURLToPath(new URL("../..", import.meta.url));
const workflow = load(readFileSync(path.join(repo, ".github/workflows/release.yml"), "utf8"));
const packageName = JSON.parse(readFileSync(path.join(repo, "package.json"), "utf8")).name;
const step = (name) => {
  const found = workflow.jobs.release.steps.find((entry) => entry.name === name);
  assert.ok(found, name);
  return found;
};
const builtCommit = "a".repeat(40);
const versionCommit = "b".repeat(40);
const laterCommit = "c".repeat(40);
const annotatedObject = "d".repeat(40);
const featureCommit = "e".repeat(40);

// This function is serialized into each stub executable, so it has no closures.
function stub(tool) {
  const fs = require("node:fs");
  const args = process.argv.slice(2);
  const stateFile = process.env.RELEASE_HARNESS_STATE;
  const state = JSON.parse(fs.readFileSync(stateFile, "utf8"));
  state.calls.push([tool, ...args]);
  const finish = (status = 0, stdout = "", stderr = "") => {
    fs.writeFileSync(stateFile, JSON.stringify(state));
    process.stdout.write(stdout);
    process.stderr.write(stderr);
    process.exit(status);
  };
  if (tool === "npm") {
    if (args[0] === "--version") finish(0, `${state.npmVersion}\n`);
    if (args[0] === "view") {
      const version = args[1].split("@").at(-1);
      if (state.registry) {
        finish(state.registry.status, state.registry.stdout, state.registry.stderr);
      }
      if (state.published.includes(version)) finish(0, `${JSON.stringify(version)}\n`);
      finish(1, '{"error":{"code":"E404"}}\n', "npm error code E404\n");
    }
    const worktreeCommit = () => {
      const file = pathForCommit();
      if (!fs.existsSync(file)) finish(99, "", "npm must run in the version worktree\n");
      return fs.readFileSync(file, "utf8");
    };
    function pathForCommit() {
      return require("node:path").join(process.cwd(), ".harness-commit");
    }
    if (args[0] === "ci") {
      state.installed = worktreeCommit();
      state.installCwd = process.cwd();
      finish();
    }
    if (args.join(" ") === "run build") {
      if (state.buildFailure) finish(1, "", "build failed\n");
      state.built = worktreeCommit();
      if (state.installed !== state.built || state.installCwd !== process.cwd()) {
        finish(99, "", "build requires npm ci in its own worktree\n");
      }
      finish();
    }
    if (args[0] === "stage" && args[1] === "publish") {
      const version = JSON.parse(fs.readFileSync("package.json", "utf8")).version;
      if (state.built !== worktreeCommit()) finish(99, "", "staging a different build\n");
      if (
        state.stageFailure ||
        state.staged.includes(version) ||
        state.published.includes(version)
      ) {
        finish(1, "", "npm error version exists in the npm index\n");
      }
      state.staged.push(version);
      state.stagedBuilds[version] = state.built;
      finish();
    }
  } else {
    if (state.failGit && args.join(" ").startsWith(state.failGit)) {
      finish(1, "", `stub git failure: ${state.failGit}\n`);
    }
    if (args[0] === "ls-remote") {
      const patterns = args.slice(args.indexOf("origin") + 1);
      const matches = Object.entries(state.remote).filter(([ref]) =>
        patterns.some((pattern) =>
          pattern.endsWith("*") ? ref.startsWith(pattern.slice(0, -1)) : ref === pattern,
        ),
      );
      finish(0, matches.map(([ref, object]) => `${object}\t${ref}\n`).join(""));
    }
    if (args[0] === "rev-parse") {
      if (args[1] === "HEAD") finish(0, `${state.head}\n`);
      if (args[1] === "FETCH_HEAD^{commit}" && state.fetched) {
        finish(0, `${state.objects[state.fetched] ?? state.fetched}\n`);
      }
    }
    if (args[0] === "fetch") {
      state.fetched = args.at(-1);
      finish();
    }
    if (args[0] === "log") {
      const anchored = args.includes('^[[:space:]]*"version"[[:space:]]*:');
      const firstParent = args.includes("--first-parent");
      if (!args.includes("origin/main") || !args.includes("package.json")) {
        finish(99, "", "version log must use main and package.json\n");
      }
      finish(0, `${firstParent && anchored ? state.versionCommit : state.sideCommit}\n`);
    }
    if (args[0] === "show") {
      const commit = args[1].split(":")[0];
      if (!(commit in state.commitVersions)) finish(1, "", "missing package.json\n");
      finish(0, JSON.stringify({ name: state.packageName, version: state.commitVersions[commit] }));
    }
    if (args[0] === "merge-base" && args[1] === "--is-ancestor") {
      if (args[3] !== "origin/main") finish(99, "", "ancestor must be checked on main\n");
      finish(state.offMain.includes(args[2]) ? 1 : 0);
    }
    if (args[0] === "cat-file") {
      if (args[1] === "-t") finish(0, state.objects[args[2]] ? "tag\n" : "commit\n");
      const timestamp = state.taggerDates[args[2]];
      finish(
        0,
        timestamp
          ? `object ${state.objects[args[2]]}\ntype commit\ntagger bot <bot@example.com> ${timestamp} +0000\n\nmarker\n`
          : "tree 123\n",
      );
    }
    if (args[0] === "worktree") {
      if (args[1] === "add" && args[2] === "--detach") {
        const directory = args[3];
        const commit = args[4];
        if (!directory.startsWith(process.env.RUNNER_TEMP + require("node:path").sep)) {
          finish(99, "", "worktree must be under RUNNER_TEMP\n");
        }
        fs.mkdirSync(directory, { recursive: true });
        fs.writeFileSync(
          require("node:path").join(directory, "package.json"),
          JSON.stringify({ name: state.packageName, version: state.commitVersions[commit] }),
        );
        fs.writeFileSync(require("node:path").join(directory, ".harness-commit"), commit);
        finish();
      }
    }
    if (args[0] === "-C" && args[2] === "worktree" && args[3] === "remove") {
      fs.rmSync(args.at(-1), { recursive: true, force: true });
      finish();
    }
    if (args[0] === "tag") {
      const annotated = args[1] === "-a";
      const index = annotated ? 2 : 1;
      const ref = `refs/tags/${args[index]}`;
      if (state.local[ref]) finish(1, "", "local tag already exists\n");
      const commit = args[index + 1];
      if (annotated) {
        if (
          process.env.GIT_COMMITTER_NAME !== "github-actions[bot]" ||
          process.env.GIT_COMMITTER_EMAIL !==
            "41898282+github-actions[bot]@users.noreply.github.com" ||
          args[index + 2] !== "-m" ||
          args[index + 3] !== `staged ${state.packageName}@${state.commitVersions[commit]}`
        ) {
          finish(99, "", "annotated marker needs bot identity and staging message\n");
        }
        const object = require("node:crypto")
          .createHash("sha1")
          .update(ref + commit)
          .digest("hex");
        state.objects[object] = commit;
        state.taggerDates[object] = Math.floor(Date.now() / 1000);
        state.local[ref] = object;
      } else {
        state.local[ref] = commit;
      }
      finish();
    }
    if (args[0] === "push") {
      if (args[2] === "--delete") {
        assertRef(args[3]);
        delete state.remote[args[3]];
      } else {
        assertRef(args[2]);
        if (!state.local[args[2]]) finish(1, "", "no local tag\n");
        state.remote[args[2]] = state.local[args[2]];
      }
      finish();
    }
  }
  finish(99, "", `unsupported stub command: ${tool} ${args.join(" ")}\n`);

  function assertRef(ref) {
    if (!ref.startsWith("refs/tags/")) finish(99, "", "only explicit tag pushes allowed\n");
  }
}

mkdirSync(path.join(repo, "build"), { recursive: true });
const fixtures = mkdtempSync(path.join(repo, "build/release-harness-"));
let passed = 0;
let failed = 0;
function scenario(name, check) {
  const cwd = mkdtempSync(path.join(fixtures, "case-"));
  mkdirSync(path.join(cwd, "bin"));
  mkdirSync(path.join(cwd, ".github/scripts"), { recursive: true });
  copyFileSync(
    path.join(repo, ".github/scripts/npm-published.mjs"),
    path.join(cwd, ".github/scripts/npm-published.mjs"),
  );
  for (const tool of ["npm", "git"]) {
    writeFileSync(
      path.join(cwd, "bin", tool),
      `#!${process.execPath}\n(${stub.toString()})(${JSON.stringify(tool)});\n`,
      { mode: 0o755 },
    );
  }
  const stateFile = path.join(cwd, "state.json");
  const state = () => JSON.parse(readFileSync(stateFile, "utf8"));
  const patch = (values) => writeFileSync(stateFile, JSON.stringify({ ...state(), ...values }));
  writeFileSync(
    stateFile,
    JSON.stringify({
      head: builtCommit,
      versionCommit: builtCommit,
      sideCommit: versionCommit,
      packageName,
      commitVersions: {
        [builtCommit]: "0.6.0",
        [versionCommit]: "0.6.0",
        [laterCommit]: "0.7.0",
        [featureCommit]: "0.6.0",
      },
      offMain: [],
      taggerDates: {},
      stagedBuilds: {},
      npmVersion: "11.19.1",
      calls: [],
      remote: {},
      local: {},
      published: [],
      staged: [],
      objects: {},
    }),
  );
  const setVersion = (version) => {
    writeFileSync(path.join(cwd, "package.json"), JSON.stringify({ name: packageName, version }));
    patch({ commitVersions: { ...state().commitVersions, [state().versionCommit]: version } });
  };
  setVersion("0.6.0");
  writeFileSync(path.join(cwd, "output"), "");
  writeFileSync(path.join(cwd, "summary"), "");
  mkdirSync(path.join(cwd, "temp"));
  const env = {
    ...process.env,
    PATH: `${path.join(cwd, "bin")}${path.delimiter}${process.env.PATH}`,
    RELEASE_HARNESS_STATE: stateFile,
    RUNNER_TEMP: path.join(cwd, "temp"),
    PACKAGE_NAME: packageName,
    PACKAGE_VERSION: "0.6.0",
    VERSION_COMMIT: builtCommit,
    GIT_COMMITTER_NAME: "github-actions[bot]",
    GIT_COMMITTER_EMAIL: "41898282+github-actions[bot]@users.noreply.github.com",
    GITHUB_OUTPUT: path.join(cwd, "output"),
    GITHUB_STEP_SUMMARY: path.join(cwd, "summary"),
  };
  const run = (script) => {
    const result = spawnSync("bash", ["--noprofile", "--norc", "-eo", "pipefail", "-c", script], {
      cwd,
      env,
      encoding: "utf8",
    });
    assert.ifError(result.error);
    return { ...result, text: result.stdout + result.stderr };
  };
  const ok = (result) => {
    assert.equal(result.status, 0, result.text);
    return result;
  };
  const resolve = () => {
    const result = run(step("Resolve version commit").run);
    if (result.status === 0) {
      const outputs = Object.fromEntries(
        readFileSync(env.GITHUB_OUTPUT, "utf8")
          .trim()
          .split("\n")
          .map((line) => line.split("=")),
      );
      env.PACKAGE_NAME = outputs.name;
      env.PACKAGE_VERSION = outputs.version;
      env.VERSION_COMMIT = outputs.commit;
    }
    return result;
  };
  const decision = () => {
    ok(resolve());
    ok(run(step("Decide whether to stage").run));
    return readFileSync(env.GITHUB_OUTPUT, "utf8").trim().split("\n").at(-1);
  };
  const enabled = (job, ref) => {
    assert.equal(workflow.jobs[job].if, "github.ref == 'refs/heads/main'");
    return ref === "refs/heads/main";
  };
  // Evaluate the actual workflow's conditions, including a reintroduced Changesets
  // gate. The action may leave its Version PR branch checked out after resolution.
  const release = (ref = "refs/heads/main", hasChangesets = false) => {
    if (!enabled("release", ref)) return;
    const resolved = resolve();
    if (resolved.status !== 0) return resolved;
    const condition = step("Decide whether to stage").if;
    if (condition) {
      assert.equal(condition, "steps.changesets.outputs.hasChangesets == 'false'");
      if (hasChangesets) return;
    }
    const original = readFileSync(path.join(cwd, "package.json"));
    if (hasChangesets) {
      writeFileSync(
        path.join(cwd, "package.json"),
        JSON.stringify({ name: packageName, version: "9.0.0" }),
      );
    }
    try {
      ok(run(step("Decide whether to stage").run));
      if (readFileSync(env.GITHUB_OUTPUT, "utf8").trim().split("\n").at(-1) === "stage=true") {
        return run(step("Stage on npm with OIDC").run);
      }
    } finally {
      writeFileSync(path.join(cwd, "package.json"), original);
    }
  };
  const tag = (ref = "refs/heads/main") => {
    if (!enabled("tag", ref)) return;
    return run(workflow.jobs.tag.steps.find((entry) => entry.run).run);
  };
  try {
    const markerCommit = (version = "0.6.0") => {
      const object = state().remote[`refs/tags/staged/v${version}`];
      return state().objects[object] ?? object;
    };
    check({ state, patch, setVersion, run, ok, decision, release, tag, cwd, env, markerCommit });
    passed++;
    console.log(`PASS ${name}`);
  } catch (error) {
    failed++;
    console.error(`FAIL ${name}\n${error.stack}`);
  }
}

try {
  scenario("workflow triggers, gates, permissions, runtime and Changesets wiring", () => {
    assert.deepEqual(workflow.on.push.branches, ["main"]);
    assert.equal(workflow.on.workflow_dispatch, null);
    assert.equal(workflow.on.schedule.length, 1);
    assert.equal(workflow.concurrency, "release-${{ github.ref }}");
    assert.equal(workflow.jobs.release.if, "github.ref == 'refs/heads/main'");
    assert.equal(workflow.jobs.tag.if, "github.ref == 'refs/heads/main'");
    assert.equal(workflow.jobs.tag.needs, undefined);
    assert.deepEqual(workflow.jobs.release.permissions, {
      contents: "write",
      "pull-requests": "write",
      "id-token": "write",
    });
    assert.deepEqual(workflow.jobs.tag.permissions, { contents: "write" });
    for (const job of Object.values(workflow.jobs)) {
      assert.equal(
        job.steps.find((entry) => entry.uses?.startsWith("actions/setup-node@")).with[
          "node-version"
        ],
        "24",
      );
    }
    assert.equal(step("Create Version Packages PR").with.publish, undefined);
    assert.equal(step("Decide whether to stage").if, undefined);
    assert.equal(step("Stage on npm with OIDC").if, "steps.staging.outputs.stage == 'true'");
    const steps = workflow.jobs.release.steps;
    assert.ok(
      steps.indexOf(step("Resolve version commit")) <
        steps.indexOf(step("Create Version Packages PR")),
    );
    for (const name of ["Decide whether to stage", "Stage on npm with OIDC"]) {
      assert.equal(step(name).env.PACKAGE_VERSION, "${{ steps.version.outputs.version }}");
      assert.equal(step(name).env.PACKAGE_NAME, "${{ steps.version.outputs.name }}");
    }
    assert.equal(
      step("Stage on npm with OIDC").env.VERSION_COMMIT,
      "${{ steps.version.outputs.commit }}",
    );
    assert.equal(step("Stage on npm with OIDC").env.GIT_COMMITTER_NAME, "github-actions[bot]");
    assert.equal(
      step("Stage on npm with OIDC").env.GIT_COMMITTER_EMAIL,
      "41898282+github-actions[bot]@users.noreply.github.com",
    );
  });

  for (const event of ["push", "workflow_dispatch", "schedule"]) {
    scenario(
      `${event} on main stages an unmarked unpublished version`,
      ({ release, ok, state, env, markerCommit }) => {
        env.GITHUB_EVENT_NAME = event;
        ok(release());
        assert.equal(markerCommit(), builtCommit);
        assert.equal(state().built, builtCommit);
        assert.equal(state().remote["refs/tags/v0.6.0"], undefined);
      },
    );
  }
  scenario(
    "cancelled Version PR run followed by unrelated push stages",
    ({ patch, release, ok, markerCommit }) => {
      // No stage or marker ran for the cancelled push. The next HEAD has the same version.
      patch({ head: laterCommit });
      ok(release());
      assert.equal(markerCommit(), builtCommit);
    },
  );
  scenario(
    "awaiting approval plus another push does not restage",
    ({ release, ok, state, patch, markerCommit }) => {
      ok(release());
      patch({ head: laterCommit, local: {} });
      assert.equal(release(), undefined);
      assert.equal(
        state().calls.filter((call) => call[0] === "npm" && call[1] === "stage").length,
        1,
      );
      assert.equal(markerCommit(), builtCommit);
    },
  );
  scenario("published current version is not staged without a marker", ({ patch, decision }) => {
    patch({ published: ["0.6.0"] });
    assert.equal(decision(), "stage=false");
  });
  scenario(
    "origin release tag suppresses staging even if registry says absent",
    ({ patch, decision }) => {
      patch({ remote: { "refs/tags/v0.6.0": builtCommit } });
      assert.equal(decision(), "stage=false");
    },
  );
  scenario("stale local marker does not suppress staging", ({ patch, decision }) => {
    patch({ local: { "refs/tags/staged/v0.6.0": builtCommit } });
    assert.equal(decision(), "stage=true");
  });
  scenario(
    "marker approved: tag original build and delete origin marker",
    ({ patch, tag, ok, state }) => {
      patch({
        head: laterCommit,
        remote: { "refs/tags/staged/v0.6.0": builtCommit },
        published: ["0.6.0"],
      });
      ok(tag());
      assert.deepEqual(state().remote, { "refs/tags/v0.6.0": builtCommit });
      const pushes = state().calls.filter((call) => call[1] === "push");
      assert.deepEqual(pushes, [
        ["git", "push", "origin", "refs/tags/v0.6.0"],
        ["git", "push", "origin", "--delete", "refs/tags/staged/v0.6.0"],
      ]);
    },
  );
  scenario(
    "two approved markers both tag even when package.json has a later version",
    ({ patch, tag, ok, state, setVersion }) => {
      patch({ versionCommit });
      setVersion("0.8.0");
      patch({
        remote: { "refs/tags/staged/v0.6.0": builtCommit, "refs/tags/staged/v0.7.0": laterCommit },
        published: ["0.6.0", "0.7.0"],
      });
      ok(tag());
      assert.deepEqual(state().remote, {
        "refs/tags/v0.6.0": builtCommit,
        "refs/tags/v0.7.0": laterCommit,
      });
    },
  );
  scenario(
    "merge commit is staged and tagged rather than Version PR side commit",
    ({ patch, release, tag, ok, state }) => {
      patch({ head: builtCommit, versionCommit: builtCommit, sideCommit: versionCommit });
      ok(release());
      patch({ published: ["0.6.0"], head: laterCommit, local: {} });
      ok(tag());
      assert.equal(state().remote["refs/tags/v0.6.0"], builtCommit);
      assert.notEqual(state().remote["refs/tags/v0.6.0"], versionCommit);
      assert.equal(state().built, builtCommit);
      assert.ok(state().calls.some((call) => call[1] === "log" && call.includes("--first-parent")));
    },
  );
  scenario(
    "dispatch retry after later commits tags the commit actually built",
    ({ patch, release, tag, ok, state }) => {
      patch({ head: laterCommit, versionCommit: builtCommit });
      ok(release());
      patch({ published: ["0.6.0"], local: {} });
      ok(tag());
      assert.equal(state().remote["refs/tags/v0.6.0"], builtCommit);
      assert.equal(state().built, builtCommit);
      assert.notEqual(state().built, state().head);
    },
  );
  scenario(
    "unapproved marker is left alone while an approved marker is tagged",
    ({ patch, tag, ok, state }) => {
      patch({
        remote: { "refs/tags/staged/v0.6.0": builtCommit, "refs/tags/staged/v0.7.0": laterCommit },
        published: ["0.7.0"],
      });
      ok(tag());
      assert.deepEqual(state().remote, {
        "refs/tags/staged/v0.6.0": builtCommit,
        "refs/tags/v0.7.0": laterCommit,
      });
    },
  );
  scenario(
    "N4: published current version without a marker is tagged at its version commit",
    ({ patch, tag, ok, state }) => {
      patch({ published: ["0.6.0"] });
      ok(tag());
      assert.deepEqual(state().remote, { "refs/tags/v0.6.0": builtCommit });
    },
  );
  scenario("existing origin release tag is skipped", ({ patch, tag, ok, state }) => {
    const remote = { "refs/tags/staged/v0.6.0": builtCommit, "refs/tags/v0.6.0": builtCommit };
    patch({ remote, published: ["0.6.0"] });
    ok(tag());
    assert.deepEqual(state().remote, remote);
    assert.ok(!state().calls.some((call) => call[1] === "push"));
  });
  scenario(
    "origin marker overrides stale local marker; annotated object resolves to commit",
    ({ patch, tag, ok, state }) => {
      patch({
        remote: { "refs/tags/staged/v0.6.0": annotatedObject },
        local: { "refs/tags/staged/v0.6.0": laterCommit },
        objects: { [annotatedObject]: builtCommit },
        published: ["0.6.0"],
      });
      ok(tag());
      assert.deepEqual(state().remote, { "refs/tags/v0.6.0": builtCommit });
    },
  );
  scenario("dispatch on a non-main ref runs neither job", ({ release, tag, state, env }) => {
    env.GITHUB_EVENT_NAME = "workflow_dispatch";
    release("refs/heads/feature");
    tag("refs/heads/feature");
    release("refs/tags/v0.6.0");
    tag("refs/tags/v0.6.0");
    assert.deepEqual(state().calls, []);
  });
  scenario(
    "N1: cancelled Version PR run then push with changeset stages the version commit",
    ({ release, state, patch, markerCommit, ok }) => {
      patch({ head: laterCommit }); // The cancelled run did nothing; a changeset lands next.
      ok(release("refs/heads/main", true));
      assert.equal(state().built, builtCommit);
      assert.equal(state().stagedBuilds["0.6.0"], builtCommit);
      assert.equal(markerCommit(), builtCommit);
      assert.notEqual(state().remote["refs/tags/staged/v0.6.0"], builtCommit); // annotated
      assert.deepEqual(state().staged, ["0.6.0"]);
    },
  );
  scenario("failed build leaves no staging marker", ({ patch, release, state }) => {
    patch({ buildFailure: true });
    const result = release();
    assert.notEqual(result.status, 0);
    assert.match(result.text, /build failed/);
    assert.deepEqual(state().remote, {});
    assert.deepEqual(state().staged, []);
  });
  scenario(
    "failed npm staging gives marker recovery instructions and creates no marker",
    ({ patch, release, state }) => {
      patch({ stageFailure: true });
      const result = release();
      assert.notEqual(result.status, 0);
      assert.match(result.text, /version exists/);
      assert.match(result.text, new RegExp(`recover it at exactly ${builtCommit}`));
      assert.deepEqual(state().remote, {});
      assert.deepEqual(state().local, {});
    },
  );
  scenario(
    "marker push failure followed by npm index conflict explains exact original build",
    ({ patch, release, state }) => {
      patch({ failGit: "push origin refs/tags/staged/" });
      const first = release();
      assert.notEqual(first.status, 0);
      assert.match(first.text, new RegExp(`built commit ${builtCommit} by hand`));
      assert.deepEqual(state().remote, {});
      patch({ failGit: null, head: laterCommit, local: {} });
      const second = release();
      assert.notEqual(second.status, 0);
      assert.match(second.text, new RegExp(`recover it at exactly ${builtCommit}`));
      assert.equal(state().built, builtCommit);
      assert.deepEqual(state().remote, {});
    },
  );
  scenario(
    "rejected version restages with a bump after origin marker deletion",
    ({ release, ok, state, patch, markerCommit, setVersion }) => {
      ok(release());
      patch({ remote: {}, local: {}, head: laterCommit, versionCommit: laterCommit });
      setVersion("0.7.0");
      ok(release());
      assert.equal(markerCommit("0.7.0"), laterCommit);
      assert.deepEqual(state().staged, ["0.6.0", "0.7.0"]);
    },
  );
  for (const [version, expectedArgs] of [
    ["1.0.0-rc.1", ["--tag", "next"]],
    ["1.0.0+build-with-hyphen", []],
  ]) {
    scenario(`staging dist-tag for ${version}`, ({ setVersion, release, ok, state, cwd }) => {
      setVersion(version);
      ok(release());
      assert.deepEqual(
        state().calls.find((call) => call[1] === "stage"),
        ["npm", "stage", "publish", ...expectedArgs],
      );
      const summary = readFileSync(path.join(cwd, "summary"), "utf8");
      assert.match(summary, /2FA/);
      assert.match(summary, /npm stage approve <id>/);
      assert.ok(summary.includes(`staged/v${version}`));
      assert.ok(summary.includes(builtCommit));
      assert.match(summary, /60 idle days/);
    });
  }
  scenario(
    "N2: invalid markers fail after processing a valid approved marker",
    ({ patch, tag, state }) => {
      patch({
        remote: {
          "refs/tags/staged/v0.4.0": featureCommit,
          "refs/tags/staged/v0.5.0": laterCommit,
          "refs/tags/staged/v0.6.0": builtCommit,
        },
        offMain: [featureCommit],
        published: ["0.4.0", "0.5.0", "0.6.0"],
        commitVersions: {
          [featureCommit]: "0.4.0",
          [laterCommit]: "0.7.0",
          [builtCommit]: "0.6.0",
        },
      });
      const result = tag();
      assert.notEqual(result.status, 0);
      assert.match(
        result.text,
        /::error::refs\/tags\/staged\/v0\.4\.0.*not an ancestor of origin\/main/,
      );
      assert.match(
        result.text,
        /::error::refs\/tags\/staged\/v0\.5\.0.*version 0\.7\.0, expected 0\.5\.0/,
      );
      assert.deepEqual(state().remote, {
        "refs/tags/staged/v0.4.0": featureCommit,
        "refs/tags/staged/v0.5.0": laterCommit,
        "refs/tags/v0.6.0": builtCommit,
      });
    },
  );
  for (const [label, age, warning] of [
    ["old", 8 * 86400, true],
    ["new", 2 * 86400, false],
    ["lightweight", null, false],
  ]) {
    scenario(
      `N3: ${label} unapproved marker age warning`,
      ({ patch, tag, ok, state, decision }) => {
        patch({
          remote: { "refs/tags/staged/v0.6.0": age ? annotatedObject : builtCommit },
          objects: { [annotatedObject]: builtCommit },
          taggerDates: age ? { [annotatedObject]: Math.floor(Date.now() / 1000) - age } : {},
        });
        assert.equal(decision(), "stage=false");
        const result = ok(tag());
        assert.equal(result.text.includes("::warning::"), warning, result.text);
        if (warning)
          assert.match(
            result.text,
            /staged\/v0\.6\.0 awaiting approval for 8 days: approve it on npm, or delete the marker if npm has no such staged version/,
          );
        assert.equal(state().remote["refs/tags/v0.6.0"], undefined);
      },
    );
  }
  scenario(
    "N4: marker push fails, approval arrives, later run recovers version commit",
    ({ patch, release, tag, ok, state }) => {
      patch({ failGit: "push origin refs/tags/staged/" });
      assert.notEqual(release().status, 0);
      patch({ failGit: null, published: ["0.6.0"], head: laterCommit, local: {} });
      assert.equal(release(), undefined);
      ok(tag());
      assert.equal(state().remote["refs/tags/v0.6.0"], builtCommit);
    },
  );
  scenario("version commit mismatch fails release before staging", ({ patch, release, state }) => {
    patch({ commitVersions: { [builtCommit]: "0.5.0" } });
    const result = release();
    assert.notEqual(result.status, 0);
    assert.match(
      result.text,
      new RegExp(`::error::Version commit ${builtCommit}.*0.5.0, expected 0.6.0`),
    );
    assert.deepEqual(state().staged, []);
    assert.deepEqual(state().remote, {});
  });
  scenario("current publication recovery validates version commit too", ({ patch, tag, state }) => {
    patch({ published: ["0.6.0"], commitVersions: { [builtCommit]: "0.5.0" } });
    assert.notEqual(tag().status, 0);
    assert.deepEqual(state().remote, {});
  });
  scenario(
    "stale registry with v tag present never restages, with or without marker",
    ({ patch, decision }) => {
      for (const marker of [true, false]) {
        patch({
          remote: {
            "refs/tags/v0.6.0": builtCommit,
            ...(marker ? { "refs/tags/staged/v0.6.0": builtCommit } : {}),
          },
        });
        assert.equal(decision(), "stage=false");
      }
    },
  );
  for (const version of ["10.9.9", "11.14.9", "11.15.0", "11.19.1", "12.0.0", "11.15.0-beta.1"]) {
    scenario(`npm guard ${version}`, ({ patch, run }) => {
      patch({ npmVersion: version });
      const result = run(step("Require npm with staged publishing support").run);
      const sufficient = ["11.15.0", "11.19.1", "12.0.0"].includes(version);
      assert.equal(result.status === 0, sufficient, result.text);
      if (!sufficient) assert.match(result.text, /npm >= 11\.15\.0/);
    });
  }
  const registryCases = [
    ["exact published version", 0, '"0.6.0"', "", "true"],
    ["npm 10/11 E404 stdout JSON", 1, '{"error":{"code":"E404"}}', "npm error code E404", "false"],
    ["connection error", 1, '{"error":{"code":"ECONNRESET"}}', "network details", null],
    ["authorization error", 1, '{"error":{"code":"E403"}}', "forbidden details", null],
    ["malformed JSON", 1, "invalid-json", "parse details", null],
    ["E404 only on stderr", 1, "", '{"error":{"code":"E404"}}', null],
    ["E404 with unexpected exit status", 2, '{"error":{"code":"E404"}}', "status details", null],
    ["wrong successful version", 0, '"0.5.0"', "", null],
    ["empty successful output", 0, "", "", null],
    ["successful E404 JSON", 0, '{"error":{"code":"E404"}}', "", null],
  ];
  for (const [name, status, stdout, stderr, expected] of registryCases) {
    scenario(`registry helper: ${name}`, ({ patch, run }) => {
      patch({ registry: { status, stdout, stderr } });
      const result = run(`node .github/scripts/npm-published.mjs ${packageName} 0.6.0`);
      if (expected) {
        assert.equal(result.status, 0, result.text);
        assert.equal(result.stdout.trim(), expected);
      } else {
        assert.notEqual(result.status, 0);
        assert.equal(result.stdout, "");
        assert.match(result.stderr, /Cannot determine/);
        assert.ok(result.stderr.includes(stdout));
        assert.ok(result.stderr.includes(stderr));
      }
    });
  }
  for (const job of ["release", "tag"]) {
    scenario(
      `${job} propagates registry error and makes no remote writes`,
      ({ patch, run, tag, state }) => {
        patch({
          remote: { "refs/tags/staged/v0.6.0": builtCommit },
          registry: {
            status: 1,
            stdout: '{"error":{"code":"ECONNRESET"}}',
            stderr: "network details",
          },
        });
        const result = job === "release" ? run(step("Decide whether to stage").run) : tag();
        assert.notEqual(result.status, 0);
        assert.match(result.text, /network details/);
        assert.ok(!state().calls.some((call) => ["push", "tag"].includes(call[1])));
      },
    );
  }
  for (const failGit of ["ls-remote", "fetch", "push origin refs/tags/v", "push origin --delete"]) {
    scenario(`tag job preserves marker on ${failGit} failure`, ({ patch, tag, state }) => {
      patch({ remote: { "refs/tags/staged/v0.6.0": builtCommit }, published: ["0.6.0"], failGit });
      assert.notEqual(tag().status, 0);
      assert.equal(state().remote["refs/tags/staged/v0.6.0"], builtCommit);
      if (failGit !== "push origin --delete")
        assert.equal(state().remote["refs/tags/v0.6.0"], undefined);
    });
  }
  scenario("release fails on origin lookup error", ({ patch, run, state }) => {
    patch({ failGit: "ls-remote" });
    assert.notEqual(run(step("Decide whether to stage").run).status, 0);
    assert.deepEqual(state().staged, []);
  });
} finally {
  rmSync(fixtures, { recursive: true, force: true });
}
console.log(`${packageName}: ${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
