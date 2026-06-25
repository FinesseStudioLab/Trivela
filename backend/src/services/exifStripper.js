/**
 * Strip EXIF and other metadata from JPEG and PNG buffers before storage.
 * SVG and WebP are returned unchanged (SVG has no EXIF; WebP EXIF is uncommon).
 */

/**
 * @param {Buffer} buffer
 * @returns {Buffer}
 */
export function stripExifMetadata(buffer) {
  if (buffer.length < 4) return buffer;

  // PNG signature
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return stripPngMetadata(buffer);
  }

  // JPEG SOI marker
  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    return stripJpegExif(buffer);
  }

  return buffer;
}

/**
 * @param {Buffer} buffer
 * @returns {Buffer}
 */
function stripJpegExif(buffer) {
  const parts = [buffer.subarray(0, 2)];
  let offset = 2;

  while (offset < buffer.length) {
    if (buffer[offset] !== 0xff) break;

    const marker = buffer[offset + 1];
    if (marker === 0xd9 || marker === 0xda) {
      parts.push(buffer.subarray(offset));
      break;
    }

    const segmentLength = buffer.readUInt16BE(offset + 2);
    const isExifApp1 =
      marker === 0xe1 &&
      segmentLength >= 8 &&
      buffer.subarray(offset + 4, offset + 8).toString('ascii') === 'Exif';

    if (!isExifApp1) {
      parts.push(buffer.subarray(offset, offset + 2 + segmentLength));
    }

    offset += 2 + segmentLength;
  }

  return Buffer.concat(parts);
}

/** Metadata PNG chunks to remove (privacy). */
const PNG_METADATA_CHUNKS = new Set(['eXIf', 'tEXt', 'zTXt', 'iTXt', 'tIME']);

/**
 * @param {Buffer} buffer
 * @returns {Buffer}
 */
function stripPngMetadata(buffer) {
  const signature = buffer.subarray(0, 8);
  const chunks = [signature];
  let offset = 8;

  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString('ascii');
    const chunkEnd = offset + 12 + length;

    if (!PNG_METADATA_CHUNKS.has(type)) {
      chunks.push(buffer.subarray(offset, chunkEnd));
    }

    offset = chunkEnd;
  }

  return Buffer.concat(chunks);
}
