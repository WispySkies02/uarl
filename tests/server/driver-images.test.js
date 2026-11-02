import {test} from 'node:test';
import assert from 'node:assert/strict';
import {decodeDriverImage} from '../../netlify/functions/admin-publish.mjs';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64');
test('accepts a PNG and retains its bytes and media type',()=>{
  const image=decodeDriverImage('data:image/png;base64,'+png.toString('base64'));
  assert.equal(image.contentType,'image/png');assert.deepEqual(image.bytes,png);
});
test('rejects markup, mismatched image formats and invalid base64',()=>{
  for(const value of ['data:image/svg+xml;base64,PHN2Zz4=', 'data:image/webp;base64,'+png.toString('base64'),'data:image/png;base64,not-valid-base64',null])assert.throws(()=>decodeDriverImage(value));
});
test('rejects oversized payloads before decoding',()=>{
  assert.throws(()=>decodeDriverImage('data:image/png;base64,'+'A'.repeat(3*1024*1024)),/too large/);
});
