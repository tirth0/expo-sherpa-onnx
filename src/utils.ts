import ExpoSherpaOnnxModule from './ExpoSherpaOnnxModule';
import type { ModelPathConfig } from './ExpoSherpaOnnx.types';

export function assetModelPath(path: string): ModelPathConfig {
  return { type: 'asset', path };
}

export function fileModelPath(path: string): ModelPathConfig {
  return { type: 'file', path };
}

export function autoModelPath(path: string): ModelPathConfig {
  return { type: 'auto', path };
}

export function resolveModelPath(config: ModelPathConfig): Promise<string> {
  return ExpoSherpaOnnxModule.resolveModelPath(config);
}

export function listModelsAtPath(
  path: string,
  recursive = false
): Promise<string[]> {
  return ExpoSherpaOnnxModule.listModelsAtPath(path, recursive);
}
