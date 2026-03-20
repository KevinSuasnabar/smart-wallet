import { APIGatewayProxyEvent } from "aws-lambda";
import { ok } from "@lambda-project/shared";

export const helloExpenses = async (event: APIGatewayProxyEvent) => {
  return ok({ message: "Hello from expenses with github actions 2" });
};
