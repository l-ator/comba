export interface ErrorDetails {
  cause?: unknown;
  code?: unknown;
  message: string;
  name: string;
  stack?: string;
}

export function errorDetails(error: unknown): ErrorDetails {
  if (error instanceof Error) {
    const code = "code" in error ? error.code : undefined;
    return {
      ...(error.cause === undefined
        ? {}
        : { cause: errorDetails(error.cause) }),
      ...(code === undefined ? {} : { code }),
      message: error.message || "Error with no message",
      name: error.name || error.constructor.name || "Error",
      ...(error.stack ? { stack: error.stack } : {}),
    };
  }

  if (typeof error === "string") {
    return { message: error, name: "ThrownString" };
  }

  return {
    message: safeStringify(error),
    name: "NonErrorThrown",
  };
}

function safeStringify(value: unknown): string {
  try {
    const serialized = JSON.stringify(value);
    return serialized === undefined ? String(value) : serialized;
  } catch {
    return String(value);
  }
}
