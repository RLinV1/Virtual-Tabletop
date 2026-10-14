import sharp from "sharp";

function chunk(type: string, bytes: Buffer) {
  const data = Buffer.concat([Buffer.from(type, "ascii"), bytes]);
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  const result = Buffer.alloc(data.length + 8);
  result.writeUInt32BE(bytes.length, 0); data.copy(result, 4); result.writeUInt32BE((crc ^ 0xffffffff) >>> 0, result.length - 4);
  return result;
}

/** Complete two-frame APNG; some decoders report only its ordinary first frame. */
export async function animatedPng() {
  const png = await sharp({ create: { width: 2, height: 2, channels: 4, background: "red" } }).png().toBuffer();
  const animation = Buffer.alloc(8); animation.writeUInt32BE(2);
  const control = (seq: number) => {
    const frame = Buffer.alloc(26); frame.writeUInt32BE(seq); frame.writeUInt32BE(2, 4); frame.writeUInt32BE(2, 8);
    frame.writeUInt16BE(1, 20); frame.writeUInt16BE(10, 22); return chunk("fcTL", frame);
  };
  const idat: Buffer[] = [];
  for (let offset = 8; offset + 12 <= png.length;) {
    const length = png.readUInt32BE(offset), type = png.toString("ascii", offset + 4, offset + 8);
    if (type === "IDAT") idat.push(png.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }
  const pixels = Buffer.concat(idat), sequence = Buffer.alloc(4); sequence.writeUInt32BE(2);
  return Buffer.concat([png.subarray(0, 33), chunk("acTL", animation), control(0), chunk("IDAT", pixels), control(1), chunk("fdAT", Buffer.concat([sequence, pixels])), chunk("IEND", Buffer.alloc(0))]);
}

export async function animatedWebp() {
  return sharp(Buffer.concat([Buffer.alloc(12, 0x55), Buffer.alloc(12, 0xaa)]), { raw: { width: 2, height: 4, channels: 3, pageHeight: 2 } }).webp({ lossless: true, loop: 0, delay: [100, 100] }).toBuffer();
}
