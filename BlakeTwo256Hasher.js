const { blake2AsHex } = require('@polkadot/util-crypto');

const str = 'jason.tulp@centrality.ai';

console.log(blake2AsHex(str));
// 0x5eda1ba563856b8790540c4b7965bcacddc24f5b6b85f6d9199d22f659c81cb4