// StundTransfer: unit tests for the free space guard used while chunks are written.
// Run with: npm run test:stundtransfer
import { strict as assert } from "assert";
import * as os from "os";
import { describe, it } from "node:test";
import { FreeSpaceGuard, freeBytes } from "../../src/stundtransfer/freeSpace";

describe("FreeSpaceGuard", () => {
  it("refuses to write below the floor, counting what was written since the last measure", async () => {
    let measures = 0;
    const guard = new FreeSpaceGuard(async () => {
      measures++;
      return 1000;
    });
    assert.equal(await guard.take(300, 500), true);
    assert.equal(await guard.take(200, 500), true);
    // 500 left: one more byte would go below the floor
    assert.equal(await guard.take(1, 500), false);
    assert.equal(await guard.take(0, 500), true);
    assert.equal(measures, 1);
  });

  it("measures again after a while (space freed or used by something else)", async () => {
    let now = 0;
    let free = 1000;
    const guard = new FreeSpaceGuard(async () => free, 5000, () => now);
    assert.equal(await guard.take(600, 500), false);
    free = 5000;
    now = 4999;
    assert.equal(await guard.take(600, 500), false);
    now = 5000;
    assert.equal(await guard.take(600, 500), true);
    free = 100;
    now = 10000;
    assert.equal(await guard.take(0, 500), false);
  });

  it("lets chunks through while the free space cannot be measured", async () => {
    const guard = new FreeSpaceGuard(async () => {
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    });
    assert.equal(await guard.take(10 ** 12, 10 ** 9), true);
  });

  it("measures a real folder", async () => {
    assert.ok((await freeBytes(os.tmpdir())) > 0);
  });
});
