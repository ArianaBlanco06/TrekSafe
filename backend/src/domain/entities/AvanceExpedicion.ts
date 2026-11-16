export type AvanceExpedicion = {
  id: string; solicitudId: string; expedicionId: string;
  punto: { id: string; nombre: string; orden: number };
  registradoEn: string; nota: string | null;
};
