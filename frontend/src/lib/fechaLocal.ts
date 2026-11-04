/** Convierte una fecha ISO al valor `YYYY-MM-DDTHH:mm` en hora local que espera `datetime-local`. */
export function isoADatetimeLocal(iso: string): string {
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return '';

  const dosDigitos = (valor: number) => String(valor).padStart(2, '0');
  const anio = String(fecha.getFullYear()).padStart(4, '0');
  return (
    `${anio}-${dosDigitos(fecha.getMonth() + 1)}-${dosDigitos(fecha.getDate())}` +
    `T${dosDigitos(fecha.getHours())}:${dosDigitos(fecha.getMinutes())}`
  );
}
