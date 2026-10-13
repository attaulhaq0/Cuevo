import { isProxy } from 'node:util/types';
import { createResetDiagnosticParser } from './reset-local-diagnostic';

export type StartFailureStage = 'BEFORE_START_GUARD' | 'CLI_START_FAILURE' | 'POST_START_LOG_WRITE_FAILURE' | 'POST_START_CONFIRMATION_FAILURE';
const errorCodes = ['ENOENT', 'EACCES', 'EPERM', 'ENOBUFS', 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER'] as const;
const nativeSignals = ['SIGINT', 'SIGTERM', 'SIGKILL'] as const;
const maxCapturedBytes = 10 * 1024 * 1024;
const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype) as object;
const byteLength = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'byteLength')!.get!;
const byteOffset = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'byteOffset')!.get!;
const arrayBuffer = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'buffer')!.get!;
function data(error: unknown, key: string): unknown {
  try {
    if (!error || typeof error !== 'object' || isProxy(error)) return undefined;
    const descriptor = Object.getOwnPropertyDescriptor(error, key);
    return descriptor && Object.hasOwn(descriptor, 'value') ? descriptor.value : undefined;
  } catch { return undefined; }
}

/** Only already-captured native own data enters the finite reset parser.
 * Error messages, output arrays, stdout, getters and proxy traps are not read. */
export function startFailureDiagnostic(error: unknown, stage: StartFailureStage) {
  const parser = createResetDiagnosticParser();
  const status = stage === 'CLI_START_FAILURE' ? data(error, 'status') : undefined;
  const signal = stage === 'CLI_START_FAILURE' ? data(error, 'signal') : undefined;
  const code = stage === 'CLI_START_FAILURE' ? data(error, 'code') : undefined;
  const exitCode = typeof status === 'number' && Number.isInteger(status) && status >= 0 && status <= 255 ? status : null;
  const outcome = {
    exitCode,
    signal: typeof signal === 'string' ? nativeSignals.includes(signal as typeof nativeSignals[number]) ? signal as typeof nativeSignals[number] : 'OTHER' as const : null,
    code: typeof code === 'string' ? errorCodes.includes(code as typeof errorCodes[number]) ? code as typeof errorCodes[number] : 'OTHER' as const : null,
  };
  let availability: 'AVAILABLE' | 'UNAVAILABLE' | 'INVALID' | 'NOT_APPLICABLE' = stage === 'CLI_START_FAILURE' ? 'UNAVAILABLE' : 'NOT_APPLICABLE';
  if (stage === 'CLI_START_FAILURE') {
    const captured = data(error, 'stderr');
    try {
      if (typeof captured === 'string') {
        if (Buffer.byteLength(captured, 'utf8') > maxCapturedBytes) { availability = 'INVALID'; parser.unavailable(); }
        else { availability = 'AVAILABLE'; parser.push(Buffer.from(captured, 'utf8')); }
      } else if (captured && typeof captured === 'object' && !isProxy(captured) && Buffer.isBuffer(captured)) {
        // Intrinsic typed-array access avoids overridden Buffer property getters
        // and methods. The parser receives a fresh native view without a copy.
        const length = byteLength.call(captured) as number;
        if (length > maxCapturedBytes) { availability = 'INVALID'; parser.unavailable(); }
        else { availability = 'AVAILABLE'; parser.push(Buffer.from(arrayBuffer.call(captured) as ArrayBuffer, byteOffset.call(captured) as number, length)); }
      } else if (captured !== undefined && captured !== null) { availability = 'INVALID'; parser.unavailable(); }
    } catch { availability = 'INVALID'; parser.unavailable(); }
  }
  return { stage, ...parser.finish(exitCode), outcome, stderr: { availability } };
}
