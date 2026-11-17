import { deflateSync, inflateSync } from 'node:zlib';

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data = Buffer.alloc(0)) {
  const name = Buffer.from(type, 'ascii');
  const body = Buffer.concat([name, data]);
  const result = Buffer.alloc(data.length + 12);
  result.writeUInt32BE(data.length, 0);
  body.copy(result, 4);
  result.writeUInt32BE(crc32(body), body.length + 4);
  return result;
}

function paeth(left, above, upperLeft) {
  const estimate = left + above - upperLeft;
  const dl = Math.abs(estimate - left);
  const da = Math.abs(estimate - above);
  const dul = Math.abs(estimate - upperLeft);
  return dl <= da && dl <= dul ? left : da <= dul ? above : upperLeft;
}

export function grayscalePng(input) {
  const png = Buffer.from(input);
  if (!png.subarray(0, 8).equals(SIGNATURE)) throw new Error('Input is not a PNG.');

  let header;
  const compressed = [];
  for (let offset = 8; offset + 12 <= png.length;) {
    const length = png.readUInt32BE(offset);
    const type = png.toString('ascii', offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > png.length) throw new Error('Truncated PNG chunk.');
    if (type === 'IHDR') header = Buffer.from(png.subarray(dataStart, dataEnd));
    if (type === 'IDAT') compressed.push(png.subarray(dataStart, dataEnd));
    offset = dataEnd + 4;
    if (type === 'IEND') break;
  }
  if (!header || !compressed.length) throw new Error('PNG is missing IHDR or IDAT data.');

  const width = header.readUInt32BE(0);
  const height = header.readUInt32BE(4);
  const bitDepth = header[8];
  const colorType = header[9];
  const channels = colorType === 2 ? 3 : colorType === 6 ? 4 : 0;
  if (!width || !height || bitDepth !== 8 || !channels || header[12] !== 0) {
    throw new Error(`Unsupported PNG format (bit depth ${bitDepth}, color type ${colorType}, interlace ${header[12]}).`);
  }

  const stride = width * channels;
  const decoded = inflateSync(Buffer.concat(compressed));
  if (decoded.length !== height * (stride + 1)) throw new Error('PNG pixel data has an unexpected length.');

  const rows = Buffer.alloc(height * (width + 1));
  let previous = Buffer.alloc(stride);
  let sourceOffset = 0;
  let targetOffset = 0;
  for (let y = 0; y < height; y++) {
    const filter = decoded[sourceOffset++];
    const current = Buffer.from(decoded.subarray(sourceOffset, sourceOffset + stride));
    sourceOffset += stride;
    for (let i = 0; i < stride; i++) {
      const left = i >= channels ? current[i - channels] : 0;
      const above = previous[i];
      const upperLeft = i >= channels ? previous[i - channels] : 0;
      if (filter === 1) current[i] = (current[i] + left) & 255;
      else if (filter === 2) current[i] = (current[i] + above) & 255;
      else if (filter === 3) current[i] = (current[i] + Math.floor((left + above) / 2)) & 255;
      else if (filter === 4) current[i] = (current[i] + paeth(left, above, upperLeft)) & 255;
      else if (filter !== 0) throw new Error(`Unsupported PNG row filter ${filter}.`);
    }
    rows[targetOffset++] = 0;
    for (let x = 0; x < width; x++) {
      const pixel = x * channels;
      const alpha = channels === 4 ? current[pixel + 3] / 255 : 1;
      const luminance = 0.2126 * current[pixel] + 0.7152 * current[pixel + 1] + 0.0722 * current[pixel + 2];
      rows[targetOffset++] = Math.round(luminance * alpha + 255 * (1 - alpha));
    }
    previous = current;
  }

  const grayscaleHeader = Buffer.from(header);
  grayscaleHeader[9] = 0;
  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', grayscaleHeader),
    chunk('IDAT', deflateSync(rows, { level: 9 })),
    chunk('IEND'),
  ]);
}
