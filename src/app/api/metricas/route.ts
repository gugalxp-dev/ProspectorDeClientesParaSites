import { metricas } from "@/core/metricas";
import { rota } from "@/lib/http";

export const GET = rota(async () => Response.json(await metricas()));
