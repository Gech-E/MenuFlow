export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export async function api<T>(
  path: string,
  body?: object | FormData,
  headers?: HeadersInit,
): Promise<T> {
  const isForm = body instanceof FormData;
  const response = await fetch("/api/v1/" + path, {
    method: body === undefined ? "GET" : "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: {
      ...(body !== undefined ? { "X-MenuFlow-Request": "1" } : {}),
      ...(body && !isForm ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = result?.error?.message ?? result?.message ?? result?.error;
    throw new ApiError(
      typeof detail === "string"
        ? detail
        : "The request could not be completed. Please try again.",
      response.status,
    );
  }
  return result as T;
}

export function messageOf(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Unable to connect. Check your connection and try again.";
}

export function formatMoney(value: number | string, currency = "ETB") {
  const digits = String(value);
  if (!/^-?\d+$/.test(digits)) return "—";
  const sign = digits.startsWith("-") ? "−" : "";
  const cents = digits.replace("-", "").padStart(3, "0");
  return (
    sign +
    cents.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, ",") +
    "." +
    cents.slice(-2) +
    " " +
    currency
  );
}

export function minorUnits(value: string) {
  if (!/^\d+(\.\d{1,2})?$/.test(value))
    throw new Error("Enter an amount with up to two decimal places.");
  const [whole, fraction = ""] = value.split(".");
  return (whole + fraction.padEnd(2, "0")).replace(/^0+(?=\d)/, "");
}
