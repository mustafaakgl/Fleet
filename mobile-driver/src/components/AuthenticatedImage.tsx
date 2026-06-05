import { useEffect, useState } from 'react';
import { Image, type ImageProps, type ImageStyle, type StyleProp } from 'react-native';
import { apiClient } from '@/api/client';

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  if (typeof globalThis.btoa === 'function') {
    return globalThis.btoa(binary);
  }
  throw new Error('btoa is not available');
}

type AuthenticatedImageProps = Omit<ImageProps, 'source'> & {
  apiPath: string;
  style?: StyleProp<ImageStyle>;
};

export function AuthenticatedImage({ apiPath, style, ...rest }: AuthenticatedImageProps) {
  const [uri, setUri] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    apiClient
      .get<ArrayBuffer>(apiPath, { responseType: 'arraybuffer' })
      .then((response) => {
        if (cancelled) return;
        const contentType =
          (response.headers['content-type'] as string | undefined)?.split(';')[0]?.trim() ??
          'image/jpeg';
        const base64 = arrayBufferToBase64(response.data);
        setUri(`data:${contentType};base64,${base64}`);
      })
      .catch(() => {
        if (!cancelled) setUri(null);
      });

    return () => {
      cancelled = true;
    };
  }, [apiPath]);

  if (!uri) {
    return null;
  }

  return <Image {...rest} source={{ uri }} style={style} />;
}
