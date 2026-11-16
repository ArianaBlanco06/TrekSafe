import { ServicioPuntosRuta } from '../../application/services/servicioPuntosRuta.js';
import { getSupabaseAdmin } from '../database/supabase.js';
import { RepositorioPuntosRuta } from '../repositories/RepositorioPuntosRuta.js';

export function crearServicioPuntosRuta(): ServicioPuntosRuta {
  const repositorio = new RepositorioPuntosRuta(getSupabaseAdmin());
  return new ServicioPuntosRuta(repositorio, repositorio);
}
