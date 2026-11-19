import assert from "node:assert/strict";
import { deflateSync, inflateSync } from "node:zlib";
import test from "node:test";
import { grayscalePng } from "../scripts/grayscale-png.mjs";

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++)
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data = Buffer.alloc(0)) {
  const body = Buffer.concat([Buffer.from(type), data]);
  const out = Buffer.alloc(data.length + 12);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), body.length + 4);
  return out;
}

function rgbPng(width, height, rows) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(Buffer.concat(rows))),
    chunk("IEND"),
  ]);
}

test("converts browser RGB PNG pixels to 8-bit grayscale and retains dimensions", () => {
  const input = rgbPng(2, 1, [Buffer.from([0, 0, 0, 0, 255, 0, 0])]);
  const output = grayscalePng(input);
  assert.equal(output.readUInt32BE(16), 2);
  assert.equal(output.readUInt32BE(20), 1);
  assert.equal(output[24], 8);
  assert.equal(output[25], 0);

  const idat = [];
  for (let offset = 8; offset < output.length; ) {
    const length = output.readUInt32BE(offset);
    const type = output.toString("ascii", offset + 4, offset + 8);
    if (type === "IDAT")
      idat.push(output.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }
  assert.deepEqual([...inflateSync(Buffer.concat(idat))], [0, 0, 54]);
});

test("rejects unsupported PNG formats rather than publishing incompatible data", () => {
  assert.throws(() => grayscalePng(Buffer.from("not a PNG")), /not a PNG/);
});
