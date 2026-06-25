export function hexSlice(hex, byteStart, byteLen) {
  const raw = hex.replace(/^0x/, '');
  return raw.slice(byteStart * 2, (byteStart + byteLen) * 2);
}

export function intFromHex(hex, byteStart, byteLen) {
  return parseInt(hexSlice(hex, byteStart, byteLen), 16);
}

export function rollDie(finalRandom, byteStart = 0) {
  return (intFromHex(finalRandom, byteStart, 4) % 6) + 1;
}

export function mapRange(finalRandom, byteStart, byteLen, range) {
  return intFromHex(finalRandom, byteStart, byteLen) % range;
}
