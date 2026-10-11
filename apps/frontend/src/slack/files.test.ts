import { describe, expect, it } from "vitest";
import {
  compressedPath,
  compressExisting,
  fileKind,
  filePath,
  savedFilePaths,
} from "./files";
import { memoryFolder } from "./folder";
import type { Manifest } from "./types";

const photo = { id: "F1", name: "사진 1.JPG", mimetype: "image/jpeg" };
const gif = { id: "F2", name: "party.gif", mimetype: "image/gif" };
const video = { id: "F3", name: "clip.mov", mimetype: "video/quicktime" };
const pdf = { id: "F4", name: "a.pdf", mimetype: "application/pdf" };

describe("file kinds and paths", () => {
  it("sorts files into photos, videos and other files", () => {
    expect([photo, gif, video, pdf].map(fileKind)).toEqual([
      "photos",
      "photos",
      "videos",
      "files",
    ]);
  });
  it("gives compressible photos a .webp path and checks it first", () => {
    expect(filePath(photo)).toBe("files/F1/사진 1.JPG");
    expect(compressedPath(photo)).toBe("files/F1/사진 1.webp");
    expect(compressedPath(gif)).toBeNull();
    expect(savedFilePaths(photo)).toEqual([
      "files/F1/사진 1.webp",
      "files/F1/사진 1.JPG",
    ]);
    expect(savedFilePaths(pdf)).toEqual(["files/F4/a.pdf"]);
  });
});

describe("compressExisting", () => {
  it("replaces downloaded photos with smaller webp copies and leaves the rest", async () => {
    const folder = memoryFolder();
    const manifest = {
      conversations: { C1: { done: true, months: ["2026-10"] } },
    } as unknown as Manifest;
    await folder.write(
      "messages/C1/2026-10.json",
      JSON.stringify([
        {
          ts: "1",
          files: [photo, gif, pdf],
          replies: [{ ts: "2", files: [{ ...photo, id: "F5" }] }],
        },
      ]),
    );
    await folder.write("files/F1/사진 1.JPG", new Blob(["x".repeat(1000)]));
    await folder.write("files/F5/사진 1.JPG", new Blob(["y".repeat(500)]));
    await folder.write("files/F2/party.gif", new Blob(["gif"]));
    await folder.write("files/F4/a.pdf", new Blob(["pdf"]));

    const result = await compressExisting({
      folder,
      manifest,
      compress: async (blob) => new Blob(["w".repeat(blob.size / 10)]),
    });

    expect(result).toEqual({ count: 2, before: 1500, after: 150 });
    expect(folder.files.has("files/F1/사진 1.JPG")).toBe(false);
    expect(folder.files.has("files/F1/사진 1.webp")).toBe(true);
    expect(folder.files.has("files/F5/사진 1.webp")).toBe(true);
    expect(folder.files.has("files/F2/party.gif")).toBe(true);
    expect(folder.files.has("files/F4/a.pdf")).toBe(true);
  });

  it("keeps the original when compression does not help", async () => {
    const folder = memoryFolder();
    const manifest = {
      conversations: { C1: { done: true, months: ["2026-10"] } },
    } as unknown as Manifest;
    await folder.write(
      "messages/C1/2026-10.json",
      JSON.stringify([{ ts: "1", files: [photo] }]),
    );
    await folder.write("files/F1/사진 1.JPG", new Blob(["x"]));
    const result = await compressExisting({
      folder,
      manifest,
      compress: async () => null,
    });
    expect(result.count).toBe(0);
    expect(folder.files.has("files/F1/사진 1.JPG")).toBe(true);
  });
});
