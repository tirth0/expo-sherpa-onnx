import { registerWebModule, NativeModule } from 'expo';

import { ExpoSherpaOnnxModuleEvents } from './ExpoSherpaOnnx.types';

class ExpoSherpaOnnxModule extends NativeModule<ExpoSherpaOnnxModuleEvents> {
  PI = Math.PI;
  async setValueAsync(value: string): Promise<void> {
    this.emit('onChange', { value });
  }
  hello() {
    return 'Hello world! 👋';
  }
}

export default registerWebModule(ExpoSherpaOnnxModule, 'ExpoSherpaOnnxModule');
