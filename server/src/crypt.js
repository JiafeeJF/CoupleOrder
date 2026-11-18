import crypto from 'crypto';

// AES-256-GCM 对称加密工具：用于落库加密敏感的资源字段（头像、横幅等图片 data-URL）。
// 密钥由环境变量 IMAGE_ENC_KEY 派生（SHA-256 截断到 32 字节）。
// 存储格式：enc:<iv hex>:<authTag hex>:<ciphertext hex>
// 读取时若值无 enc: 前缀（历史明文数据）则原样返回，保证向后兼容、不损坏旧数据。

function getKey() {
  const secret = process.env.IMAGE_ENC_KEY;
  if (!secret || secret.length < 32) throw new Error('IMAGE_ENC_KEY must be set to a random value of at least 32 characters');
  return crypto.createHash('sha256').update(secret).digest();
}

const ALGO = 'aes-256-gcm';
const IV_LENGTH = 12;

// 加密文本，返回 enc: 前缀的字符串。空值原样返回。
export function encryptResource(value) {
  if (!value) return value;
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

// 解密 enc: 前缀的值。非加密数据（历史明文）或解密失败时安全返回原值，避免抛错中断业务流程。
export function decryptResource(value) {
  if (!value || typeof value !== 'string' || !value.startsWith('enc:')) return value;
  try {
    const parts = value.split(':');
    if (parts.length !== 4) return value;
    const [, ivHex, tagHex, dataHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const data = Buffer.from(dataHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGO, getKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  } catch {
    return value;
  }
}

// 判断某个存储值是否为已加密数据（外部判断用）
export function isEncryptedResource(value) {
  return typeof value === 'string' && value.startsWith('enc:');
}