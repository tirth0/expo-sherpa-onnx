import { requireNativeView } from 'expo';
import * as React from 'react';

import { ExpoSherpaOnnxViewProps } from './ExpoSherpaOnnx.types';

const NativeView: React.ComponentType<ExpoSherpaOnnxViewProps> =
  requireNativeView('ExpoSherpaOnnx');

export default function ExpoSherpaOnnxView(props: ExpoSherpaOnnxViewProps) {
  return <NativeView {...props} />;
}
