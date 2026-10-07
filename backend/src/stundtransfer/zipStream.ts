// StundTransfer: zip of a folder written while it is sent, whose exact size is
// known before the first byte. The browser then shows a normal progress bar
// (total, speed, time left) instead of an unknown size.
//
// Files are stored without compression (rushes are already compressed). The
// layout follows Go's archive/zip: a data descriptor after each file (its
// CRC is only known once it has been read), ZIP64 records only for entries or
// offsets beyond 4 GB. Every header has a fixed length, so the total size can
// be computed from the names and sizes alone. Pure module (no Nest), unit-tested.
import { createReadStream } from "fs";
import * as zlib from "zlib";

export type ZipEntry = {
  // Path inside the zip, with "/" (e.g. "Folder/Sub/clip.mp4")
  name: string;
  // File on disk
  path: string;
  size: number;
  mtime: Date;
};

export type ZipLimits = { max16: number; max32: number };
// Tests lower them to exercise the ZIP64 records with small files
const LIMITS: ZipLimits = { max16: 0xffff, max32: 0xffffffff };

const UTF8_AND_DESCRIPTOR = 0x0808;
const UNIX_FILE_MODE = 0o100644 << 16;
const READ_BLOCK_BYTES = 1024 * 1024;

function dos(date: Date) {
  const year = Math.min(2107, Math.max(1980, date.getFullYear()));
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

class Writer {
  private buffer: Buffer;
  private at = 0;
  constructor(length: number) {
    this.buffer = Buffer.alloc(length);
  }
  u16(value: number) {
    this.at = this.buffer.writeUInt16LE(value, this.at);
    return this;
  }
  u32(value: number) {
    this.at = this.buffer.writeUInt32LE(value >>> 0, this.at);
    return this;
  }
  u64(value: number) {
    this.at = this.buffer.writeBigUInt64LE(BigInt(value), this.at);
    return this;
  }
  bytes(value: Buffer) {
    value.copy(this.buffer, this.at);
    this.at += value.length;
    return this;
  }
  done() {
    if (this.at !== this.buffer.length) throw new Error("zip header length mismatch");
    return this.buffer;
  }
}

type Planned = ZipEntry & { nameBytes: Buffer; offset: number; zip64: boolean; crc: number };

/** Positions of every entry; the same plan is used to compute the size and to write. */
function plan(entries: ZipEntry[], limits: ZipLimits) {
  let offset = 0;
  const files: Planned[] = entries.map((entry) => {
    const nameBytes = Buffer.from(entry.name, "utf8");
    const zip64 = entry.size >= limits.max32;
    const planned = { ...entry, nameBytes, offset, zip64, crc: 0 };
    offset += 30 + nameBytes.length + entry.size + (zip64 ? 24 : 16);
    return planned;
  });
  const directoryOffset = offset;
  const directorySize = files.reduce(
    (sum, file) =>
      sum + 46 + file.nameBytes.length + (file.zip64 || file.offset >= limits.max32 ? 28 : 0),
    0,
  );
  const zip64End =
    files.length >= limits.max16 ||
    directorySize >= limits.max32 ||
    directoryOffset >= limits.max32;
  const size = directoryOffset + directorySize + (zip64End ? 76 : 0) + 22;
  return { files, directoryOffset, directorySize, zip64End, size };
}

function localHeader(file: Planned) {
  const { time, date } = dos(file.mtime);
  // CRC and sizes come after the data (data descriptor)
  return new Writer(30 + file.nameBytes.length)
    .u32(0x04034b50)
    .u16(20)
    .u16(UTF8_AND_DESCRIPTOR)
    .u16(0)
    .u16(time)
    .u16(date)
    .u32(0)
    .u32(0)
    .u32(0)
    .u16(file.nameBytes.length)
    .u16(0)
    .bytes(file.nameBytes)
    .done();
}

function dataDescriptor(file: Planned) {
  const writer = new Writer(file.zip64 ? 24 : 16).u32(0x08074b50).u32(file.crc);
  return (file.zip64 ? writer.u64(file.size).u64(file.size) : writer.u32(file.size).u32(file.size)).done();
}

function directoryHeader(file: Planned, limits: ZipLimits) {
  const { time, date } = dos(file.mtime);
  const extra = file.zip64 || file.offset >= limits.max32;
  const version = file.zip64 ? 45 : 20;
  const writer = new Writer(46 + file.nameBytes.length + (extra ? 28 : 0))
    .u32(0x02014b50)
    .u16((3 << 8) | version)
    .u16(version)
    .u16(UTF8_AND_DESCRIPTOR)
    .u16(0)
    .u16(time)
    .u16(date)
    .u32(file.crc)
    .u32(extra ? 0xffffffff : file.size)
    .u32(extra ? 0xffffffff : file.size)
    .u16(file.nameBytes.length)
    .u16(extra ? 28 : 0)
    .u16(0)
    .u16(0)
    .u16(0)
    .u32(UNIX_FILE_MODE)
    .u32(extra ? 0xffffffff : file.offset)
    .bytes(file.nameBytes);
  if (extra) writer.u16(0x0001).u16(24).u64(file.size).u64(file.size).u64(file.offset);
  return writer.done();
}

function endRecords(
  count: number,
  directoryOffset: number,
  directorySize: number,
  zip64End: boolean,
) {
  const parts: Buffer[] = [];
  if (zip64End) {
    parts.push(
      new Writer(56)
        .u32(0x06064b50)
        .u64(44)
        .u16((3 << 8) | 45)
        .u16(45)
        .u32(0)
        .u32(0)
        .u64(count)
        .u64(count)
        .u64(directorySize)
        .u64(directoryOffset)
        .done(),
      new Writer(20)
        .u32(0x07064b50)
        .u32(0)
        .u64(directoryOffset + directorySize)
        .u32(1)
        .done(),
    );
  }
  parts.push(
    new Writer(22)
      .u32(0x06054b50)
      .u16(0)
      .u16(0)
      .u16(zip64End ? 0xffff : count)
      .u16(zip64End ? 0xffff : count)
      .u32(zip64End ? 0xffffffff : directorySize)
      .u32(zip64End ? 0xffffffff : directoryOffset)
      .u16(0)
      .done(),
  );
  return parts;
}

/** A zip of `entries`: its exact size, and a function writing it to a stream. */
export function zipOf(entries: ZipEntry[], limits: ZipLimits = LIMITS) {
  const layout = plan(entries, limits);
  return {
    size: layout.size,
    /** Resolves once everything is written; rejects if a file changed or the stream closed. */
    async writeTo(out: NodeJS.WritableStream & { destroyed?: boolean }) {
      const write = (chunk: Buffer) =>
        new Promise<void>((resolve, reject) => {
          if (out.destroyed) return reject(new Error("download closed"));
          if (out.write(chunk)) return resolve();
          const onDrain = () => {
            out.off("close", onClose);
            resolve();
          };
          const onClose = () => {
            out.off("drain", onDrain);
            reject(new Error("download closed"));
          };
          out.once("drain", onDrain);
          out.once("close", onClose);
        });

      for (const file of layout.files) {
        await write(localHeader(file));
        let crc = 0;
        let read = 0;
        if (file.size > 0) {
          for await (const chunk of createReadStream(file.path, {
            start: 0,
            end: file.size - 1,
            highWaterMark: READ_BLOCK_BYTES,
          }) as AsyncIterable<Buffer>) {
            crc = zlib.crc32(chunk, crc);
            read += chunk.length;
            await write(chunk);
          }
        }
        // Shorter than when the size was announced: the zip would be broken
        if (read !== file.size) throw new Error(`"${file.name}" changed while it was sent`);
        file.crc = crc;
        await write(dataDescriptor(file));
      }
      for (const file of layout.files) await write(directoryHeader(file, limits));
      for (const part of endRecords(
        layout.files.length,
        layout.directoryOffset,
        layout.directorySize,
        layout.zip64End,
      ))
        await write(part);
      out.end();
    },
  };
}
