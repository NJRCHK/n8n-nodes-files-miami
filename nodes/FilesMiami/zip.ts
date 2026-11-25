// Reads the stored (uncompressed) ZIP that the images endpoint returns, so the
// node needs no runtime dependencies. Compressed or ZIP64 archives are rejected.
export function readStoredZip(zip: Buffer): Map<string, Buffer> {
	let end = -1;
	for (let i = zip.length - 22; i >= Math.max(0, zip.length - 22 - 65535); i--) {
		if (zip.readUInt32LE(i) === 0x06054b50) {
			end = i;
			break;
		}
	}
	if (end < 0) throw new Error('The response is not a ZIP archive');
	const count = zip.readUInt16LE(end + 10);
	let offset = zip.readUInt32LE(end + 16);
	if (count === 0xffff || offset === 0xffffffff)
		throw new Error('ZIP64 archives are not supported');

	const entries = new Map<string, Buffer>();
	for (let n = 0; n < count; n++) {
		if (zip.readUInt32LE(offset) !== 0x02014b50) throw new Error('Corrupt ZIP central directory');
		const method = zip.readUInt16LE(offset + 10);
		const size = zip.readUInt32LE(offset + 20);
		const nameLength = zip.readUInt16LE(offset + 28);
		const extraLength = zip.readUInt16LE(offset + 30);
		const commentLength = zip.readUInt16LE(offset + 32);
		const local = zip.readUInt32LE(offset + 42);
		const name = zip.toString('utf8', offset + 46, offset + 46 + nameLength);
		if (method !== 0) throw new Error(`ZIP entry ${name} is compressed`);
		if (size === 0xffffffff || local === 0xffffffff)
			throw new Error('ZIP64 archives are not supported');
		if (zip.readUInt32LE(local) !== 0x04034b50) throw new Error(`Corrupt ZIP entry ${name}`);
		const data = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
		if (data + size > zip.length) throw new Error(`Truncated ZIP entry ${name}`);
		entries.set(name, zip.subarray(data, data + size));
		offset += 46 + nameLength + extraLength + commentLength;
	}
	return entries;
}
