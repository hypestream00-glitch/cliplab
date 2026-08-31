import { createReadStream, createWriteStream } from "node:fs";
import { stat, unlink } from "node:fs/promises";
import { crc32 } from "node:zlib";

function u16(value: number) {
  const buf = Buffer.alloc(2);
  buf.writeUInt16LE(value);
  return buf;
}

function u32(value: number) {
  const buf = Buffer.alloc(4);
  buf.writeUInt32LE(value >>> 0);
  return buf;
}

async function fileCrc32(filePath: string) {
  let hash = 0;
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => {
      hash = crc32(chunk, hash);
    });
    stream.on("error", reject);
    stream.on("end", () => resolve());
  });
  return hash >>> 0;
}

export async function writeStoreZip(params: {
  entries: Array<{ name: string; filePath: string }>;
  outputPath: string;
}) {
  const output = createWriteStream(params.outputPath);
  const centrals: Buffer[] = [];
  let offset = 0;

  const write = (buf: Buffer) =>
    new Promise<void>((resolve, reject) => {
      offset += buf.length;
      if (output.write(buf)) resolve();
      else output.once("drain", resolve);
      output.once("error", reject);
    });

  for (const entry of params.entries) {
    const info = await stat(entry.filePath);
    const name = Buffer.from(entry.name.replaceAll("\\", "/"), "utf8");
    const crc = await fileCrc32(entry.filePath);
    const localOffset = offset;
    await write(Buffer.concat([
      u32(0x04034b50),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(info.size),
      u32(info.size),
      u16(name.length),
      u16(0),
      name,
    ]));
    await new Promise<void>((resolve, reject) => {
      const stream = createReadStream(entry.filePath);
      stream.on("data", (chunk) => {
        offset += chunk.length;
        if (!output.write(chunk)) stream.pause();
      });
      output.on("drain", () => stream.resume());
      stream.on("error", reject);
      stream.on("end", resolve);
    });
    centrals.push(Buffer.concat([
      u32(0x02014b50),
      u16(20),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(info.size),
      u32(info.size),
      u16(name.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(localOffset),
      name,
    ]));
  }

  const centralStart = offset;
  for (const central of centrals) await write(central);
  await write(Buffer.concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(centrals.length),
    u16(centrals.length),
    u32(offset - centralStart),
    u32(centralStart),
    u16(0),
  ]));

  await new Promise<void>((resolve, reject) => {
    output.end(() => resolve());
    output.on("error", reject);
  });
}

export async function removeFile(path: string) {
  await unlink(path).catch(() => undefined);
}
