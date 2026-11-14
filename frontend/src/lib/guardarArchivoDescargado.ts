/** Solicita el guardado solo de un archivo cuyo cuerpo ya se recibió completo. */
export function guardarArchivoDescargado(archivo: Readonly<{ contenido: Blob; nombre: string }>): void {
  const enlace = document.createElement('a');
  const url = URL.createObjectURL(archivo.contenido);
  try {
    enlace.href = url;
    enlace.download = archivo.nombre;
    document.body.appendChild(enlace);
    enlace.click();
  } finally {
    enlace.remove();
    // El navegador dispone de un turno para comenzar la descarga antes de liberar el Blob.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
