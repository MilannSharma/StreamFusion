// Type shim for mdns-js — no @types/mdns-js package exists.
// This minimal declaration covers the subset of the API used by DeviceScanner.ts.

declare module 'mdns-js' {
  import { EventEmitter } from 'events';

  interface ServiceData {
    addresses?: string[];
    port?: number;
    host?: string;
    fullname?: string;
    txt?: string[];
    type?: Array<{ name: string; protocol: string }>;
  }

  interface Browser extends EventEmitter {
    discover(): void;
    start(): void;
    stop(): void;
    on(event: 'ready', listener: () => void): this;
    on(event: 'update', listener: (data: ServiceData) => void): this;
    on(event: 'error', listener: (err: Error) => void): this;
    on(event: string, listener: (...args: unknown[]) => void): this;
  }

  interface ServiceType {
    name: string;
    protocol: string;
  }

  function createBrowser(serviceType: ServiceType): Browser;
  function tcp(name: string): ServiceType;
  function udp(name: string): ServiceType;
}
