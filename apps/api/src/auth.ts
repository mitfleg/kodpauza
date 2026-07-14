import type { FastifyReply, FastifyRequest } from 'fastify';
import jwt from 'jsonwebtoken';
import { config } from './config.js';
import { isDisposableEmail } from './disposable-email.js';
import { prisma } from './prisma.js';

export type AuthUser = {
  id: string;
  email: string;
  role: 'developer' | 'advertiser' | 'admin';
};

declare module 'fastify' {
  interface FastifyRequest {
    authUser?: AuthUser;
  }
}

export function signToken(user: AuthUser): string {
  return jwt.sign({ email: user.email, role: user.role }, config.jwtSecret, {
    algorithm: 'HS256',
    audience: config.jwtAudience,
    expiresIn: config.jwtExpiresIn as jwt.SignOptions['expiresIn'],
    issuer: config.jwtIssuer,
    subject: user.id,
  });
}

export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  const header = request.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;
  if (!token) return reply.code(401).send({ error: 'Нужна авторизация.' });

  try {
    const payload = jwt.verify(token, config.jwtSecret, {
      algorithms: ['HS256'],
      audience: config.jwtAudience,
      issuer: config.jwtIssuer,
    });
    if (typeof payload === 'string' || !payload.sub) throw new Error('Invalid token payload.');
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, role: true, emailVerifiedAt: true },
    });
    if (!user) return reply.code(401).send({ error: 'Пользователь не найден.' });
    if (!user.emailVerifiedAt) {
      return reply.code(403).send({
        error: 'Сначала подтвердите адрес электронной почты.',
        verificationRequired: true,
        email: user.email,
      });
    }
    if (isDisposableEmail(user.email, config.disposableEmailDomains)) {
      return reply.code(403).send({
        error: 'Временные и одноразовые почтовые адреса не принимаются.',
        code: 'DISPOSABLE_EMAIL',
      });
    }
    request.authUser = { id: user.id, email: user.email, role: user.role };
  } catch {
    return reply.code(401).send({ error: 'Недействительный токен.' });
  }
}

export function requireRole(...roles: AuthUser['role'][]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    await authenticate(request, reply);
    if (reply.sent) return;
    if (!request.authUser || !roles.includes(request.authUser.role)) {
      return reply.code(403).send({ error: 'Недостаточно прав.' });
    }
  };
}
