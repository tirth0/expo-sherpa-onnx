/// <reference types="jest" />
import ExpoSherpaOnnx from "../ExpoSherpaOnnxModule";

describe("Build Verification", () => {
  it("native module is loaded", () => {
    expect(ExpoSherpaOnnx).toBeDefined();
  });

  it("getVersion returns a non-empty string", () => {
    const version = ExpoSherpaOnnx.getVersion();
    expect(typeof version).toBe("string");
    expect(version.length).toBeGreaterThan(0);
  });

  it("getVersion matches semver-like pattern", () => {
    const version = ExpoSherpaOnnx.getVersion();
    expect(version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("getGitSha1 returns a non-empty string", () => {
    const sha = ExpoSherpaOnnx.getGitSha1();
    expect(typeof sha).toBe("string");
    expect(sha.length).toBeGreaterThan(0);
  });

  it("getGitDate returns a non-empty string", () => {
    const date = ExpoSherpaOnnx.getGitDate();
    expect(typeof date).toBe("string");
    expect(date.length).toBeGreaterThan(0);
  });

  it("getVersionInfo returns an object with all fields", () => {
    const info = ExpoSherpaOnnx.getVersionInfo();
    expect(info).toBeDefined();
    expect(typeof info.version).toBe("string");
    expect(typeof info.gitSha1).toBe("string");
    expect(typeof info.gitDate).toBe("string");
    expect(info.version.length).toBeGreaterThan(0);
    expect(info.gitSha1.length).toBeGreaterThan(0);
    expect(info.gitDate.length).toBeGreaterThan(0);
  });

  it("getVersionInfo fields are consistent with individual getters", () => {
    const info = ExpoSherpaOnnx.getVersionInfo();
    expect(info.version).toBe(ExpoSherpaOnnx.getVersion());
    expect(info.gitSha1).toBe(ExpoSherpaOnnx.getGitSha1());
    expect(info.gitDate).toBe(ExpoSherpaOnnx.getGitDate());
  });
});
