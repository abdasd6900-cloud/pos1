import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key';

if (!process.env.EXPO_PUBLIC_SUPABASE_URL || !process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY) {
  console.warn('Supabase configuration is missing — app will run in offline mode');
}

const isWeb = Platform.OS === 'web';
const isServer = isWeb && typeof window === 'undefined';

class NoopRealtimeTransport {
  constructor(_address?: string | URL, _subprotocols?: string | string[]) {}
  send() { return Promise.resolve(); }
  close() {}
  open() {}
  onopen: ((ev: Event) => void) | null = null;
  onclose: ((ev: CloseEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  readyState = 1;
  url = '';
  protocol = '';
  extensions = '';
  binaryType: 'blob' | 'arraybuffer' = 'blob';
  bufferedAmount = 0;
  CONNECTING = 0;
  OPEN = 1;
  CLOSING = 2;
  CLOSED = 3;
}

const silentFetch: typeof fetch = async (input, init) => {
  try {
    const res = await fetch(input, init);
    if (res.status >= 500) {
      return new Response(JSON.stringify({ error: { message: 'Server error' } }), {
        status: 0,
        headers: { 'Content-Type': 'application/json' },
      }) as unknown as Response;
    }
    return res;
  } catch {
    return new Response(JSON.stringify({ error: { message: 'Network request failed' } }), {
      status: 0,
      headers: { 'Content-Type': 'application/json' },
    }) as unknown as Response;
  }
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: !isServer, autoRefreshToken: !isServer, detectSessionInUrl: false },
  fetch: silentFetch,
  realtime: (isServer || isWeb)
    ? { transport: NoopRealtimeTransport as unknown as import('@supabase/supabase-js').WebSocketLikeConstructor }
    : undefined,
});

if (isServer) {
  const noopChannel = {
    on: () => noopChannel,
    subscribe: (cb?: (status: string) => void) => {
      if (cb) cb('SUBSCRIBED');
      return noopChannel;
    },
    unsubscribe: () => Promise.resolve(noopChannel),
    send: () => 'ok' as const,
    close: () => {},
  };

  const rt = (supabase as unknown as { realtime?: { connect: () => void; disconnect: () => void } }).realtime;
  if (rt) {
    rt.connect = () => {};
    rt.disconnect = () => {};
  }

  supabase.channel = (() => noopChannel) as unknown as typeof supabase.channel;
  supabase.removeChannel = (() => undefined) as unknown as typeof supabase.removeChannel;
  supabase.getChannels = (() => []) as unknown as typeof supabase.getChannels;
} else if (isWeb) {
  const noopChannel = {
    on: () => noopChannel,
    subscribe: (cb?: (status: string) => void) => {
      if (cb) cb('SUBSCRIBED');
      return noopChannel;
    },
    unsubscribe: () => Promise.resolve(noopChannel),
    send: () => 'ok' as const,
    close: () => {},
  };

  const rt = (supabase as unknown as { realtime?: { connect: () => void; disconnect: () => void } }).realtime;
  if (rt) {
    rt.connect = () => {};
    rt.disconnect = () => {};
  }

  supabase.channel = (() => noopChannel) as unknown as typeof supabase.channel;
  supabase.removeChannel = (() => undefined) as unknown as typeof supabase.removeChannel;
  supabase.getChannels = (() => []) as unknown as typeof supabase.getChannels;
}
