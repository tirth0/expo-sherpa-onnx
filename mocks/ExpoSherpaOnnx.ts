export function getVersion(): string {
  return '1.0.0';
}

export function getGitSha1(): string {
  return 'mock-sha1-abc123';
}

export function getGitDate(): string {
  return '2025-01-01';
}

export function getVersionInfo() {
  return {
    version: getVersion(),
    gitSha1: getGitSha1(),
    gitDate: getGitDate(),
  };
}
