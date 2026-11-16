/** Identidad estable: el orden puede cambiar sin cambiar el punto. */
export type PuntoRuta = {
  id: string;
  nombre: string;
  latitud: number;
  longitud: number;
  orden: number;
};
