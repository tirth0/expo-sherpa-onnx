import * as React from 'react';

import { ExpoSherpaOnnxViewProps } from './ExpoSherpaOnnx.types';

export default function ExpoSherpaOnnxView(props: ExpoSherpaOnnxViewProps) {
  return (
    <div>
      <iframe
        style={{ flex: 1 }}
        src={props.url}
        onLoad={() => props.onLoad({ nativeEvent: { url: props.url } })}
      />
    </div>
  );
}
