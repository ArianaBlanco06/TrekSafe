import { verificarContratoPlantillaDAO } from '../contratoIPlantillaDAO.js';
import { DAOPlantillasMemoria } from './DAOPlantillasMemoria.js';

verificarContratoPlantillaDAO('DAOPlantillasMemoria', () => new DAOPlantillasMemoria());
