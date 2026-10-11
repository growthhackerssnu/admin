import { describe, expect, it } from "vitest";
import { compressedPath, fileKind, filePath, savedFilePaths } from "./files";

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
