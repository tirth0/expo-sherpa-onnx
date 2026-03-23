const preset = require("expo-module-scripts/jest-preset");

function patchProject(project) {
  if (!project.transform) return project;
  const newTransform = {};
  for (const [pattern, transformer] of Object.entries(project.transform)) {
    if (Array.isArray(transformer) && transformer[0] === "ts-jest") {
      newTransform[pattern] = [
        "ts-jest",
        { ...transformer[1], diagnostics: false },
      ];
    } else {
      newTransform[pattern] = transformer;
    }
  }
  return { ...project, transform: newTransform };
}

const nativeOnly = preset.projects
  ? preset.projects
      .filter((p) => {
        const name =
          typeof p.displayName === "string"
            ? p.displayName
            : p.displayName?.name;
        return name === "iOS" || name === "Android";
      })
      .map(patchProject)
  : [];

module.exports = {
  ...preset,
  projects: nativeOnly,
};
