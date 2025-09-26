import superjson from "superjson";
type Awaited<T> = T extends Promise<infer U> ? Awaited<U> : T;
type Promisified<T> = Promise<Awaited<T>>;

export function wrapToPromise<T>(value: T) {
  if (!value || typeof (value as any).then !== "function") {
    return Promise.resolve(value) as Promisified<T>;
  }
  return value as unknown as Promisified<T>;
}

export function asyncCall<T extends (...arguments_: any) => any>(
  function_: T,
  ...arguments_: any[]
): Promisified<ReturnType<T>> {
  try {
    return wrapToPromise(function_(...arguments_));
  } catch (error) {
    return Promise.reject(error);
  }
}

export function syncCall<T extends (...arguments_: any) => any>(
  function_: T | undefined,
  ...arguments_: any[]
): ReturnType<T> {
  if (!function_) {
    throw new Error("Synchronous operation not supported by this driver");
  }
  const result = function_(...arguments_);
  if (result && typeof result.then === "function") {
    throw new Error(
      "Driver returned Promise from sync method - sync operation not supported"
    );
  }
  return result;
}

function isPrimitive(value: any) {
  const type = typeof value;
  return value === null || (type !== "object" && type !== "function");
}

function isPureObject(value: any) {
  const proto = Object.getPrototypeOf(value);
  // eslint-disable-next-line no-prototype-builtins
  return !proto || proto.isPrototypeOf(Object);
}

export function stringify(value: any): string {
  // Support all superjson-compatible types: primitives, objects, arrays,
  // undefined, bigint, Date, RegExp, Set, Map, Error, URL
  if (
    isPrimitive(value) ||
    isPureObject(value) ||
    Array.isArray(value) ||
    value instanceof Date ||
    value instanceof RegExp ||
    value instanceof Set ||
    value instanceof Map ||
    value instanceof Error ||
    value instanceof URL ||
    value === undefined ||
    typeof value === "bigint"
  ) {
    return superjson.stringify(value);
  }

  if (typeof value.toJSON === "function") {
    return stringify(value.toJSON());
  }

  throw new Error("[electron-async-storage] Cannot stringify value!");
}

export function safeSuperjsonParse(value: any): any {
  if (typeof value !== "string") {
    return value;
  }

  if (value === "" || value === "{}") {
    return null;
  }

  try {
    return superjson.parse(value);
  } catch {
    return null;
  }
}

export const BASE64_PREFIX = "base64:";

export function serializeRaw(value: any) {
  if (typeof value === "string") {
    return value;
  }
  return BASE64_PREFIX + base64Encode(value);
}

export function deserializeRaw(value: any) {
  if (typeof value !== "string") {
    // Return non-strings as-is
    return value;
  }
  if (!value.startsWith(BASE64_PREFIX)) {
    // Return unknown strings as-is
    return value;
  }
  return base64Decode(value.slice(BASE64_PREFIX.length));
}

function base64Decode(input: string) {
  if (globalThis.Buffer) {
    return Buffer.from(input, "base64");
  }
  return Uint8Array.from(
    globalThis.atob(input),
    (c) => c.codePointAt(0) as number
  );
}

function base64Encode(input: Uint8Array) {
  if (globalThis.Buffer) {
    return Buffer.from(input).toString("base64");
  }
  return globalThis.btoa(String.fromCodePoint(...input));
}
