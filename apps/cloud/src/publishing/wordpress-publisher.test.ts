import assert from "node:assert/strict";
import test from "node:test";
import { pinnedWordPressLookup } from "./wordpress-publisher.js";

test("pinned WordPress lookup supports Node all-address DNS callbacks", async () => {
  const lookup = pinnedWordPressLookup({ address: "203.0.113.10", family: 4 });
  const result = await new Promise<{ address: string; family: number }[]>((resolve, reject) => {
    lookup("example.com", { all: true }, (error, address) => {
      if (error) return reject(error);
      if (!Array.isArray(address)) return reject(new Error("Expected an address array"));
      resolve(address);
    });
  });

  assert.deepEqual(result, [{ address: "203.0.113.10", family: 4 }]);
});

test("pinned WordPress lookup supports single-address DNS callbacks", async () => {
  const lookup = pinnedWordPressLookup({ address: "2001:db8::10", family: 6 });
  const result = await new Promise<{ address: string; family: number }>((resolve, reject) => {
    lookup("example.com", {}, (error, address, family) => {
      if (error) return reject(error);
      if (Array.isArray(address)) return reject(new Error("Expected a single address"));
      resolve({ address, family: Number(family) });
    });
  });

  assert.deepEqual(result, { address: "2001:db8::10", family: 6 });
});
