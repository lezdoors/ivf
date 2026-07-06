export default function handler(_req: any, res: any) {
  res.status(200).json({ pong: true, node: process.version });
}
