import { createChallenge, sha, verifySolution } from 'altcha/lib';

const secret = process.env.ALTCHA_SECRET || 'local-altcha-development-secret';
if (process.env.NODE_ENV === 'production' && !process.env.ALTCHA_SECRET) throw new Error('生产环境缺少 ALTCHA_SECRET');

export async function createCaptchaChallenge() {
  return createChallenge({
    algorithm: 'SHA-256',
    cost: Number(process.env.ALTCHA_COST || 500),
    expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    hmacSignatureSecret: secret,
    hmacKeySignatureSecret: secret,
    deriveKey: sha.deriveKey,
  });
}

export async function verifyCaptcha(payloadValue) {
  if (!payloadValue || typeof payloadValue !== 'string' || payloadValue.length > 10000) return false;
  try {
    const normalized = payloadValue.replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(Buffer.from(normalized, 'base64').toString('utf8'));
    if (!payload.challenge?.parameters || !payload.solution) return false;
    const result = await verifySolution({
      challenge: payload.challenge,
      solution: payload.solution,
      hmacSignatureSecret: secret,
      hmacKeySignatureSecret: secret,
      deriveKey: sha.deriveKey,
    });
    return result.verified;
  } catch {
    return false;
  }
}
