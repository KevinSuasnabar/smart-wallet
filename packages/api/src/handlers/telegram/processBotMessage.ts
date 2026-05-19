import { Bot, webhookCallback } from "grammy";
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2, Context } from "aws-lambda";

// 1. Inicializar el bot leyendo el Token desde las variables de entorno de Node.js
const bot = new Bot(process.env.TELEGRAM_TOKEN || "");

// 2. Definir el comando /gasto y su lógica de parseo
bot.command("gasto", async (ctx) => {
  const payload = ctx.match?.trim();

  if (!payload) {
    return ctx.reply("❌ Formato incorrecto. Usa:\n/gasto [monto] [categoría] [descripción]");
  }

  // Expresión regular para separar: Monto (número), Categoría (una palabra), Descripción (todo lo demás)
  const regex = /^([\d.]+)\s+(\S+)\s+(.+)$/;
  const match = regex.exec(payload);

  if (!match) {
    return ctx.reply("❌ No entendí el formato. Asegúrate de separar con espacios.\nEjemplo: `/gasto 15.50 comida Almuerzo` Envíalo así.", { parse_mode: "Markdown" });
  }

  const [_, amountStr, category, description] = match;
  const amount = parseFloat(amountStr ?? "0");

  // LOG DE CONTROL: Imprimir en CloudWatch lo extraído con éxito
  console.log("=== DATOS EXTRAÍDOS DEL COMANDO ===");
  console.log(`Monto: ${amount} | Categoría: ${category} | Descripción: ${description}`);

  // Responder al usuario con el formato final simulado
  await ctx.reply(`✅ *Gasto Registrado (Simulado)*\n💰 *Monto:* S/. ${amount.toFixed(2)}\n🏷️ *Categoría:* ${category?.toLowerCase() ?? ""}\n📝 *Nota:* ${description}`, {
    parse_mode: "Markdown"
  });
});

const telegramExecute = webhookCallback(
  bot,
  "aws-lambda",
  "return", // onTimeout: qué hacer si expira (retornar en vez de lanzar error)
  5000      // timeoutMilliseconds: los 5 segundos de límite
);

// 4. Handler principal que invoca AWS Lambda con tipado estricto para API Gateway v2
export const handler = async (
  event: APIGatewayProxyEventV2,
  context: Context
): Promise<APIGatewayProxyResultV2> => {
  // Le dice a AWS que responda apenas termine la lógica de grammY, sin colgarse esperando promesas muertas
  context.callbackWaitsForEmptyEventLoop = false;

  try {
    // Formatear cabeceras para que coincidan exactamente con lo que espera grammY, evitando quejas de ESLint
    const formattedEvent = {
      ...event,
      headers: event.headers as Record<string, string>
    };

    // Parsear el body de forma segura (soportando strings u objetos directos)
    const body = event.body ? (typeof event.body === "string" ? JSON.parse(event.body) : event.body) : null;
    const telegramUserId = body?.message?.from?.id;

    // Leer tu ID de Telegram desde las variables de entorno de Node.js
    const MY_TELEGRAM_ID = Number(process.env.MY_TELEGRAM_ID);

    // LOGS DE DIAGNÓSTICO: Validación de identidades en CloudWatch
    console.log("=== [DEBUG TELEGRAM] ===");
    console.log("ID recibido de Telegram:", telegramUserId, "Tipo:", typeof telegramUserId);
    console.log("Tu ID configurado en AWS:", MY_TELEGRAM_ID, "Tipo:", typeof MY_TELEGRAM_ID);
    console.log("¿Son iguales?:", telegramUserId === MY_TELEGRAM_ID);

    // Filtro de seguridad por ID único de Telegram
    if (!telegramUserId || telegramUserId !== MY_TELEGRAM_ID) {
      console.warn(`[WARN] Intento de acceso no autorizado o ID inválido: ${telegramUserId}`);
      return {
        statusCode: 200,
        body: JSON.stringify({ ok: false, error: "Unauthorized" })
      };
    }

    // Ceder el control del enrutamiento de comandos a grammY pasándole una función asíncrona limpia para tsc
    const result = await telegramExecute(formattedEvent, context, async () => {});

    console.log("=== [DEBUG] RESPUESTA GENERADA POR GRAMMY ===");
    console.log(JSON.stringify(result, null, 2));

    // Si grammY devuelve undefined o un formato inesperado, aseguramos un 200 OK estructurado para API Gateway
    if (!result || !('statusCode' in result)) {
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ok: true })
      };
    }

    return result;

  } catch (error: any) {
    console.error("💥 Error crítico en el handler:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Internal Server Error" }),
    };
  }
};
