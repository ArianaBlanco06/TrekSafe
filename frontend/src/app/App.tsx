import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAutenticacion, AuthSessionBridge } from '@/context/ContextoAutenticacion';
import { ThemeProvider } from '@/context/ContextoTema';
import { RutaProtegida } from '@/components/RutaProtegida';
import { RescatistaLayout } from '@/components/RescatistaLayout';
import { SenderistaLayout } from '@/components/SenderistaLayout';
import { PaginaIniciarSesion } from '@/pages/PaginaIniciarSesion';
import { PaginaRegistroSenderista } from '@/pages/PaginaRegistroSenderista';
import { PaginaRegistroRescatista } from '@/pages/PaginaRegistroRescatista';
import { PaginaInicioRescatista } from '@/pages/PaginaInicioRescatista';
import { PaginaConsolaRescate } from '@/pages/PaginaConsolaRescate';
import { PaginaDetalleAlertaRescate } from '@/pages/PaginaDetalleAlertaRescate';
import { PaginaHistorialRescatista } from '@/pages/PaginaHistorialRescatista';
import { PaginaInicioSenderista } from '@/pages/PaginaInicioSenderista';
import { PaginaPerfilSenderista } from '@/pages/PaginaPerfilSenderista';
import { PaginaFichaMedica } from '@/pages/PaginaFichaMedica';
import { PaginaContactos } from '@/pages/PaginaContactos';
import { PaginaHistorialExpediciones } from '@/pages/PaginaHistorialExpediciones';
import { PaginaPrivacidad } from '@/pages/PaginaPrivacidad';
import { PaginaRevocacionDatos } from '@/pages/PaginaRevocacionDatos';
import { PaginaListaExpediciones } from '@/pages/PaginaListaExpediciones';
import { PaginaCrearExpedicion } from '@/pages/PaginaCrearExpedicion';
import { PaginaExpedicionActiva } from '@/pages/PaginaExpedicionActiva';
import { PaginaRetornoConfirmado } from '@/pages/PaginaRetornoConfirmado';

function RedireccionRaiz() {
  const { estaAutenticado, usuario } = useAutenticacion();
  if (!estaAutenticado || !usuario) return <Navigate to="/iniciar-sesion" replace />;
  return (
    <Navigate to={usuario.rol === 'rescatista' ? '/rescatista/consola' : '/senderista'} replace />
  );
}

export function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <AuthSessionBridge />
          <Routes>
            <Route path="/" element={<RedireccionRaiz />} />

            {/* Rutas canónicas */}
            <Route path="/iniciar-sesion" element={<PaginaIniciarSesion />} />
            <Route path="/registro/senderista" element={<PaginaRegistroSenderista />} />
            <Route path="/registro/rescatista" element={<PaginaRegistroRescatista />} />

            {/* Redirects desde rutas antiguas */}
            <Route path="/login" element={<Navigate to="/iniciar-sesion" replace />} />
            <Route path="/register/hiker" element={<Navigate to="/registro/senderista" replace />} />
            <Route path="/register/rescuer" element={<Navigate to="/registro/rescatista" replace />} />

            <Route
              path="/senderista"
              element={
                <RutaProtegida rol="senderista">
                  <SenderistaLayout />
                </RutaProtegida>
              }
            >
              <Route index element={<PaginaInicioSenderista />} />
              <Route path="perfil" element={<PaginaPerfilSenderista />} />
              <Route path="perfil/medica" element={<PaginaFichaMedica />} />
              <Route path="perfil/contactos" element={<PaginaContactos />} />
              <Route path="perfil/historial" element={<PaginaHistorialExpediciones />} />
              <Route path="perfil/privacidad" element={<PaginaPrivacidad />} />
              <Route path="perfil/privacidad/solicitud" element={<PaginaRevocacionDatos />} />
              <Route path="expedicion" element={<PaginaListaExpediciones />} />
              <Route path="expedicion/activa" element={<PaginaExpedicionActiva />} />
              <Route path="expedicion/confirmada" element={<PaginaRetornoConfirmado />} />
              <Route path="expedicion/nueva" element={<PaginaCrearExpedicion />} />
            </Route>

            <Route
              path="/rescatista"
              element={
                <RutaProtegida rol="rescatista">
                  <RescatistaLayout />
                </RutaProtegida>
              }
            >
              <Route index element={<Navigate to="consola" replace />} />
              <Route path="consola" element={<PaginaConsolaRescate />} />
              <Route path="alertas" element={<PaginaInicioRescatista />} />
              <Route path="alertas/:expedicionId" element={<PaginaDetalleAlertaRescate />} />
              <Route path="historial" element={<PaginaHistorialRescatista />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}
