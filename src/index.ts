// Reexport the native module. On web, it will be resolved to ExpoSherpaOnnxModule.web.ts
// and on native platforms to ExpoSherpaOnnxModule.ts
export { default } from './ExpoSherpaOnnxModule';
export { default as ExpoSherpaOnnxView } from './ExpoSherpaOnnxView';
export * from  './ExpoSherpaOnnx.types';
