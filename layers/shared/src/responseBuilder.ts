type ResponseBody = Record<string, unknown> | unknown[];

export const ok = (body: ResponseBody) => ({
  statusCode: 200,
  body: JSON.stringify(body),
});

export const created = (body: ResponseBody) => ({
  statusCode: 201,
  body: JSON.stringify(body),
});

export const badRequest = (message: string) => ({
  statusCode: 400,
  body: JSON.stringify({ error: message }),
});

export const notFound = (message: string) => ({
  statusCode: 404,
  body: JSON.stringify({ error: message }),
});

export const internalError = (message = "Internal server error") => ({
  statusCode: 500,
  body: JSON.stringify({ error: message }),
});
