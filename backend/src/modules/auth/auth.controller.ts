import type { CookieOptions, Request, Response } from "express";
import { env } from "../../config/env.js";
import { SESSION_COOKIE } from "../../middlewares/authenticate.js";
import * as authService from "./auth.service.js";

/**
 * Configuração do cookie de sessão:
 * - httpOnly: scripts da página não conseguem ler o cookie (protege contra roubo por XSS);
 * - sameSite "lax": o navegador não envia o cookie em requisições disparadas por outros sites;
 * - secure: em produção, só trafega por HTTPS.
 */
function cookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
    path: "/",
  };
}

export async function login(req: Request, res: Response) {
  const { token, expiresAt, user } = await authService.login(req.body);
  res.cookie(SESSION_COOKIE, token, { ...cookieOptions(), expires: expiresAt });
  res.json({ user });
}

export async function logout(req: Request, res: Response) {
  await authService.logout(req.auth!.sessionId);
  res.clearCookie(SESSION_COOKIE, cookieOptions());
  res.status(204).end();
}

export async function me(req: Request, res: Response) {
  res.json({ user: await authService.getCurrentUser(req.auth!.user.id) });
}

export async function changePassword(req: Request, res: Response) {
  const user = await authService.changePassword(req.auth!.user.id, req.auth!.sessionId, req.body);
  res.json({ user });
}
