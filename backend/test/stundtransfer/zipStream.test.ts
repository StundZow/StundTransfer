import * as assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { Writable } from "node:stream";
import { describe, test } from "node:test";
import * as zlib from "node:zlib";
import { ZipEntry, ZipLimits, zipOf } from "../../src/stundtransfer/zipStream";

/** Collects what is written, like an HTTP response. */
function collector() {
  const chunks: Buffer[] = [];
  const out = new Writable({
    highWaterMark: 64 * 1024,
    write(chunk, _encoding, callback) {
      chunks.push(Buffer.from(chunk));
      // A little later, to exercise the "drain" path
      setImmediate(callback);
    },
  });
  const finished = new Promise<Buffer>((resolve) => out.on("finish", () => resolve(Buffer.concat(chunks))));
  return { out, finished };
}

/** Minimal reader: end record (ZIP64 aware), central directory, then each file's data. */
function readZip(zip: Buffer) {
  const end = zip.length - 22;
  assert.equal(zip.readUInt32LE(end), 0x06054b50, "end of central directory");
  let count = zip.readUInt16LE(end + 10);
  let directoryOffset = zip.readUInt32LE(end + 16);
  if (count === 0xffff || directoryOffset === 0xffffffff) {
    const locator = end - 20;
    assert.equal(zip.readUInt32LE(locator), 0x07064b50, "zip64 locator");
    const record = Number(zip.readBigUInt64LE(locator + 8));
    assert.equal(zip.readUInt32LE(record), 0x06064b50, "zip64 end record");
    count = Number(zip.readBigUInt64LE(record + 32));
    directoryOffset = Number(zip.readBigUInt64LE(record + 48));
  }
  const files: { name: string; crc: number; data: Buffer }[] = [];
  let at = directoryOffset;
  for (let i = 0; i < count; i++) {
    assert.equal(zip.readUInt32LE(at), 0x02014b50, "central directory header");
    const crc = zip.readUInt32LE(at + 16);
    let size = zip.readUInt32LE(at + 24);
    const nameLength = zip.readUInt16LE(at + 28);
    const extraLength = zip.readUInt16LE(at + 30);
    let offset = zip.readUInt32LE(at + 42);
    const name = zip.subarray(at + 46, at + 46 + nameLength).toString("utf8");
    if (extraLength) {
      const extra = at + 46 + nameLength;
      assert.equal(zip.readUInt16LE(extra), 0x0001, "zip64 extra");
      size = Number(zip.readBigUInt64LE(extra + 4));
      offset = Number(zip.readBigUInt64LE(extra + 20));
    }
    assert.equal(zip.readUInt32LE(offset), 0x04034b50, `local header of ${name}`);
    const dataStart = offset + 30 + zip.readUInt16LE(offset + 26) + zip.readUInt16LE(offset + 28);
    const data = zip.subarray(dataStart, dataStart + size);
    assert.equal(zip.readUInt32LE(dataStart + size), 0x08074b50, `data descriptor of ${name}`);
    files.push({ name, crc, data });
    at += 46 + nameLength + extraLength;
  }
  return files;
}

async function sample() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "stund-zip-"));
  const contents: Record<string, Buffer> = {
    "a.txt": Buffer.from("hello"),
    "Dossier/é clip.mp4": randomBytes(300_000),
    "vide.txt": Buffer.alloc(0),
  };
  const entries: ZipEntry[] = [];
  for (const [name, data] of Object.entries(contents)) {
    const file = path.join(dir, name);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, data);
    entries.push({ name: `Rushs/${name}`, path: file, size: data.length, mtime: new Date(2026, 9, 7, 14, 30) });
  }
  return { dir, contents, entries };
}

describe("zipOf", () => {
  for (const [label, limits] of [
    ["regular", undefined],
    // Tiny limits: every ZIP64 record is written, as for files of more than 4 GB
    ["zip64", { max16: 2, max32: 1000 }],
  ] as [string, ZipLimits | undefined][]) {
    test(`writes exactly the announced size, readable back (${label})`, async () => {
      const { dir, contents, entries } = await sample();
      try {
        const zip = zipOf(entries, limits);
        const { out, finished } = collector();
        await zip.writeTo(out);
        const bytes = await finished;
        assert.equal(bytes.length, zip.size);
        const files = readZip(bytes);
        assert.deepEqual(
          files.map((file) => file.name),
          entries.map((entry) => entry.name),
        );
        for (const file of files) {
          const original = contents[file.name.slice("Rushs/".length)];
          assert.ok(file.data.equals(original), `content of ${file.name}`);
          assert.equal(file.crc, zlib.crc32(original), `crc of ${file.name}`);
        }
      } finally {
        await fs.rm(dir, { recursive: true, force: true });
      }
    });
  }

  test("fails instead of sending a broken zip when a file got shorter", async () => {
    const { dir, entries } = await sample();
    try {
      const zip = zipOf(entries);
      await fs.writeFile(entries[1].path, Buffer.from("shorter"));
      const { out } = collector();
      await assert.rejects(zip.writeTo(out), /changed while it was sent/);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  test("stops when the download is closed", async () => {
    const { dir, entries } = await sample();
    try {
      const zip = zipOf(entries);
      const { out } = collector();
      out.destroy();
      await assert.rejects(zip.writeTo(out), /download closed/);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});
