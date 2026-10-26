import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pull } from "../src/pull.ts";
import { push } from "../src/push.ts";
import { status } from "../src/status.ts";
import { readState, safeAt, writeAt } from "../src/remote/state.ts";
import { walkLocal } from "../src/remote/paths.ts";
import { hashText } from "../src/remote/paths.ts";
import { BAD, FakeServer, pageRow, sink, tempDir, writeFiles } from "./fakeServer.ts";

const SITE = "site1";
const FILES = {
  "site.json": '{ "name": "Demo" }\n',
  "theme.css": ":root { --p: red; }\n",
  "pages/index.liquid": "<main>\n<h1>Hello</h1>\n</main>\n",
  "pages/about.liquid": "<main><h1>About</h1></main>\n",
  "partials/header.liquid": "<header>Menu</header>\n",
};

function served(files: Record<string, string> = FILES) {
  const server = new FakeServer(files);
  server.pages = [pageRow("pages/index.liquid"), pageRow("pages/about.liquid")];
  return server;
}

async function pulled(server = served()) {
  const dir = tempDir();
  const io = sink();
  await pull({ client: server, siteId: SITE, dir, log: io.log });
  return { server, dir, io };
}

const read = (dir: string, path: string) => readFileSync(join(dir, path), "utf8");

test("pull writes the remote layout, a state file with versions, and ignores itself in git", async () => {
  const { dir, server } = await pulled();
  assert.equal(read(dir, "pages/index.liquid"), FILES["pages/index.liquid"]);
  assert.equal(read(dir, "partials/header.liquid"), FILES["partials/header.liquid"]);
  const state = readState(dir)!;
  assert.equal(state.siteId, SITE);
  assert.equal(state.baseUrl, server.baseUrl);
  assert.equal(state.files["theme.css"]!.version, hashText(FILES["theme.css"]));
  assert.equal(state.pages.length, 2);
  assert.equal(read(dir, ".pagehub/.gitignore"), "*\n");
  assert.equal(read(dir, ".pagehub/base/pages/index.liquid"), FILES["pages/index.liquid"]);
});

test("pulling again fetches only what changed on the server and keeps your edits to other files", async () => {
  const { dir, server } = await pulled();
  writeFileSync(join(dir, "pages/about.liquid"), "<main><h1>About us, edited here</h1></main>\n");
  server.edit("theme.css", ":root { --p: blue; }\n");
  server.reads = 0;
  const io = sink();
  const r = await pull({ client: server, siteId: SITE, dir, log: io.log });
  assert.equal(server.reads, 1, "only the changed file was read");
  assert.deepEqual(r.updated, ["theme.css"]);
  assert.deepEqual(r.keptLocal, ["pages/about.liquid"]);
  assert.equal(read(dir, "theme.css"), ":root { --p: blue; }\n");
  assert.match(read(dir, "pages/about.liquid"), /edited here/);
});

test("a file changed on both sides is not overwritten: the server's copy goes to .pagehub/theirs with a merge command", async () => {
  const { dir, server } = await pulled();
  writeFileSync(join(dir, "pages/index.liquid"), "<main>\n<h1>Mine</h1>\n</main>\n");
  server.edit("pages/index.liquid", "<main>\n<h1>Theirs</h1>\n</main>\n");
  const io = sink();
  const r = await pull({ client: server, siteId: SITE, dir, log: io.log });
  assert.deepEqual(r.conflicts, ["pages/index.liquid"]);
  assert.match(read(dir, "pages/index.liquid"), /Mine/);
  assert.match(read(dir, ".pagehub/theirs/pages/index.liquid"), /Theirs/);
  assert.match(read(dir, ".pagehub/base/pages/index.liquid"), /Hello/);
  assert.match(io.text(), /git merge-file pages\/index\.liquid \.pagehub\/base\/pages\/index\.liquid \.pagehub\/theirs\/pages\/index\.liquid/);
  assert.equal(readState(dir)!.files["pages/index.liquid"]!.version, hashText(FILES["pages/index.liquid"]), "still based on the old version");
});

test("pull --rebase keeps your file and bases it on the server's version, so push goes through", async () => {
  const { dir, server } = await pulled();
  writeFileSync(join(dir, "pages/index.liquid"), "<main>\n<h1>Merged</h1>\n</main>\n");
  server.edit("pages/index.liquid", "<main>\n<h1>Theirs</h1>\n</main>\n");
  const io = sink();
  const r = await pull({ client: server, siteId: SITE, dir, rebase: true, log: io.log });
  assert.deepEqual(r.conflicts, []);
  assert.match(read(dir, "pages/index.liquid"), /Merged/);
  const pushed = await push({ client: server, dir, log: io.log, error: io.error });
  assert.equal(pushed.exitCode, 0, io.text());
  assert.match(server.files.get("pages/index.liquid")!, /Merged/);
});

test("pull --force takes the server's text and discards local edits", async () => {
  const { dir, server } = await pulled();
  writeFileSync(join(dir, "pages/index.liquid"), "mine");
  writeFileSync(join(dir, "theme.css"), "also mine");
  rmSync(join(dir, "partials/header.liquid"));
  server.edit("pages/index.liquid", "<main>theirs</main>\n");
  const io = sink();
  await pull({ client: server, siteId: SITE, dir, force: true, log: io.log });
  assert.equal(read(dir, "pages/index.liquid"), "<main>theirs</main>\n");
  assert.equal(read(dir, "theme.css"), FILES["theme.css"]);
  assert.equal(read(dir, "partials/header.liquid"), FILES["partials/header.liquid"]);
});

test("a first pull into a folder that already has a different file is a conflict, not an overwrite", async () => {
  const dir = tempDir();
  writeFiles(dir, { "theme.css": "local only" });
  const io = sink();
  const r = await pull({ client: served(), siteId: SITE, dir, log: io.log });
  assert.deepEqual(r.conflicts, ["theme.css"]);
  assert.equal(read(dir, "theme.css"), "local only");
  assert.ok(existsSync(join(dir, "pages/index.liquid")));
});

test("pull removes a file the server deleted when you did not touch it, and keeps it when you did", async () => {
  const { dir, server } = await pulled();
  server.files.delete("partials/header.liquid");
  server.files.delete("theme.css");
  server.version++;
  writeFileSync(join(dir, "theme.css"), "edited");
  const io = sink();
  const r = await pull({ client: server, siteId: SITE, dir, log: io.log });
  assert.deepEqual(r.removed, ["partials/header.liquid"]);
  assert.deepEqual(r.conflicts, ["theme.css"]);
  assert.ok(!existsSync(join(dir, "partials/header.liquid")));
  assert.match(io.text(), /theme\.css {2}changed here and deleted on the server/);
});

test("push sends edited, added and deleted files as ONE batch with each file's base version", async () => {
  const { dir, server } = await pulled();
  writeFileSync(join(dir, "pages/index.liquid"), "<main>\n<h1>New headline</h1>\n</main>\n");
  writeFiles(dir, { "partials/footer.liquid": "<footer>F</footer>\n" });
  rmSync(join(dir, "theme.css"));
  const io = sink();
  const r = await push({ client: server, dir, log: io.log, error: io.error });
  assert.equal(r.exitCode, 0, io.text());
  assert.equal(server.saves.length, 1);
  const [save] = server.saves;
  assert.deepEqual(save!.changes.map((c) => c.path).sort(), ["pages/index.liquid", "partials/footer.liquid", "theme.css"]);
  assert.equal(save!.baseVersions["pages/index.liquid"], hashText(FILES["pages/index.liquid"]));
  assert.equal(save!.baseVersions["partials/footer.liquid"], null);
  assert.equal(save!.baseVersions["theme.css"], hashText(FILES["theme.css"]));
  assert.match(server.files.get("pages/index.liquid")!, /New headline/);
  assert.ok(!server.files.has("theme.css"));
  assert.match(io.text(), /Staged in the draft, not live\. Preview: http:\/\/fake\.test\/view\/site1/);
  const again = sink();
  await push({ client: server, dir, log: again.log, error: again.error });
  assert.match(again.text(), /Nothing to push/);
});

test("push with no changes sends nothing", async () => {
  const { dir, server } = await pulled();
  const io = sink();
  const r = await push({ client: server, dir, log: io.log, error: io.error });
  assert.equal(r.exitCode, 0);
  assert.equal(server.saves.length, 0);
});

test("push refuses when the server moved on, writes nothing, and names the files, the lines and the merge command", async () => {
  const { dir, server } = await pulled();
  writeFileSync(join(dir, "pages/index.liquid"), "<main>\n<h1>Mine</h1>\n<p>a</p>\n</main>\n");
  writeFileSync(join(dir, "theme.css"), ":root { --p: green; }\n");
  server.edit("pages/index.liquid", "<main>\n<h1>Theirs</h1>\n</main>\n");
  const io = sink();
  const r = await push({ client: server, dir, log: io.log, error: io.error });
  assert.equal(r.exitCode, 1);
  assert.equal(server.saves.length, 0, "nothing was sent");
  assert.match(io.text(), /version conflict: 1 file changed on the server since you pulled/);
  assert.match(io.text(), /pages\/index\.liquid {2}server: v[0-9a-f]{8} \(\+1 -1 lines since your pull/);
  assert.match(io.text(), /git merge-file pages\/index\.liquid/);
  assert.match(io.text(), /Nothing was pushed/);
  assert.match(read(dir, ".pagehub/theirs/pages/index.liquid"), /Theirs/);
});

test("a race the pre-check could not see (409 from the batch) is reported the same way", async () => {
  const { dir, server } = await pulled();
  writeFileSync(join(dir, "pages/index.liquid"), "<main>mine</main>\n");
  const real = server.listFiles.bind(server);
  server.listFiles = async () => {
    const listing = await real();
    server.edit("pages/index.liquid", "<main>raced</main>\n"); // lands after the listing, before the write
    return listing;
  };
  const io = sink();
  const r = await push({ client: server, dir, log: io.log, error: io.error });
  assert.equal(r.exitCode, 1);
  assert.match(io.text(), /version conflict/);
  assert.match(io.text(), /pages\/index\.liquid/);
});

test("a lint refusal prints file:line:col so an editor can jump to it, and the state stays at the old version", async () => {
  const { dir, server } = await pulled();
  writeFileSync(join(dir, "pages/about.liquid"), `<main>\n  <h1>About</h1>\n  <p>${BAD}</p>\n</main>\n`);
  const io = sink();
  const r = await push({ client: server, dir, log: io.log, error: io.error });
  assert.equal(r.exitCode, 1);
  assert.match(io.err.join("\n"), /^pages\/about\.liquid:3:6 {2}unknown-tag {2}Unknown tag `bad`/m);
  assert.match(io.text(), /Nothing was pushed/);
  assert.equal(readState(dir)!.files["pages/about.liquid"]!.version, hashText(FILES["pages/about.liquid"]));
});

test("a lock refusal names the file", async () => {
  const { dir, server } = await pulled();
  writeFileSync(join(dir, "partials/header.liquid"), "<header data-edit-lock-broken></header>\n");
  const io = sink();
  const r = await push({ client: server, dir, log: io.log, error: io.error });
  assert.equal(r.exitCode, 1);
  assert.match(io.err.join("\n"), /partials\/header\.liquid {2}refused \(403\): partials\/header\.liquid: removes a locked element/);
});

test("--dry-run sends nothing, prints the plan and runs the local lint", async () => {
  const { dir, server } = await pulled();
  writeFileSync(join(dir, "pages/index.liquid"), "<main>\n<h1>Changed</h1>\n<p>extra</p>\n</main>\n");
  writeFiles(dir, { "pages/contact.liquid": "<main><h1>Contact</h1></main>\n" });
  const io = sink();
  const r = await push({ client: server, dir, dryRun: true, log: io.log, error: io.error });
  assert.equal(r.exitCode, 0, io.text());
  assert.equal(server.saves.length, 0);
  assert.match(io.text(), /edit {4}pages\/index\.liquid {2}\(\+2 -1 lines\)/);
  assert.match(io.text(), /page {4}pages\/contact\.liquid {2}→ \/contact {2}"Contact"/);
  assert.match(io.text(), /local lint: clean/);

  writeFileSync(join(dir, "partials/header.liquid"), "<header>{% if %}</header>\n");
  const bad = sink();
  const failed = await push({ client: server, dir, dryRun: true, log: bad.log, error: bad.error });
  assert.equal(failed.exitCode, 1);
  assert.match(bad.err.join("\n"), /^partials\/header\.liquid:1:\d+ {2}\S+ {2}/m);
});

test("a new pages/*.liquid file creates its page in the same write; a deleted page file deletes the page", async () => {
  const { dir, server } = await pulled();
  writeFiles(dir, { "pages/shop/[handle].liquid": "<main>{{ request.params.handle }}</main>\n", "pages/contact.liquid": "<main><h1>Contact</h1></main>\n" });
  rmSync(join(dir, "pages/about.liquid"));
  const io = sink();
  const r = await push({ client: server, dir, log: io.log, error: io.error });
  assert.equal(r.exitCode, 0, io.text());
  assert.equal(server.saves.length, 1);
  assert.deepEqual(server.saves[0]!.pages.map((p) => p.path).sort(), ["pages/contact.liquid", "pages/shop/[handle].liquid"]);
  assert.equal(server.saves[0]!.pages.find((p) => p.path === "pages/contact.liquid")!.name, "Contact");
  assert.deepEqual(r.pagesCreated.sort(), ["pages/contact.liquid → /contact", "pages/shop/[handle].liquid → /shop/:handle"]);
  assert.deepEqual(server.deletedPages, ["about"]);
  assert.ok(!server.files.has("pages/about.liquid"));
  const state = readState(dir)!;
  assert.equal(state.pages.length, 3);
  assert.ok(!("pages/about.liquid" in state.files));
});

test("a server that can't create pages from files is refused before anything is sent", async () => {
  const { dir, server } = await pulled();
  server.bulk = false;
  writeFiles(dir, { "pages/contact.liquid": "<main>c</main>\n", "theme.css": "changed" });
  const io = sink();
  const r = await push({ client: server, dir, log: io.log, error: io.error });
  assert.equal(r.exitCode, 1);
  assert.equal(server.saves.length, 0);
  assert.match(io.err.join("\n"), /can't create pages from files yet/);
});

test("the home page file can't be deleted, and a second index is refused, before anything is sent", async () => {
  const { dir, server } = await pulled();
  rmSync(join(dir, "pages/index.liquid"));
  writeFiles(dir, { "pages/[x].liquid": "<main/>\n" });
  const io = sink();
  const r = await push({ client: server, dir, log: io.log, error: io.error });
  assert.equal(r.exitCode, 1);
  assert.equal(server.saves.length, 0);
  assert.match(io.err.join("\n"), /home page can't be deleted/);
  assert.match(io.err.join("\n"), /a page needs a fixed first segment/);
});

test("a file the server tidies on save is read back so the folder matches the site", async () => {
  const { dir, server } = await pulled();
  server.normalize = (t) => t.replace(/[ \t]+$/gm, "");
  writeFileSync(join(dir, "theme.css"), ":root { --p: pink; }   \n");
  const io = sink();
  const r = await push({ client: server, dir, log: io.log, error: io.error });
  assert.equal(r.exitCode, 0, io.text());
  assert.equal(read(dir, "theme.css"), ":root { --p: pink; }\n");
  assert.match(io.text(), /the server tidied 1 file on save/);
  const s = sink();
  const st = await status({ client: server, dir, log: s.log });
  assert.equal(st.local.modified.length, 0);
  assert.match(s.text(), /Up to date/);
});

test("status lists local, remote and both-sided changes and misnamed files", async () => {
  const { dir, server } = await pulled();
  writeFileSync(join(dir, "theme.css"), "local");
  writeFiles(dir, { "partials/new.liquid": "n", "pages/Bad Name.liquid": "x" });
  server.edit("pages/about.liquid", "<main>remote</main>\n");
  server.edit("site.json", "{}\n");
  writeFileSync(join(dir, "site.json"), '{ "name": "mine" }\n');
  const io = sink();
  const cmp = await status({ client: server, dir, log: io.log });
  assert.deepEqual(cmp.local.modified.sort(), ["site.json", "theme.css"]);
  assert.deepEqual(cmp.local.added, ["partials/new.liquid"]);
  assert.deepEqual(cmp.remote.modified.sort(), ["pages/about.liquid", "site.json"]);
  assert.deepEqual(cmp.conflicts, ["site.json"]);
  assert.match(io.text(), /M {2}theme\.css/);
  assert.match(io.text(), /A {2}partials\/new\.liquid/);
  assert.match(io.text(), /! {2}site\.json/);
  assert.match(io.text(), /\? {2}pages\/Bad Name\.liquid/);
});

test("edits both sides made to the same text are not a conflict", async () => {
  const { dir, server } = await pulled();
  writeFileSync(join(dir, "theme.css"), "same\n");
  server.edit("theme.css", "same\n");
  const io = sink();
  const r = await push({ client: server, dir, log: io.log, error: io.error });
  assert.equal(r.exitCode, 0);
  assert.equal(server.saves.length, 0);
  assert.equal(readState(dir)!.files["theme.css"]!.version, hashText("same\n"));
});

test("push needs a pulled folder", async () => {
  await assert.rejects(push({ client: served(), dir: tempDir(), log: () => {}, error: () => {} }), /isn't a pulled site/);
});

test("a big push is split into requests under the body cap, and each lands", async () => {
  const { dir, server } = await pulled();
  const big = "x".repeat(900_000) + "\n";
  writeFiles(dir, Object.fromEntries([1, 2, 3, 4, 5].map((i) => [`assets/big${i}.js`, big])));
  const io = sink();
  const r = await push({ client: server, dir, log: io.log, error: io.error });
  assert.equal(r.exitCode, 0, io.text());
  assert.ok(server.saves.length >= 2);
  assert.equal(server.saves.reduce((n, s) => n + s.changes.length, 0), 5);
  assert.match(io.text(), /won't fit one request/);
});

test("safeAt / writeAt refuse a path that leaves the folder or runs through a symlink", () => {
  const dir = tempDir();
  const outside = tempDir("cli-outside-");
  assert.throws(() => safeAt(dir, "../escape.txt"), /outside the folder/);
  assert.throws(() => safeAt(dir, "/etc/passwd"), /outside the folder/);
  assert.throws(() => writeAt(dir, "pages/../../escape.liquid", "x"), /outside the folder/);
  symlinkSync(outside, join(dir, "pages"));
  assert.throws(() => writeAt(dir, "pages/a.liquid", "x"), /symlink/);
  assert.ok(!existsSync(join(outside, "a.liquid")));
  writeAt(dir, "theme.css", "ok");
  assert.equal(read(dir, "theme.css"), "ok");
});

test("a symlinked site file is not followed by the walk, so push cannot upload its target", () => {
  const dir = tempDir();
  const secret = join(tempDir("cli-secret-"), "credentials");
  writeFileSync(secret, "aws_secret_access_key=hunter2");
  mkdirSync(join(dir, "pages"));
  symlinkSync(secret, join(dir, "pages/stolen.liquid"));
  symlinkSync(secret, join(dir, "theme.css"));
  writeFileSync(join(dir, "site.json"), "{}");
  assert.deepEqual(walkLocal(dir).files, ["site.json"]);
});
