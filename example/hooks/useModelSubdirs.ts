import { useState, useEffect } from 'react';
import { listModelsAtPath } from 'expo-sherpa-onnx';

export function useModelSubdirs(modelsDir: string) {
  const [subdirs, setSubdirs] = useState<string[]>([]);
  useEffect(() => {
    if (!modelsDir) return;
    listModelsAtPath(modelsDir, false)
      .then((items) => setSubdirs(items.filter((f) => !f.includes('.')).sort()))
      .catch(() => setSubdirs([]));
  }, [modelsDir]);
  return subdirs;
}
