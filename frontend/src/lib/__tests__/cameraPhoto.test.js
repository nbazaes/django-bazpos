import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { prepareCameraPhoto } from "../cameraPhoto.js";

const originalBitmap = globalThis.createImageBitmap;
const originalDocument = globalThis.document;
afterEach(() => {
  if (originalBitmap === undefined) delete globalThis.createImageBitmap;
  else globalThis.createImageBitmap = originalBitmap;
  if (originalDocument === undefined) delete globalThis.document;
  else globalThis.document = originalDocument;
});

function jpeg(width, height = 3000) {
  return new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0, 4, 0, 0,
    0xff, 0xc0, 0, 17, 8, height >> 8, height & 255, width >> 8, width & 255, 3, 1, 0, 2, 0, 3, 0])], "camera.jpeg", { type: "image/jpeg", lastModified: 10 });
}

test("leaves small photos untouched without decoding them", async () => {
  globalThis.createImageBitmap = () => { throw new Error("Should not decode"); };
  const file = jpeg(1200);
  assert.equal(await prepareCameraPhoto(file), file);
});

test("leaves unsupported formats and browsers to the existing file validation", async () => {
  const file = jpeg(8000);
  delete globalThis.createImageBitmap;
  assert.equal(await prepareCameraPhoto(file), file);
  globalThis.createImageBitmap = () => { throw new Error("Should not decode"); };
  const unknown = new File(["data"], "camera.heic");
  assert.equal(await prepareCameraPhoto(unknown), unknown);
});

test("downsizes large camera photos before creating the preview or upload file", async () => {
  let closed = false;
  const bitmap = { width: 1600, height: 1200, close: () => { closed = true; } };
  const canvas = { getContext: () => ({ drawImage: (image) => assert.equal(image, bitmap) }),
    toBlob: (done, type, quality) => {
      assert.equal(type, "image/jpeg"); assert.equal(quality, 0.9);
      done(new Blob(["compressed"], { type }));
    } };
  globalThis.document = { createElement: (tag) => { assert.equal(tag, "canvas"); return canvas; } };
  globalThis.createImageBitmap = async (file, options) => {
    assert.equal(file.name, "camera.jpeg");
    assert.equal(options.resizeWidth, 1600);
    assert.equal(options.imageOrientation, "from-image");
    return bitmap;
  };
  const file = await prepareCameraPhoto(jpeg(8000));
  assert.equal(file.name, "camera.jpg");
  assert.equal(file.type, "image/jpeg");
  assert.equal(file.lastModified, 10);
  assert.equal(closed, true);
  assert.equal(canvas.width, 0);
  assert.equal(canvas.height, 0);
});

test("releases image memory even if canvas encoding fails", async () => {
  let closed = false;
  globalThis.createImageBitmap = async () => ({ width: 1600, height: 1200, close: () => { closed = true; } });
  globalThis.document = { createElement: () => ({ getContext: () => ({ drawImage: () => {} }), toBlob: (done) => done(null) }) };
  await assert.rejects(prepareCameraPhoto(jpeg(8000)), /No se pudo preparar/);
  assert.equal(closed, true);
});
