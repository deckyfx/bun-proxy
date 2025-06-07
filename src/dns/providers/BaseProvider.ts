export abstract class BaseProvider {
  abstract name: string;
  abstract resolve(query: Buffer): Promise<Buffer>;
}