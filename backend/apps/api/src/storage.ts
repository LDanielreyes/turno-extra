import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

/**
 * Archivos de documentos en Neon Object Storage (S3, bucket privado). Las credenciales, el endpoint y la región
 * salen de las variables AWS_* estándar (`neon env pull`). Sin ellas el almacenamiento queda "no disponible".
 */
const BUCKET = process.env.DOCS_BUCKET ?? 'documentos';
let client: S3Client | null | undefined;

const s3 = () => {
  if (client === undefined) {
    client = process.env.AWS_ENDPOINT_URL_S3 && process.env.AWS_ACCESS_KEY_ID ? new S3Client({ forcePathStyle: true }) : null;
  }
  return client;
};

export const storageEnabled = () => s3() !== null;

export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const FILE_TYPES = ['image/jpeg', 'image/png', 'application/pdf'] as const;
export type FileType = (typeof FILE_TYPES)[number];

/** El tipo MIME declarado no basta: se comprueba la firma del archivo. */
export function sniff(buf: Buffer): FileType | null {
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.length > 5 && buf.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  return null;
}

export async function putFile(key: string, body: Buffer, contentType: FileType) {
  await s3()!.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: body, ContentType: contentType }));
}

export async function getFile(key: string) {
  const res = await s3()!.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  return res.Body ? Buffer.from(await res.Body.transformToByteArray()) : null;
}

export async function deleteFiles(keys: string[]) {
  const c = s3();
  if (!c) return;
  await Promise.allSettled(keys.map((Key) => c.send(new DeleteObjectCommand({ Bucket: BUCKET, Key }))));
}
