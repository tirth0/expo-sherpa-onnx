import { NativeModule, requireNativeModule } from 'expo';

import { ExpoSherpaOnnxModuleEvents } from './ExpoSherpaOnnx.types';

declare class ExpoSherpaOnnxModule extends NativeModule<ExpoSherpaOnnxModuleEvents> {
  PI: number;
  hello(): string;
  setValueAsync(value: string): Promise<void>;
}

// This call loads the native module object from the JSI.
export default requireNativeModule<ExpoSherpaOnnxModule>('ExpoSherpaOnnx');
